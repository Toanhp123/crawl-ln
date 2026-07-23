import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseOptions } from '../lib/arguments.mjs';
import { readStartableBuild } from '../lib/build-manifest.mjs';
import { CommandFailure, CommandInterrupted } from '../lib/errors.mjs';
import { projectRoot } from '../lib/repository.mjs';

function helpText() {
  return [
    'Usage: node scripts/cli.mjs start',
    '',
    'Validate and start the complete production build in one Node process.',
    '',
    'Options:',
    '  --help  Show this help'
  ].join('\n');
}

async function applicationVersion(root) {
  return JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version;
}

function waitForAbort(signal) {
  if (!signal) return new Promise(() => undefined);
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolveWait) =>
    signal.addEventListener('abort', resolveWait, { once: true })
  );
}

export async function startBuiltApplication({
  distRoot = join(projectRoot, 'dist'),
  applicationVersion: expectedApplicationVersion,
  importServer = (url) => import(url),
  signal,
  stdout = console.log
} = {}) {
  const version = expectedApplicationVersion ?? (await applicationVersion(projectRoot));
  const build = await readStartableBuild(distRoot, version);
  const module = await importServer(pathToFileURL(build.serverEntry).href);
  if (typeof module.startServer !== 'function') {
    throw new CommandFailure('Built server entry does not export startServer');
  }
  const running = await module.startServer({
    publicDirectory: build.publicDirectory
  });
  stdout(`Novel Tool running at ${running.url}`);
  await waitForAbort(signal);
  await running.close();
  throw new CommandInterrupted();
}

export const startCommand = {
  name: 'start',
  summary: 'Start the complete production build',
  async execute(argv, context = {}) {
    const { help } = parseOptions('start', argv, {});
    if (help) {
      (context.stdout ?? console.log)(helpText());
      return;
    }
    return startBuiltApplication({
      signal: context.signal,
      stdout: context.stdout
    });
  }
};
