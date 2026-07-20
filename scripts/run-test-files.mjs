import { spawnSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const suites = {
  regression: {
    batchSize: 200,
    directory: join(projectRoot, 'tests', 'regression'),
    isolatedFiles: new Set([
      'source-reader-external-context-parity.test.ts',
      'source-reader-external-process-sandbox.test.ts'
    ]),
    nodeArgs: [
      '--import',
      'tsx',
      '--test',
      '--experimental-test-isolation=none',
      '--test-force-exit'
    ]
  },
  integration: {
    batchSize: 50,
    directory: join(projectRoot, 'tests', 'integration'),
    isolatedFiles: new Set([
      'novel-pagination.test.ts',
      'source-reader-external-auth-rpc.test.ts',
      'source-reader-external-registration-parity.test.ts'
    ]),
    nodeArgs: [
      '--experimental-sqlite',
      '--import',
      'tsx',
      '--test',
      '--experimental-test-isolation=none',
      '--test-force-exit'
    ]
  }
};

export async function collectTestFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.test.ts'))
    .map((entry) => join(directory, entry.name))
    .sort((left, right) => left.localeCompare(right));
}

export function chunkTestFiles(files, batchSize) {
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new TypeError('batchSize must be a positive integer');
  }

  const batches = [];
  for (let index = 0; index < files.length; index += batchSize) {
    batches.push(files.slice(index, index + batchSize));
  }
  return batches;
}

export function createTestBatches(files, batchSize, isolatedFiles = new Set()) {
  const batches = [];
  let current = [];

  const flush = () => {
    if (current.length > 0) batches.push(current);
    current = [];
  };

  for (const file of files) {
    if (isolatedFiles.has(basename(file))) {
      flush();
      batches.push([file]);
      continue;
    }

    current.push(file);
    if (current.length === batchSize) flush();
  }

  flush();
  return batches;
}

function runTestBatch(nodeArgs, files) {
  const result = spawnSync(process.execPath, [...nodeArgs, ...files], {
    cwd: projectRoot,
    env: process.env,
    stdio: 'inherit'
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const reason = result.signal
      ? `signal ${result.signal}`
      : `exit code ${result.status ?? 'unknown'}`;
    throw new Error(`Test batch failed with ${reason}`);
  }
}

export async function runSuite(suiteName) {
  const suite = suites[suiteName];
  if (!suite) {
    throw new Error(
      `Unknown test suite "${suiteName}". Expected one of: ${Object.keys(suites).join(', ')}`
    );
  }

  const files = await collectTestFiles(suite.directory);
  if (files.length === 0) {
    throw new Error(`No test files found in ${suite.directory}`);
  }

  const batches = createTestBatches(files, suite.batchSize, suite.isolatedFiles);
  for (const [index, batch] of batches.entries()) {
    console.log(`\n[${suiteName} batch ${index + 1}/${batches.length}] ${batch.length} files`);
    runTestBatch(suite.nodeArgs, batch);
  }
}

const isMain =
  process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  runSuite(process.argv[2]).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
