import { spawn } from 'node:child_process';
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = resolve(apiRoot, '..', '..');

function run(command, args, cwd = apiRoot) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, { cwd, env: process.env, stdio: 'inherit' });
    child.once('error', rejectRun);
    child.once('exit', (code, signal) => {
      if (code === 0) return resolveRun();
      const reason = signal ? `signal ${signal}` : `exit code ${code ?? 'unknown'}`;
      rejectRun(new Error(`${command} ${args.join(' ')} failed with ${reason}`));
    });
  });
}

export async function runApiBuild() {
  const tsc = join(projectRoot, 'node_modules', 'typescript', 'bin', 'tsc');
  await run(process.execPath, [tsc, '-p', join(apiRoot, 'tsconfig.json')]);

  const sandboxRelative = join(
    'modules',
    'source-reader',
    'infrastructure',
    'runtime',
    'external-process',
    'sandbox-entry.mjs'
  );
  const output = join(apiRoot, 'dist', sandboxRelative);
  await mkdir(dirname(output), { recursive: true });
  await copyFile(join(apiRoot, 'src', sandboxRelative), output);
}

const isMain =
  process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  runApiBuild().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  });
}
