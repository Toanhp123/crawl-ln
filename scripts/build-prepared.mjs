import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checkTypeScriptProject, emitTypeScriptProject } from './typescript-project.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export async function runPreparedBuild() {
  const apiRoot = join(projectRoot, 'apps', 'api');
  const webRoot = join(projectRoot, 'apps', 'web');

  emitTypeScriptProject(join(apiRoot, 'tsconfig.json'));
  checkTypeScriptProject(join(webRoot, 'tsconfig.json'));

  const sandboxRelative = join(
    'modules',
    'source-reader',
    'infrastructure',
    'runtime',
    'external-process',
    'sandbox-entry.mjs'
  );
  const sandboxOutput = join(apiRoot, 'dist', sandboxRelative);
  await mkdir(dirname(sandboxOutput), { recursive: true });
  await copyFile(join(apiRoot, 'src', sandboxRelative), sandboxOutput);

  const viteModule = pathToFileURL(
    join(webRoot, 'node_modules', 'vite', 'dist', 'node', 'index.js')
  ).href;
  const previousDirectory = process.cwd();
  process.chdir(webRoot);
  try {
    const { build } = await import(viteModule);
    await build();
  } finally {
    process.chdir(previousDirectory);
  }
}

const isMain =
  process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  runPreparedBuild().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
