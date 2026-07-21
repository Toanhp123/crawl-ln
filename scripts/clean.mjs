import { readdir, rm, stat } from 'node:fs/promises';
import path, { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const GENERATED_DIRECTORIES = [
  'packages/shared/dist',
  'packages/source-plugin-sdk/dist',
  'apps/api/dist',
  'apps/web/dist',
  'coverage',
  'playwright-report',
  'test-results',
  '.nyc_output'
];

const BUILD_INFO_ROOTS = ['apps', 'packages'];

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

export function isSafeCleanTarget(root, target, pathApi = path) {
  const relativePath = pathApi.relative(pathApi.resolve(root), pathApi.resolve(target));
  return relativePath !== '' && !relativePath.startsWith('..') && !pathApi.isAbsolute(relativePath);
}

async function findBuildInfoFiles(root, current, matches) {
  if (!(await pathExists(current))) return;
  for (const entry of await readdir(current, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const absolute = join(current, entry.name);
    if (entry.isDirectory()) {
      await findBuildInfoFiles(root, absolute, matches);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.tsbuildinfo')) {
      matches.push(relative(root, absolute));
    }
  }
}

export async function cleanGeneratedArtifacts(projectRoot = process.cwd()) {
  const root = resolve(projectRoot);
  const candidates = [...GENERATED_DIRECTORIES];

  for (const buildInfoRoot of BUILD_INFO_ROOTS) {
    await findBuildInfoFiles(root, join(root, buildInfoRoot), candidates);
  }

  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.tsbuildinfo')) candidates.push(entry.name);
  }

  const removed = [];
  for (const candidate of [...new Set(candidates)].sort()) {
    const absolute = resolve(root, candidate);
    if (!isSafeCleanTarget(root, absolute)) {
      throw new Error(`Refusing to clean outside project root: ${candidate}`);
    }
    if (!(await pathExists(absolute))) continue;
    await rm(absolute, { recursive: true, force: true });
    removed.push(candidate);
  }

  return { removed };
}

async function main() {
  const result = await cleanGeneratedArtifacts();
  if (result.removed.length === 0) {
    console.log('No generated artifacts to remove.');
    return;
  }
  console.log(`Removed ${result.removed.length} generated path(s):`);
  for (const path of result.removed) console.log(`- ${path}`);
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
