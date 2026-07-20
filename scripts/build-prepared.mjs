import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function run(command, args, cwd = projectRoot) {
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

export async function runPreparedBuild() {
  const webRoot = join(projectRoot, 'apps', 'web');
  await run(process.execPath, [join(projectRoot, 'apps', 'api', 'scripts', 'build.mjs')]);
  await run(process.execPath, [
    join(projectRoot, 'node_modules', 'typescript', 'bin', 'tsc'),
    '-p',
    join(webRoot, 'tsconfig.json'),
    '--noEmit'
  ]);
  await run(
    process.execPath,
    [join(webRoot, 'node_modules', 'vite', 'bin', 'vite.js'), 'build'],
    webRoot
  );
}

const isMain =
  process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  runPreparedBuild().catch((error) => {
    console.error(error instanceof Error ? (error.stack ?? error.message) : error);
    process.exitCode = 1;
  });
}
