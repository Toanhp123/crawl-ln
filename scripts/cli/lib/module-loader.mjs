import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export function resolveFrom(baseDirectory, specifier) {
  return createRequire(join(baseDirectory, 'package.json')).resolve(specifier);
}

export function importFrom(baseDirectory, specifier) {
  return import(pathToFileURL(resolveFrom(baseDirectory, specifier)).href);
}
