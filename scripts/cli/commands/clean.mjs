import { existsSync, readFileSync } from 'node:fs';
import { readdir, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, parse, posix, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { parseOptions } from '../lib/arguments.mjs';
import { CommandFailure } from '../lib/errors.mjs';
import { projectRoot as defaultProjectRoot } from '../lib/repository.mjs';
import {
  deduplicateDeletionTargets,
  isDescendant,
  resolveDevelopmentDataPaths
} from '../lib/data-paths.mjs';

const GENERATED_DIRECTORIES = [
  'dist',
  'packages/shared/dist',
  'packages/source-plugin-sdk/dist',
  'packages/reader-engine/dist',
  'apps/api/dist',
  'apps/web/dist',
  'plugins/novelcool/dist',
  'apps/web/node_modules/.vite',
  'coverage',
  'playwright-report',
  'test-results',
  '.nyc_output'
];
const MARKER_FILE = '.novel-tool-runtime.json';

function helpText() {
  return [
    'Usage: node scripts/cli.mjs clean [--data] [--yes]',
    '',
    'Remove generated build, cache, report, and temporary paths.',
    'Use --data to also reset application-owned development data.',
    '',
    'Options:',
    '  --data  Also reset development data after safety validation',
    '  --yes   Skip only the data-reset confirmation prompt',
    '  --help  Show this help'
  ].join('\n');
}

export function isSafeDeletionTarget(
  repositoryRoot,
  candidate,
  pathApi = posix,
  homeDirectory = homedir()
) {
  const repo = pathApi.resolve(repositoryRoot);
  const target = pathApi.resolve(candidate);
  const home = pathApi.resolve(homeDirectory);
  if (target === repo || target === home || target === pathApi.parse(target).root) return false;
  const relative = pathApi.relative(repo, target);
  return relative !== '' && !relative.startsWith('..') && !pathApi.isAbsolute(relative);
}

async function collectTsBuildInfo(root) {
  const matches = [];
  for (const scope of ['apps', 'packages', 'plugins']) {
    const start = join(root, scope);
    if (!existsSync(start)) continue;
    const stack = [start];
    while (stack.length) {
      const directory = stack.pop();
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) stack.push(path);
        else if (entry.name.endsWith('.tsbuildinfo')) matches.push(path);
      }
    }
  }
  return matches;
}

export async function cleanGeneratedArtifacts({ projectRoot = defaultProjectRoot } = {}) {
  const candidates = GENERATED_DIRECTORIES.map((path) => join(projectRoot, path));
  for (const entry of await readdir(projectRoot, { withFileTypes: true })) {
    if (
      entry.isDirectory() &&
      (/^\.dist-staging-/.test(entry.name) || /^\.dist-backup-/.test(entry.name))
    )
      candidates.push(join(projectRoot, entry.name));
  }
  candidates.push(...(await collectTsBuildInfo(projectRoot)));
  const removed = [];
  for (const target of candidates) {
    if (!existsSync(target)) continue;
    if (!isSafeDeletionTarget(projectRoot, target, await import('node:path'), homedir()))
      throw new CommandFailure(`Unsafe generated path: ${target}`);
    await rm(target, { recursive: true, force: true });
    removed.push(resolve(target));
  }
  return { removed };
}

function readMarker(directory) {
  const markerPath = join(directory, MARKER_FILE);
  if (!existsSync(markerPath)) return undefined;
  try {
    const value = JSON.parse(readFileSync(markerPath, 'utf8'));
    if (value?.formatVersion !== 1 || typeof value?.instanceId !== 'string') return undefined;
    return value;
  } catch {
    return undefined;
  }
}

function assertOwnedDirectory(path, expectedInstanceId, { allowDefault = false } = {}) {
  if (!existsSync(path)) return;
  const marker = readMarker(path);
  if (!marker && !allowDefault)
    throw new CommandFailure(`Refusing unmarked data directory: ${path}`);
  if (marker && expectedInstanceId && marker.instanceId !== expectedInstanceId)
    throw new CommandFailure(`Data marker instance mismatch: ${path}`);
  return marker;
}

async function confirmReset(targets, stdout) {
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await terminal.question('Delete the listed Novel Tool development data? [y/N] ');
    return /^y(?:es)?$/i.test(answer.trim());
  } finally {
    terminal.close();
  }
}

export async function cleanDevelopmentData({
  projectRoot = defaultProjectRoot,
  environment = process.env,
  yes = false,
  homeDirectory = homedir(),
  stdout = console.log,
  confirm = confirmReset
} = {}) {
  const paths = resolveDevelopmentDataPaths(projectRoot, environment);
  const primaryMarker = assertOwnedDirectory(paths.storageDirectory, undefined, {
    allowDefault: !paths.custom.storage
  });
  const targets = [paths.storageDirectory];
  if (
    !isDescendant(paths.storageDirectory, paths.databasePath) &&
    paths.databasePath !== paths.storageDirectory
  ) {
    assertOwnedDirectory(dirname(paths.databasePath), primaryMarker?.instanceId, {
      allowDefault: false
    });
    targets.push(paths.databasePath, `${paths.databasePath}-wal`, `${paths.databasePath}-shm`);
  }
  if (
    !isDescendant(paths.storageDirectory, paths.pluginDirectory) &&
    paths.pluginDirectory !== paths.storageDirectory
  ) {
    assertOwnedDirectory(paths.pluginDirectory, primaryMarker?.instanceId, { allowDefault: false });
    targets.push(paths.pluginDirectory);
  }
  const deletions = deduplicateDeletionTargets(targets.filter((target) => existsSync(target)));
  for (const target of deletions) {
    const absolute = resolve(target);
    if (
      absolute === resolve(projectRoot) ||
      absolute === resolve(homeDirectory) ||
      absolute === parse(absolute).root
    )
      throw new CommandFailure(`Unsafe data path: ${absolute}`);
  }
  stdout('[clean] development data targets:');
  for (const target of deletions) stdout(`  ${target}`);
  if (deletions.length === 0) return { removed: [] };
  if (!yes && !(await confirm(deletions, stdout))) return { removed: [] };
  for (const target of deletions) await rm(target, { recursive: true, force: true });
  return { removed: deletions };
}

export const cleanCommand = {
  name: 'clean',
  summary: 'Remove generated files and optionally reset development data',
  async execute(argv, context = {}) {
    const { help, values } = parseOptions('clean', argv, {
      data: { type: 'boolean' },
      yes: { type: 'boolean' }
    });
    if (help) {
      (context.stdout ?? console.log)(helpText());
      return;
    }
    const generated = await cleanGeneratedArtifacts();
    (context.stdout ?? console.log)(`[clean] generated: ${generated.removed.length}`);
    if (values.data)
      await cleanDevelopmentData({
        yes: values.yes === true,
        stdout: context.stdout ?? console.log
      });
  }
};
