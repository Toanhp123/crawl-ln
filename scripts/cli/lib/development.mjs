import { join } from 'node:path';
import { CommandFailure, CommandInterrupted } from './errors.mjs';
import { importFrom } from './module-loader.mjs';
import { startCooperativeNode } from './process-runner.mjs';
import { projectRoot } from './repository.mjs';

const apiRoot = join(projectRoot, 'apps/api');
const webRoot = join(projectRoot, 'apps/web');

function closeServicesOnce(services) {
  let closing;
  return () => {
    closing ??= Promise.allSettled(services.map((service) => service.close())).then((results) => {
      const failure = results.find((result) => result.status === 'rejected');
      if (failure) throw failure.reason;
    });
    return closing;
  };
}

export async function superviseDevelopment(services, { signal } = {}) {
  if (services.length === 0) throw new CommandFailure('Development started zero services');
  const closeAll = closeServicesOnce(services);

  if (signal?.aborted) {
    await closeAll();
    throw new CommandInterrupted('Development interrupted');
  }

  let removeAbort = () => {};
  const interrupted = new Promise((resolve) => {
    if (!signal) return;
    const onAbort = () => resolve({ type: 'interrupted' });
    signal.addEventListener('abort', onAbort, { once: true });
    removeAbort = () => signal.removeEventListener('abort', onAbort);
  });
  const serviceOutcomes = services.map((service) =>
    Promise.resolve(service.closed).then(
      () => ({ type: 'stopped', service }),
      (error) => ({ type: 'failed', service, error })
    )
  );

  try {
    const outcome = await Promise.race([...serviceOutcomes, interrupted]);
    let cleanupError;
    try {
      await closeAll();
    } catch (error) {
      cleanupError = error;
    }
    if (outcome.type === 'interrupted') {
      throw new CommandInterrupted(
        cleanupError ? 'Development interrupted during cleanup' : 'Development interrupted',
        cleanupError ? { cause: cleanupError } : undefined
      );
    }
    if (outcome.type === 'failed') throw outcome.error;
    if (cleanupError) throw cleanupError;
    throw new CommandFailure(`${outcome.service.name} development service stopped unexpectedly`);
  } finally {
    removeAbort();
  }
}

export function developmentProxyTarget({ apiUrl, environment = process.env } = {}) {
  if (apiUrl) return new URL(apiUrl).origin;
  const rawPort = environment.PORT ?? '3000';
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new CommandFailure(`Invalid development API PORT: ${rawPort}`);
  }
  return `http://127.0.0.1:${port}`;
}

async function defaultPrepare(targets) {
  const { prepareInternalPackages } = await import('./internal-packages.mjs');
  return prepareInternalPackages(targets);
}

async function defaultStartApi({ environment }) {
  const service = await startCooperativeNode({
    entry: join(apiRoot, 'src/dev-entry.ts'),
    cwd: projectRoot,
    env: environment,
    readyTimeoutMs: 15_000,
    stage: 'API development service'
  });
  return { name: 'api', ...service };
}

async function defaultStartWeb({ proxyTarget }) {
  const vite = await importFrom(webRoot, 'vite');
  const server = await vite.createServer({
    root: webRoot,
    server: {
      host: '0.0.0.0',
      port: 5173,
      proxy: { '/api': proxyTarget }
    }
  });

  let resolveClosed;
  let rejectClosed;
  const closed = new Promise((resolve, reject) => {
    resolveClosed = resolve;
    rejectClosed = reject;
  });
  closed.catch(() => undefined);
  server.httpServer?.once('close', resolveClosed);
  server.httpServer?.once('error', rejectClosed);
  try {
    await server.listen();
  } catch (error) {
    await server.close().catch(() => undefined);
    throw error;
  }
  const url = server.resolvedUrls?.local?.[0] ?? 'http://127.0.0.1:5173/';
  let closePromise;
  return {
    name: 'web',
    url: url.replace(/\/$/, ''),
    closed,
    close() {
      closePromise ??= server.close();
      return closePromise;
    }
  };
}

export async function runDevelopment({
  target,
  environment = process.env,
  signal,
  stdout = console.log,
  prepare = defaultPrepare,
  startApi = defaultStartApi,
  startWeb = defaultStartWeb,
  supervise = superviseDevelopment
} = {}) {
  const prepareTargets =
    target === 'api'
      ? ['shared', 'sdk']
      : target === 'web'
        ? ['shared', 'reader-engine']
        : ['shared', 'sdk', 'reader-engine'];
  await prepare(prepareTargets);

  const services = [];
  try {
    let apiService;
    if (target !== 'web') {
      apiService = await startApi({ environment, signal });
      services.push(apiService);
    }
    if (target !== 'api') {
      const proxyTarget = developmentProxyTarget({ apiUrl: apiService?.url, environment });
      services.push(await startWeb({ environment, signal, proxyTarget }));
    }

    const api = services.find((service) => service.name === 'api');
    const web = services.find((service) => service.name === 'web');
    if (web) stdout(`[dev] Web: ${web.url}`);
    if (api) stdout(`[dev] API health: ${api.url}/health`);
    await supervise(services, { signal });
  } catch (error) {
    if (services.length > 0) {
      await Promise.allSettled(services.map((service) => service.close()));
    }
    throw error;
  }
}
