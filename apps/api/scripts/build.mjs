import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { emitTypeScriptProject } from '../../../scripts/typescript-project.mjs';

const defaultApiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sandboxRuntimeAssets = ['sandbox-entry.mjs', 'sandbox-frame-bounds.mjs'].map((name) =>
  join('modules', 'source-reader', 'infrastructure', 'runtime', 'external-process', name)
);

export async function copySourceReaderRuntimeAssets({
  apiRoot = defaultApiRoot,
  outputRoot = join(apiRoot, 'dist')
} = {}) {
  for (const relativePath of sandboxRuntimeAssets) {
    const output = join(outputRoot, relativePath);
    await mkdir(dirname(output), { recursive: true });
    await copyFile(join(apiRoot, 'src', relativePath), output);
  }
}

export async function runApiBuild({
  apiRoot = defaultApiRoot,
  outputRoot = join(apiRoot, 'dist')
} = {}) {
  const root = resolve(apiRoot, '..', '..');
  emitTypeScriptProject(join(apiRoot, 'tsconfig.json'), {
    outDir: outputRoot,
    baseUrl: root,
    paths: {
      '@novel-tool/shared': ['packages/shared/dist/index.d.ts'],
      '@novel-tool/source-plugin-sdk': ['packages/source-plugin-sdk/dist/index.d.ts']
    }
  });
  await copySourceReaderRuntimeAssets({ apiRoot, outputRoot });
}

const isMain =
  process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  runApiBuild().catch((error) => {
    console.error(error instanceof Error ? (error.stack ?? error.message) : error);
    process.exitCode = 1;
  });
}
