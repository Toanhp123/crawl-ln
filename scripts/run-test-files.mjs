import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const maxCapturedOutputBytes = 4 * 1024 * 1024;
const exclusiveRegressionFiles = new Set([
  'source-reader-external-context-parity.test.ts',
  'source-reader-external-process-sandbox.test.ts'
]);

const suites = {
  regression: {
    concurrency: Number(process.env.REGRESSION_TEST_CONCURRENCY ?? 8),
    timeoutMs: Number(process.env.REGRESSION_TEST_FILE_TIMEOUT_MS ?? 20_000),
    exclusiveTimeoutMs: Number(process.env.REGRESSION_EXCLUSIVE_TEST_FILE_TIMEOUT_MS ?? 60_000),
    directory: join(projectRoot, 'tests', 'regression'),
    nodeArgs: ['--import', 'tsx', '--test', '--test-reporter=tap']
  },
  integration: {
    concurrency: Number(process.env.INTEGRATION_TEST_CONCURRENCY ?? 3),
    timeoutMs: Number(process.env.INTEGRATION_TEST_FILE_TIMEOUT_MS ?? 45_000),
    directory: join(projectRoot, 'tests', 'integration'),
    nodeArgs: ['--experimental-sqlite', '--import', 'tsx', '--test', '--test-reporter=tap']
  },
  contract: {
    concurrency: Number(process.env.CONTRACT_TEST_CONCURRENCY ?? 3),
    timeoutMs: Number(process.env.CONTRACT_TEST_FILE_TIMEOUT_MS ?? 45_000),
    directory: join(projectRoot, 'tests', 'contract'),
    nodeArgs: ['--experimental-sqlite', '--import', 'tsx', '--test', '--test-reporter=tap']
  }
};

export async function collectTestFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.test.ts'))
    .map((entry) => join(directory, entry.name))
    .sort((left, right) => left.localeCompare(right));
}

export function partitionTestFiles(suiteName, files) {
  const sorted = [...files].sort((left, right) => left.localeCompare(right));
  if (suiteName !== 'regression') return { regular: sorted, exclusive: [] };
  return {
    regular: sorted.filter((file) => !exclusiveRegressionFiles.has(basename(file))),
    exclusive: sorted.filter((file) => exclusiveRegressionFiles.has(basename(file)))
  };
}

export function parseTestSummary(output) {
  const readCount = (label) => {
    const matches = [...output.matchAll(new RegExp(`^# ${label} (\\d+)$`, 'gm'))];
    return Number(matches.at(-1)?.[1] ?? 0);
  };

  return {
    tests: readCount('tests'),
    pass: readCount('pass'),
    fail: readCount('fail'),
    skipped: readCount('skipped')
  };
}

function processFailure(file, code, signal, stdout, stderr) {
  const reason = signal ? `signal ${signal}` : `exit code ${code ?? 'unknown'}`;
  const diagnostics = [stdout.trim(), stderr.trim()].filter(Boolean).join('\n');
  return new Error(
    `Test file failed (${relative(projectRoot, file)}) with ${reason}${diagnostics ? `\n${diagnostics}` : ''}`
  );
}

function captureStream(stream, chunks) {
  let capturedBytes = 0;
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    if (capturedBytes >= maxCapturedOutputBytes) return;
    const remainingBytes = maxCapturedOutputBytes - capturedBytes;
    const encoded = Buffer.from(chunk);
    const captured =
      encoded.byteLength <= remainingBytes ? chunk : encoded.subarray(0, remainingBytes).toString();
    chunks.push(captured);
    capturedBytes += Buffer.byteLength(captured);
  });
}

function terminateChildTree(child, signal = 'SIGTERM') {
  if (process.platform !== 'win32' && child.pid) {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch (error) {
      if (error?.code !== 'ESRCH') throw error;
    }
  }
  child.kill(signal);
}

