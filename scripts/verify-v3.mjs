import { execFile, spawn } from 'node:child_process';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runSuite } from './run-test-files.mjs';

const execFileAsync = promisify(execFile);
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tsc = join(projectRoot, 'node_modules', 'typescript', 'bin', 'tsc');
const playwright = join(projectRoot, 'node_modules', '@playwright', 'test', 'cli.js');
const webNextRoot = join(projectRoot, 'apps', 'web-next');
const vite = join(webNextRoot, 'node_modules', 'vite', 'bin', 'vite.js');

function command(name, args, options = {}) {
  return { type: 'command', name, command: process.execPath, args, ...options };
}

function commandGroup(name, commands) {
  return { type: 'command-group', name, commands };
}

export const verificationSteps = [
  command('check:lockfile', [join(projectRoot, 'scripts', 'check-lockfile-portability.mjs')]),
  command('prepare:packages', [join(projectRoot, 'scripts', 'prepare-packages.mjs')]),
  command('check:docs', [join(projectRoot, 'scripts', 'check-docs.mjs')]),
  command('check:current-reference', [join(projectRoot, 'scripts', 'check-prepared.mjs')]),
  command('build:current-reference', [join(projectRoot, 'scripts', 'build-prepared.mjs')]),
  command('check:api-next-arch', [join(projectRoot, 'scripts', 'check-api-next-architecture.mjs')]),
  command('check:web-next-arch', [join(projectRoot, 'scripts', 'check-web-next-architecture.mjs')]),
  command('check:web-next-contracts', [
    join(projectRoot, 'scripts', 'check-web-next-contracts.mjs')
  ]),
  command('check:reader-engine-arch', [
    join(projectRoot, 'scripts', 'check-reader-engine-architecture.mjs')
  ]),
  commandGroup('check:next-types', [
    command('check:api-next', [
      tsc,
      '-p',
      join(projectRoot, 'apps', 'api-next', 'tsconfig.json'),
      '--noEmit'
    ]),
    command('check:web-next', [tsc, '-p', join(webNextRoot, 'tsconfig.json'), '--noEmit']),
    command('check:reader-engine', [
      tsc,
      '-p',
      join(projectRoot, 'packages', 'reader-engine', 'tsconfig.json'),
      '--noEmit'
    ])
  ]),
  commandGroup('build:next', [
    command('build:api-next', [join(projectRoot, 'apps', 'api-next', 'scripts', 'build.mjs')]),
    command('build:web-next', [vite, 'build'], { cwd: webNextRoot })
  ]),
  { type: 'suite', name: 'contract', suite: 'contract' },
  { type: 'suite', name: 'regression', suite: 'regression' },
  { type: 'suite', name: 'integration', suite: 'integration' },
  command('e2e:web-next', [
    playwright,
    'test',
    '--config',
    join(projectRoot, 'playwright.web-next.config.ts')
  ])
];

function runCommand(step) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(step.command, step.args, {
      cwd: step.cwd ?? projectRoot,
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
      rejectRun(new Error(`${step.name} failed with ${reason}`));
    });
  });
}

async function runStep(step) {
  if (step.type === 'command') {
    await runCommand(step);
    return;
  }
  if (step.type === 'command-group') {
    for (const childStep of step.commands) await runCommand(childStep);
    return;
  }
  await runSuite(step.suite);
}

async function readHeadCommit() {
  const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
    cwd: projectRoot,
    encoding: 'utf8'
  });
  return stdout.trim();
}

async function writeJsonAtomic(path, value) {
  const target = resolve(projectRoot, path);
  const temporary = `${target}.tmp-${process.pid}-${Date.now()}`;
  await mkdir(dirname(target), { recursive: true });
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

export async function runV3Verification({ steps = verificationSteps, reportPath } = {}) {
  const startedAt = new Date().toISOString();
  const commit = await readHeadCommit();
  const results = [];
  if (reportPath) await rm(resolve(projectRoot, reportPath), { force: true });

  for (const [index, step] of steps.entries()) {
    const stepStarted = performance.now();
    console.log(`\n[verify:v3 ${index + 1}/${steps.length}] START ${step.name}`);
    await runStep(step);
    const durationMs = Math.round(performance.now() - stepStarted);
    results.push({ name: step.name, durationMs });
    console.log(`[verify:v3 ${index + 1}/${steps.length}] PASS ${step.name} (${durationMs}ms)`);
  }

  const completedCommit = await readHeadCommit();
  if (completedCommit !== commit) {
    throw new Error(`HEAD changed during verification: ${commit} -> ${completedCommit}`);
  }
  const report = {
    formatVersion: 1,
    command: 'npm run verify:v3',
    commit,
    startedAt,
    completedAt: new Date().toISOString(),
    steps: results,
    passed: true
  };
  if (reportPath) await writeJsonAtomic(reportPath, report);
  return report;
}

function reportPathFromArgs(args) {
  const index = args.indexOf('--report');
  if (index < 0) return undefined;
  const path = args[index + 1];
  if (!path || path.startsWith('--')) throw new Error('--report requires an output path');
  return path;
}

const isMain =
  process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  runV3Verification({ reportPath: reportPathFromArgs(process.argv.slice(2)) }).catch((error) => {
    console.error(error instanceof Error ? (error.stack ?? error.message) : error);
    process.exitCode = 1;
  });
}
