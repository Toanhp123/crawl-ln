import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';
import { CommandFailure } from './errors.mjs';
import { importFrom } from './module-loader.mjs';
import { projectRoot } from './repository.mjs';

const SKIPPED_DIRECTORIES = new Set([
  '.artifacts',
  '.git',
  '.nyc_output',
  'coverage',
  'dist',
  'node_modules',
  'playwright-report',
  'test-results'
]);

const TARGETS = {
  api: [{ path: 'apps/api', extensions: ['.ts', '.mjs', '.json'] }],
  web: [
    {
      path: 'apps/web',
      extensions: ['.ts', '.tsx', '.js', '.json', '.css', '.html']
    }
  ],
  packages: [{ path: 'packages', extensions: ['.ts', '.json'] }],
  plugins: [{ path: 'plugins', extensions: ['.ts', '.json'] }],
  scripts: [
    { path: 'scripts', extensions: ['.mjs'] },
    { path: 'package.json', file: true },
    { path: '.prettierrc.json', file: true }
  ],
  tests: [{ path: 'tests', extensions: ['.ts', '.mjs', '.json'] }],
  docs: [
    { path: 'README.md', file: true },
    { path: 'docs', extensions: ['.md'] },
    { path: 'specs/2026-07-23-greenfield-command-system-design.md', file: true, optional: true },
    { path: 'specs/2026-07-23-greenfield-command-system.md', file: true, optional: true }
  ]
};

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function collectDirectory(directory, extensions, files) {
  if (!(await exists(directory))) return;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && SKIPPED_DIRECTORIES.has(entry.name)) continue;
    const target = join(directory, entry.name);
    if (entry.isDirectory()) {
      await collectDirectory(target, extensions, files);
    } else if (entry.isFile() && extensions.has(extname(entry.name))) {
      files.push(resolve(target));
    }
  }
}

function selectedDefinitions(target) {
  if (target === undefined || target === 'all') return Object.values(TARGETS).flat();
  const definitions = TARGETS[target];
  if (!definitions) throw new CommandFailure(`Unknown format target: ${target}`);
  return definitions;
}

export async function collectFormatFiles(target, root = projectRoot) {
  const files = [];
  for (const definition of selectedDefinitions(target)) {
    const absolute = resolve(root, definition.path);
    if (definition.file) {
      if (await exists(absolute)) files.push(absolute);
      else if (!definition.optional)
        throw new CommandFailure(`Formatting path is missing: ${absolute}`);
      continue;
    }
    await collectDirectory(absolute, new Set(definition.extensions), files);
  }
  return [...new Set(files)].sort((left, right) => left.localeCompare(right));
}

async function prettierApi(root = projectRoot) {
  const module = await importFrom(root, 'prettier');
  return module.default ?? module;
}

async function prettierOptions(prettier, root = projectRoot) {
  return (await prettier.resolveConfig(join(root, 'package.json'))) ?? {};
}

export async function checkFormatPaths(paths, { root = projectRoot } = {}) {
  const prettier = await prettierApi(root);
  const options = await prettierOptions(prettier, root);
  const unformatted = [];
  for (const file of [...paths].sort()) {
    const content = await readFile(file, 'utf8');
    if (!(await prettier.check(content, { ...options, filepath: file }))) {
      unformatted.push(relative(root, file).replaceAll('\\', '/'));
    }
  }
  if (unformatted.length > 0) {
    throw new CommandFailure(
      `Prettier formatting issues:\n${unformatted.map((file) => `- ${file}`).join('\n')}`
    );
  }
}

export async function formatPaths(paths, { root = projectRoot } = {}) {
  const prettier = await prettierApi(root);
  const options = await prettierOptions(prettier, root);
  for (const file of [...paths].sort()) {
    const content = await readFile(file, 'utf8');
    const formatted = await prettier.format(content, { ...options, filepath: file });
    if (formatted !== content) await writeFile(file, formatted);
  }
}
