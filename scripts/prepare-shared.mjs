import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { emitTypeScriptProject } from './typescript-project.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function prepareShared() {
  emitTypeScriptProject(join(projectRoot, 'packages', 'shared', 'tsconfig.json'));
}

const isMain =
  process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  try {
    prepareShared();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