export async function runTestFile({
  suiteName,
  file,
  baseEnv = process.env,
  timeoutMs,
  tempParent = tmpdir(),
  signal
}) {
  const suite = suites[suiteName];
  if (!suite) throw new Error(`Unknown test suite: ${suiteName}`);
  const effectiveTimeoutMs = timeoutMs ?? suite.timeoutMs;
  const runtimeRoot = await mkdtemp(join(tempParent, `novel-tool-test-${suiteName}-`));
  const storageDir = join(runtimeRoot, 'storage');
  const pluginDir = join(runtimeRoot, 'plugins');
  await Promise.all([
    mkdir(storageDir, { recursive: true }),
    mkdir(pluginDir, { recursive: true })
  ]);

  const childEnvironment = Object.fromEntries(
    Object.entries(baseEnv).filter(([name]) => !name.startsWith('NODE_TEST'))
  );

  const startedAt = performance.now();
  try {
    const summary = await new Promise((resolveRun, rejectRun) => {
      const child = spawn(process.execPath, [...suite.nodeArgs, file], {
        cwd: projectRoot,
        env: {
          ...childEnvironment,
          NODE_ENV: 'test',
          STORAGE_DIR: storageDir,
          SOURCE_READER_PLUGIN_DIR: pluginDir
        },
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe']
      });
      const stdoutChunks = [];
      const stderrChunks = [];
      captureStream(child.stdout, stdoutChunks);
      captureStream(child.stderr, stderrChunks);

      let settled = false;
      const abort = () => terminateChildTree(child);
      signal?.addEventListener('abort', abort, { once: true });
      const finish = (callback) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        callback();
      };
      const timer = setTimeout(() => {
        terminateChildTree(child);
        setTimeout(() => terminateChildTree(child, 'SIGKILL'), 2_000).unref();
        finish(() =>
          rejectRun(new Error(`Test file timed out after ${effectiveTimeoutMs}ms: ${file}`))
        );
      }, effectiveTimeoutMs);
      timer.unref();

      child.once('error', (error) => finish(() => rejectRun(error)));
      child.once('close', (code, signal) => {
        finish(() => {
          const stdout = stdoutChunks.join('');
          const stderr = stderrChunks.join('');
          if (code === 0) resolveRun(parseTestSummary(stdout));
          else rejectRun(processFailure(file, code, signal, stdout, stderr));
        });
      });
    });
    return { ...summary, durationMs: performance.now() - startedAt };
  } finally {
    await rm(runtimeRoot, { recursive: true, force: true });
  }
}

async function runWithConcurrency(items, concurrency, worker) {
  let nextIndex = 0;
  const results = new Array(items.length);
  const controller = new AbortController();
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (!controller.signal.aborted) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      try {
        results[index] = await worker(items[index], index, controller.signal);
      } catch (error) {
        controller.abort();
        throw error;
      }
    }
  });
  await Promise.all(workers);
  return results;
}

export async function runSuite(suiteName) {
  const suite = suites[suiteName];
  if (!suite) {
    throw new Error(
      `Unknown test suite "${suiteName}". Expected one of: ${Object.keys(suites).join(', ')}`
    );
  }
  const files = await collectTestFiles(suite.directory);
  if (files.length === 0) throw new Error(`No test files found in ${suite.directory}`);

  console.log(
    `\n[${suiteName}] ${files.length} isolated test files, concurrency ${suite.concurrency}`
  );
  let completed = 0;
  const report = (file, result) => {
    completed += 1;
    console.log(
      `[${suiteName} ${completed}/${files.length}] PASS ${relative(projectRoot, file)} (${Math.round(result.durationMs)}ms)`
    );
    return result;
  };
  const { regular, exclusive } = partitionTestFiles(suiteName, files);
  const regularResults = await runWithConcurrency(
    regular,
    suite.concurrency,
    async (file, _index, signal) => report(file, await runTestFile({ suiteName, file, signal }))
  );
  const exclusiveResults = [];
  for (const file of exclusive) {
    exclusiveResults.push(
      report(
        file,
        await runTestFile({
          suiteName,
          file,
          timeoutMs: suite.exclusiveTimeoutMs ?? suite.timeoutMs
        })
      )
    );
  }
  const results = [...regularResults, ...exclusiveResults];

  const totals = results.reduce(
    (summary, result) => ({
      tests: summary.tests + result.tests,
      pass: summary.pass + result.pass,
      fail: summary.fail + result.fail,
      skipped: summary.skipped + result.skipped
    }),
    { tests: 0, pass: 0, fail: 0, skipped: 0 }
  );
  console.log(
    `[${suiteName}] ${totals.tests} tests: ${totals.pass} pass, ${totals.fail} fail, ${totals.skipped} skipped`
  );
  return totals;
}

const isMain =
  process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  runSuite(process.argv[2]).catch((error) => {
    console.error(error instanceof Error ? (error.stack ?? error.message) : error);
    process.exitCode = 1;
  });
}
