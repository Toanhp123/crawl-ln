import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { prepareSdk } from './prepare-sdk.mjs';
import { prepareShared } from './prepare-shared.mjs';

export function preparePackages() {
  prepareShared();
  prepareSdk();
}

const isMain =
  process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  try {
    preparePackages();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
