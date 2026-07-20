import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runPreparedBuild } from './build-prepared.mjs';
import { runPreparedChecks } from './check-prepared.mjs';
import { runSuite } from './run-test-files.mjs';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

export const verificationSteps = [
  { type: 'command', command: npmCommand, args: ['run', 'check:lockfile'] },
  { type: 'command', command: npmCommand, args: ['run', 'prepare:shared'] },
  { type: 'suite', name: 'regression' },
  { type: 'suite', name: 'integration' },
  {
    type: 'module',
    name: 'check:prepared',
    run: () => runPreparedChecks({ skipTypeScript: true })
  },
  { type: 'module', name: 'build:prepared', run: runPreparedBuild }
];

function runCommand(command, args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: 'inherit'
    });

    child.once('error', rejectRun);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolveRun();
        return;
      }

      const reason = signal ? `signal ${signal}` : `exit code ${code ?? 'unknown'}`;
      rejectRun(new Error(`${command} ${args.join(' ')} failed with ${reason}`));
    });
  });
}

export async function runVerification() {
  for (const step of verificationSteps) {
    if (step.type === 'command') {
      await runCommand(step.command, step.args);
    } else if (step.type === 'suite') {
      await runSuite(step.name);
    } else {
      await step.run();
    }
  }
}

const isMain =
  process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  runVerification().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
