import { statSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CommandFailure } from './errors.mjs';

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

export function resolveRepositoryPath(...segments) {
  return resolve(projectRoot, ...segments);
}

export function isPathInside(parent, candidate) {
  const path = relative(resolve(parent), resolve(candidate));
  return path !== '' && !path.startsWith('..') && !isAbsolute(path);
}

export function assertRepositoryPath(candidate, { allowRoot = false, mustExist = false } = {}) {
  const absolute = resolve(candidate);
  if (
    (!allowRoot && absolute === projectRoot) ||
    (absolute !== projectRoot && !isPathInside(projectRoot, absolute))
  ) {
    throw new CommandFailure(`Unsafe repository path: ${absolute}`);
  }
  if (mustExist) {
    try {
      statSync(absolute);
    } catch (error) {
      throw new CommandFailure(`Repository path does not exist: ${absolute}`, { cause: error });
    }
  }
  return absolute;
}
