import { join } from 'node:path';
import { parseOptions } from '../lib/arguments.mjs';
import { probeBrowserCapability } from '../lib/browser-capability.mjs';
import { CommandFailure, CommandInterrupted } from '../lib/errors.mjs';
import {
  readLockfile,
  selectHostNativePackages,
  validateLockfileObject
} from '../lib/lockfile.mjs';
import { importFrom } from '../lib/module-loader.mjs';
import { npmInvocation } from '../lib/npm.mjs';
import { detectPlatform, validateRuntimeEnvironment } from '../lib/platform.mjs';
import { runChild } from '../lib/process-runner.mjs';
import { projectRoot } from '../lib/repository.mjs';

const setupHelp = `Usage: npm run setup -- [--browser]

Validate the runtime and portable lockfile, run a clean npm install, and probe the build toolchain.

Options:
  --browser  Install or validate the optional Chromium capability
  --help     Show this help`;

function moduleValue(module) {
  return module.default ?? module;
}

export async function probeBuildToolchain({ root = projectRoot } = {}) {
  const webRoot = join(root, 'apps', 'web');

  const typescript = moduleValue(await importFrom(root, 'typescript'));
  if (typeof typescript.transpileModule !== 'function') {
    throw new CommandFailure('TypeScript API probe failed');
  }
  typescript.transpileModule('const value: number = 1;', {
    compilerOptions: { module: typescript.ModuleKind.ESNext }
  });

  const viteModule = await importFrom(webRoot, 'vite');
  const vite = moduleValue(viteModule);
  if (typeof vite.createServer !== 'function' || typeof vite.build !== 'function') {
    throw new CommandFailure('Vite API probe failed');
  }

  const rolldownModule = await importFrom(webRoot, 'rolldown');
  const rolldown = moduleValue(rolldownModule);
  if (typeof rolldown.build !== 'function') {
    throw new CommandFailure('Rolldown API probe failed');
  }
  const bundle = await rolldown.build({
    input: 'virtual:probe',
    write: false,
    output: { format: 'es' },
    plugins: [
      {
        name: 'setup-probe',
        resolveId(id) {
          return id === 'virtual:probe' ? id : null;
        },
        load(id) {
          return id === 'virtual:probe' ? 'export const value = 1;' : null;
        }
      }
    ]
  });
  await bundle?.close?.();

  const lightningModule = await importFrom(webRoot, 'lightningcss');
  const lightningcss = moduleValue(lightningModule);
  if (typeof lightningcss.transform !== 'function') {
    throw new CommandFailure('Lightning CSS API probe failed');
  }
  lightningcss.transform({
    filename: 'probe.css',
    code: Buffer.from('.x{color:red}')
  });

  const esbuildModule = await importFrom(webRoot, 'esbuild');
  const esbuild = moduleValue(esbuildModule);
  if (typeof esbuild.transform !== 'function') {
    throw new CommandFailure('esbuild API probe failed');
  }
  await esbuild.transform('const value: number = 1', { loader: 'ts' });
}

const defaultDependencies = {
  runtime: () => validateRuntimeEnvironment(),
  platform: () => detectPlatform(),
  readLockfile: () => readLockfile(),
  validateLockfile: (lock) => validateLockfileObject(lock),
  selectHost: (lock, platformInfo) => selectHostNativePackages(lock, platformInfo),
  install: ({ signal }) =>
    runChild({
      ...npmInvocation(['ci']),
      cwd: projectRoot,
      stdio: 'inherit',
      signal,
      stage: 'npm ci'
    }),
  probeNative: () => probeBuildToolchain(),
  probeBrowser: ({ platformInfo, signal }) =>
    probeBrowserCapability({ install: true, platformInfo, signal })
};

async function runStage(name, stdout, operation) {
  stdout(`[setup] ${name}`);
  try {
    return await operation();
  } catch (error) {
    if (error instanceof CommandInterrupted) throw error;
    if (error instanceof CommandFailure && error.message.startsWith(`${name}:`)) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new CommandFailure(`${name}: ${message}`, { cause: error });
  }
}

export async function runSetup({
  browser = false,
  signal,
  stdout = console.log,
  dependencies = {}
} = {}) {
  const services = { ...defaultDependencies, ...dependencies };
  await runStage('validate-runtime', stdout, () => services.runtime());
  const platformInfo = await runStage('detect-platform', stdout, () => services.platform());
  const { lock, nativePackages } = await runStage('validate-lockfile', stdout, async () => {
    const value = await services.readLockfile();
    services.validateLockfile(value);
    return { lock: value, nativePackages: services.selectHost(value, platformInfo) };
  });
  await runStage('install', stdout, () =>
    services.install({ signal, platformInfo, lock, nativePackages })
  );
  await runStage('probe-native', stdout, () =>
    services.probeNative({ signal, platformInfo, lock, nativePackages })
  );
  if (browser) {
    await runStage('probe-browser', stdout, () =>
      services.probeBrowser({ signal, platformInfo, lock, nativePackages })
    );
  }
}

export const setupCommand = {
  name: 'setup',
  summary: 'Install dependencies and validate native capabilities',
  async execute(argv, context = {}) {
    const { help, values } = parseOptions('setup', argv, {
      browser: { type: 'boolean' }
    });
    if (help) {
      (context.stdout ?? console.log)(setupHelp);
      return;
    }
    await runSetup({
      browser: values.browser === true,
      signal: context.signal,
      stdout: context.stdout ?? console.log
    });
  }
};
