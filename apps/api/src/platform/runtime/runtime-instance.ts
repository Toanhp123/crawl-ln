import { randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

export const RUNTIME_MARKER_FILE = '.novel-tool-runtime.json';
export interface RuntimeInstance {
  formatVersion: 1;
  instanceId: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseMarker(path: string): RuntimeInstance {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`Novel Tool runtime marker is malformed: ${path}`, { cause: error });
  }
  if (
    typeof value !== 'object' ||
    value === null ||
    (value as { formatVersion?: unknown }).formatVersion !== 1 ||
    typeof (value as { instanceId?: unknown }).instanceId !== 'string' ||
    !UUID_PATTERN.test((value as { instanceId: string }).instanceId)
  ) {
    throw new Error(`Novel Tool runtime marker is invalid: ${path}`);
  }
  return value as RuntimeInstance;
}

function writeMarker(directory: string, instance: RuntimeInstance): RuntimeInstance {
  const markerPath = join(directory, RUNTIME_MARKER_FILE);
  const temporaryPath = join(
    directory,
    `${RUNTIME_MARKER_FILE}.${process.pid}.${randomUUID()}.tmp`
  );
  try {
    writeFileSync(temporaryPath, `${JSON.stringify(instance, null, 2)}\n`, { flag: 'wx' });
    renameSync(temporaryPath, markerPath);
  } finally {
    rmSync(temporaryPath, { force: true });
  }
  return instance;
}

export function ensureRuntimeInstance(
  storageDirectory: string,
  { allowKnownDefault = false }: { allowKnownDefault?: boolean } = {}
): RuntimeInstance {
  const directory = resolve(storageDirectory);
  mkdirSync(directory, { recursive: true });
  const markerPath = join(directory, RUNTIME_MARKER_FILE);
  if (existsSync(markerPath)) return parseMarker(markerPath);
  const entries = readdirSync(directory);
  if (entries.length > 0 && !allowKnownDefault) {
    throw new Error(
      'Refusing to claim a non-empty unmarked storage directory. Choose an empty directory or reset it explicitly.'
    );
  }
  return writeMarker(directory, { formatVersion: 1, instanceId: randomUUID() });
}

export function ensureOwnedDataDirectory(directoryPath: string, instance: RuntimeInstance): void {
  const directory = resolve(directoryPath);
  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true });
    writeMarker(directory, instance);
    return;
  }
  const markerPath = join(directory, RUNTIME_MARKER_FILE);
  if (!existsSync(markerPath)) {
    const entries = readdirSync(directory);
    if (entries.length > 0) {
      throw new Error('Refusing to claim a non-empty unmarked Novel Tool data directory.');
    }
    writeMarker(directory, instance);
    return;
  }
  const existing = parseMarker(markerPath);
  if (existing.instanceId !== instance.instanceId) {
    throw new Error('Novel Tool data directory belongs to a different runtime instance.');
  }
}

export function pathIsInside(parent: string, candidate: string): boolean {
  const child = relative(resolve(parent), resolve(candidate));
  return (
    child !== '' &&
    !child.startsWith('..') &&
    !child.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)
  );
}

export function ensureExternalDataOwnership(input: {
  storageDirectory: string;
  databasePath: string;
  pluginDirectory?: string;
  instance: RuntimeInstance;
}): void {
  const storage = resolve(input.storageDirectory);
  const databaseDirectory = dirname(resolve(input.databasePath));
  if (databaseDirectory !== storage && !pathIsInside(storage, databaseDirectory)) {
    ensureOwnedDataDirectory(databaseDirectory, input.instance);
  }
  if (input.pluginDirectory) {
    const plugins = resolve(input.pluginDirectory);
    if (plugins !== storage && !pathIsInside(storage, plugins)) {
      ensureOwnedDataDirectory(plugins, input.instance);
    }
  }
}
