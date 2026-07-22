import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runSuite } from './run-test-files.mjs';

export const verificationSteps = [
  {
    type: 'command',
    name: 'check:lockfile',
    command: process.execPath,
    args: ['scripts/check-lockfile-portability.mjs']
  },
  {
    type: 'command',
    name: 'prepare:packages',
    command: process.execPath,
    args: ['scripts/prepare-packages.mjs']
  },
  {
    type: 'command',
    name: 'check:prepared',
    command: process.execPath,
    args: ['scripts/check-prepared.mjs', '--skip-typescript']
  },
  {
    type: 'command',
    name: 'build:prepared',
    command: process.execPath,
    args: ['scripts/build-prepared.mjs']
  },
  { type: 'suite', name: 'contract' },
  { type: 'suite', name: 'regression' },
  { type: 'suite', name: 'integration' }
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
    } else {
      await runSuite(step.name);
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
