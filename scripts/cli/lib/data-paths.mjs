import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { CommandFailure } from './errors.mjs';

const SELECTED = new Set(['STORAGE_DIR', 'DATABASE_PATH', 'SOURCE_READER_PLUGIN_DIR']);

export function parseSelectedEnv(content) {
  const values = {};
  for (const [index, rawLine] of content.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) throw new CommandFailure(`Malformed .env line ${index + 1}`);
    if (!SELECTED.has(match[1])) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    )
      value = value.slice(1, -1);
    if (!value) throw new CommandFailure(`${match[1]} must not be blank`);
    values[match[1]] = value;
  }
  return values;
}

function rejectTraversal(raw, name) {
  if (raw.split(/[\\/]+/).includes('..'))
    throw new CommandFailure(`${name} must not contain .. segments`);
}

function resolveApiPath(apiRoot, raw, name) {
  rejectTraversal(raw, name);
  return resolve(apiRoot, raw);
}

export function resolveDevelopmentDataPaths(projectRoot, environment = {}) {
  const apiRoot = join(projectRoot, 'apps', 'api');
  const envPath = join(apiRoot, '.env');
  const fileValues = existsSync(envPath) ? parseSelectedEnv(readFileSync(envPath, 'utf8')) : {};
  const selected = { ...fileValues };
  for (const name of SELECTED)
    if (environment[name] !== undefined) selected[name] = environment[name];
  const storageRaw = selected.STORAGE_DIR;
  const storageDirectory = storageRaw
    ? resolveApiPath(apiRoot, storageRaw, 'STORAGE_DIR')
    : join(apiRoot, 'storage');
  const databaseRaw = selected.DATABASE_PATH;
  const databasePath = databaseRaw
    ? resolveApiPath(apiRoot, databaseRaw, 'DATABASE_PATH')
    : join(storageDirectory, 'novel-tool.sqlite');
  const pluginRaw = selected.SOURCE_READER_PLUGIN_DIR;
  const pluginDirectory = pluginRaw
    ? resolveApiPath(apiRoot, pluginRaw, 'SOURCE_READER_PLUGIN_DIR')
    : join(storageDirectory, 'source-plugins');
  return {
    apiRoot,
    storageDirectory,
    databasePath,
    pluginDirectory,
    custom: {
      storage: storageRaw !== undefined,
      database: databaseRaw !== undefined,
      plugins: pluginRaw !== undefined
    }
  };
}

export function isDescendant(parent, candidate) {
  const value = relative(resolve(parent), resolve(candidate));
  return value !== '' && !value.startsWith('..') && !isAbsolute(value);
}

export function deduplicateDeletionTargets(targets) {
  const sorted = [...new Set(targets.map((target) => resolve(target)))].sort(
    (a, b) => a.length - b.length
  );
  return sorted.filter(
    (target, index) => !sorted.slice(0, index).some((parent) => isDescendant(parent, target))
  );
}
