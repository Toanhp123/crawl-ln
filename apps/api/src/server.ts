import { once } from 'node:events';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createAppRuntime, type AppRuntime } from './app.js';
import { environment, type Environment } from './platform/config/environment.js';

const FORCE_CLOSE_TIMEOUT_MS = 5_000;

export interface RunningServer {
  url: string;
  close(): Promise<void>;
}

async function closeHttpServer(server: Server): Promise<void> {
  server.closeIdleConnections?.();

  let forceTimer: NodeJS.Timeout | undefined;
  try {
    await new Promise<void>((resolveClose, rejectClose) => {
      forceTimer = setTimeout(() => {
        server.closeAllConnections?.();
      }, FORCE_CLOSE_TIMEOUT_MS);
      forceTimer.unref?.();

      server.close((error) => {
        if (error && (error as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING') {
          rejectClose(error);
          return;
        }
        resolveClose();
      });
    });
  } finally {
    if (forceTimer) clearTimeout(forceTimer);
  }
}

export async function startListeningRuntime(input: {
  runtime: AppRuntime;
  environment: Pick<Environment, 'host' | 'port'>;
}): Promise<RunningServer> {
  let server: Server | undefined;
  try {
    await input.runtime.ready;
    server = input.runtime.app.listen(input.environment.port, input.environment.host);
    await once(server, 'listening');
  } catch (error) {
    if (server) await closeHttpServer(server).catch(() => undefined);
    await input.runtime.lifecycle.stop();
    throw error;
  }

  const listeningServer = server;
  const address = listeningServer.address();
  if (!address || typeof address === 'string') {
    await closeHttpServer(listeningServer).catch(() => undefined);
    await input.runtime.lifecycle.stop();
    throw new Error('HTTP server did not expose a TCP listening address');
  }

  const url = `http://${input.environment.host}:${(address as AddressInfo).port}`;
  let closePromise: Promise<void> | undefined;
  return {
    url,
    close() {
      closePromise ??= closeHttpServer(listeningServer).finally(() =>
        input.runtime.lifecycle.stop()
      );
      return closePromise;
    }
  };
}

export function startServer(
  options: { environment?: Environment; publicDirectory?: string } = {}
): Promise<RunningServer> {
  const runtimeEnvironment = options.environment ?? environment;
  return startListeningRuntime({
    runtime: createAppRuntime({
      environment: runtimeEnvironment,
      publicDirectory: options.publicDirectory
    }),
    environment: runtimeEnvironment
  });
}
