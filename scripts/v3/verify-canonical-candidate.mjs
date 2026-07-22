import { execFile, spawn } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { access, mkdir, readFile, rm, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  createCandidateApiEnvironment,
  createCandidateRuntimeStorage,
  ensureCandidateSmokeProbe,
  runCandidateBrowserSmoke,
  runCandidateHttpSmoke
} from './smoke-candidate.mjs';
import { reserveLoopbackPort, startManagedProcess, waitForHttp } from './process-runner.mjs';
import { findStorageDatabase, storageManifest } from './storage-manifest.mjs';
import { writeJsonAtomic } from './storage-safety.mjs';

const execFileAsync = promisify(execFile);
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SHA256 = /^[a-f0-9]{64}$/;
const V3_STORAGE_SCHEMA_VERSION = 23;
const smokeFields = ['apiHealth', 'httpContracts', 'webRoutes', 'reader', 'sourceReaderAdmin'];
const legacySmokeFields = ['apiHealth', 'webHome'];
const rehearsalSteps = [
  'copy',
  'migrate',
  'validate',
  'candidate-smoke',
  'cutover',
  'live-smoke',
  'rollback',
  'hash-verify'
];

export const retainedCoverageCapabilities = [
  'api-contract',
  'backend-architecture',
  'backup',
  'browser',
  'export',
  'frontend-architecture',
  'ingestion',
  'library',
  'migration',
  'reader-engine',
  'realtime',
  'scheduler',
  'search',
  'source-reader'
];

export const canonicalVerificationSteps = [
  { name: 'verify', script: 'verify' },
  { name: 'build:legacy', script: 'build:legacy' },
  { name: 'reader-engine', script: 'test:reader-engine' },
  { name: 'e2e', script: 'test:e2e' }
];

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function isInside(root, path) {
  const child = relative(resolve(root), resolve(path));
  return child === '' || (!child.startsWith('..') && !isAbsolute(child));
}

async function readJson(path) {
  return JSON.parse(await readFile(resolve(path), 'utf8'));
}

function assertHash(value, name) {
  if (!SHA256.test(value ?? '')) throw new Error(`${name} must be a SHA-256 hash`);
}

function assertBooleanFields(value, fields, name) {
  for (const field of fields) {
    if (value?.[field] !== true) throw new Error(`${name} did not pass: ${field}`);
  }
}

export async function validateRetainedTestCoverage({
  root = projectRoot,
  coverageRoot = root,
  matrixPath = join(root, 'specs', 'v3-retained-test-coverage.json')
} = {}) {
  const matrixBytes = await readFile(resolve(matrixPath));
  const matrix = JSON.parse(matrixBytes.toString('utf8'));
  if (!matrix || typeof matrix !== 'object' || Array.isArray(matrix)) {
    throw new Error('Retained V3 coverage matrix must be an object');
  }
  const actualKeys = Object.keys(matrix).sort();
  const expectedKeys = [...retainedCoverageCapabilities].sort();
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw new Error('Retained V3 coverage matrix capabilities are incomplete');
  }

  for (const capability of retainedCoverageCapabilities) {
    const files = matrix[capability];
    if (!Array.isArray(files) || files.length === 0) {
      throw new Error(`Retained V3 coverage is empty: ${capability}`);
    }
    for (const file of files) {
      if (typeof file !== 'string' || file.length === 0 || isAbsolute(file)) {
        throw new Error(`Retained V3 coverage path is invalid: ${capability}`);
      }
      const resolved = resolve(coverageRoot, file);
      if (!isInside(coverageRoot, resolved)) {
        throw new Error(`Retained V3 coverage path escapes the repository: ${file}`);
      }
      const entry = await stat(resolved);
      if (!entry.isFile()) throw new Error(`Retained V3 coverage path is not a file: ${file}`);
    }
  }

  return { matrix, sha256: sha256(matrixBytes) };
}

async function readWorkspacePackage(root, workspace, expectedName) {
  const packageJson = await readJson(join(root, 'apps', workspace, 'package.json'));
  if (packageJson.name !== expectedName) {
    throw new Error(`Workspace ${workspace} is not ${expectedName}`);
  }
  return packageJson.name;
}

export async function inspectMigratedStorage(storagePath) {
  const manifest = await storageManifest(storagePath);
  const databasePath = await findStorageDatabase(storagePath);
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const integrity = database.prepare('PRAGMA integrity_check').get();
    if (integrity?.integrity_check !== 'ok') {
      throw new Error(`Migrated storage integrity check failed: ${integrity?.integrity_check}`);
    }
    const tables = new Set(
      database
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all()
        .map((row) => row.name)
    );
    for (const required of ['platform_module_migrations', 'library_novels', 'library_chapters']) {
      if (!tables.has(required)) throw new Error(`Migrated storage is missing ${required}`);
    }
    const migrations = database
      .prepare('SELECT COUNT(*) AS count FROM platform_module_migrations')
      .get();
    if (Number(migrations?.count) <= 0) {
      throw new Error('Migrated storage has no applied module migrations');
    }
    return {
      schemaVersion: V3_STORAGE_SCHEMA_VERSION,
      storageManifestSha256: manifest.sha256,
      databasePath
    };
  } finally {
    database.close();
  }
}

async function gitHead(root) {
  const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8'
  });
  return stdout.trim();
}

async function isAncestor(ancestor, descendant, root) {
  try {
    await execFileAsync('git', ['merge-base', '--is-ancestor', ancestor, descendant], {
      cwd: root,
      encoding: 'utf8'
    });
    return true;
  } catch (error) {
    if (error?.code === 1) return false;
    throw error;
  }
}

async function validateCandidateManifest({ path, currentCommit, readAncestor }) {
  const bytes = await readFile(resolve(path));
  const manifest = JSON.parse(bytes.toString('utf8'));
  if (!manifest || manifest.formatVersion !== 1) {
    throw new Error('Invalid pre-cutover candidate manifest');
  }
  if (typeof manifest.commit !== 'string' || manifest.commit.length === 0) {
    throw new Error('Pre-cutover candidate manifest commit is missing');
  }
  assertHash(manifest.migrationReportSha256, 'Pre-cutover candidate migration report');
  if (
    manifest.verification?.command !== 'npm run verify:v3' ||
    manifest.verification?.passed !== true
  ) {
    throw new Error('Pre-cutover candidate verification evidence is invalid');
  }
  assertBooleanFields(manifest.smoke, smokeFields, 'Pre-cutover candidate smoke');
  if (!(await readAncestor(manifest.commit, currentCommit))) {
    throw new Error('Pre-cutover candidate commit is not an ancestor of HEAD');
  }
  return { manifest, bytes, sha256: sha256(bytes) };
}

async function validateRollbackRehearsal({ path, currentCommit, now, maxAgeMs }) {
  const bytes = await readFile(resolve(path));
  const rehearsal = JSON.parse(bytes.toString('utf8'));
  if (!rehearsal || rehearsal.formatVersion !== 1) {
    throw new Error('Invalid rollback rehearsal artifact');
  }
  if (rehearsal.commit !== currentCommit) {
    throw new Error('Rollback rehearsal commit does not match HEAD');
  }
  if (
    !Array.isArray(rehearsal.steps) ||
    rehearsal.steps.length !== rehearsalSteps.length ||
    rehearsal.steps.some((step, index) => step !== rehearsalSteps[index])
  ) {
    throw new Error('Rollback rehearsal sequence is incomplete');
  }
  assertHash(rehearsal.sourceManifestSha256, 'Rollback rehearsal source manifest');
  assertHash(rehearsal.candidateManifestSha256, 'Rollback rehearsal candidate manifest');
  if (rehearsal.sourceManifestRestored !== true || rehearsal.rollbackTriggered !== true) {
    throw new Error('Rollback rehearsal did not restore the source storage');
  }
  const startedAt = Date.parse(rehearsal.startedAt);
  const completedAt = Date.parse(rehearsal.completedAt);
  if (!Number.isFinite(startedAt) || !Number.isFinite(completedAt) || completedAt < startedAt) {
    throw new Error('Rollback rehearsal timestamps are invalid');
  }
  const age = now.getTime() - completedAt;
  if (age < -60_000 || age > maxAgeMs) throw new Error('Rollback rehearsal evidence is stale');
  return { rehearsal, bytes, sha256: sha256(bytes) };
}

export function createNpmInvocation(
  script,
  { platform = process.platform, environment = process.env } = {}
) {
  if (!/^[a-z0-9][a-z0-9:_-]*$/i.test(script)) {
    throw new Error(`Invalid npm script name: ${script}`);
  }
  if (environment.npm_execpath) {
    return {
      command: environment.npm_node_execpath ?? process.execPath,
      args: [environment.npm_execpath, 'run', script]
    };
  }
  if (platform === 'win32') {
    return {
      command: environment.ComSpec ?? 'cmd.exe',
      args: ['/d', '/s', '/c', `npm.cmd run ${script}`]
    };
  }
  return { command: 'npm', args: ['run', script] };
}

export async function runCanonicalVerificationStep(step, { root = projectRoot } = {}) {
  const { command, args } = createNpmInvocation(step.script);
  await new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: root,
      env: process.env,
      stdio: 'inherit',
      windowsHide: true
    });
    child.once('error', rejectRun);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolveRun();
        return;
      }
      rejectRun(new Error(`${command} ${args.join(' ')} failed with ${signal ?? code}`));
    });
  });
  return { passed: true };
}

async function accessibleVite(root, webRoot) {
  const candidates = [
    join(webRoot, 'node_modules', 'vite', 'bin', 'vite.js'),
    join(root, 'node_modules', 'vite', 'bin', 'vite.js')
  ];
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the hoisted workspace binary next.
    }
  }
  throw new Error(`Vite preview binary is missing for ${webRoot}`);
}

export async function runCanonicalRuntimeSmoke({
  root = projectRoot,
  storagePath,
  artifactDirectory,
  timeoutMs = 30_000,
  environment = process.env
}) {
  const apiEntry = join(root, 'apps', 'api', 'dist', 'main.js');
  const webRoot = join(root, 'apps', 'web');
  const webEntry = join(webRoot, 'dist', 'index.html');
  const vite = await accessibleVite(root, webRoot);
  await Promise.all([access(apiEntry), access(webEntry)]);

  const runtime = await createCandidateRuntimeStorage({
    staging: storagePath,
    workRoot: join(artifactDirectory, 'runtime')
  });
  await ensureCandidateSmokeProbe(runtime.path);
  let apiReservation;
  let webReservation;
  let apiProcess;
  let webProcess;
  let failure;
  let smoke;
  try {
    apiReservation = await reserveLoopbackPort();
    webReservation = await reserveLoopbackPort();
    const apiBaseUrl = `http://127.0.0.1:${apiReservation.port}`;
    const webBaseUrl = `http://127.0.0.1:${webReservation.port}`;
    const apiEnvironment = createCandidateApiEnvironment({
      baseEnvironment: environment,
      apiPort: apiReservation.port,
      webBaseUrl,
      storagePath: runtime.path
    });
    const secretValues = [
      apiEnvironment.SOURCE_READER_MASTER_KEY,
      environment.API_REMOTE_TOKEN,
      environment.SOURCE_READER_CURSOR_KEY,
      storagePath,
      runtime.path
    ].filter(Boolean);
    const logDirectory = join(artifactDirectory, 'logs');

    await apiReservation.release();
    apiReservation = undefined;
    apiProcess = await startManagedProcess({
      name: 'canonical-api',
      command: process.execPath,
      args: ['--experimental-sqlite', apiEntry],
      cwd: root,
      env: apiEnvironment,
      logPath: join(logDirectory, 'canonical-api.log'),
      secretValues
    });
    await waitForHttp(`${apiBaseUrl}/health`, { timeoutMs });

    await webReservation.release();
    webReservation = undefined;
    webProcess = await startManagedProcess({
      name: 'canonical-web',
      command: process.execPath,
      args: [
        vite,
        'preview',
        '--host',
        '127.0.0.1',
        '--port',
        String(new URL(webBaseUrl).port),
        '--strictPort'
      ],
      cwd: webRoot,
      env: environment,
      logPath: join(logDirectory, 'canonical-web.log'),
      secretValues
    });
    await waitForHttp(`${webBaseUrl}/library`, { timeoutMs });
    smoke = await runCandidateHttpSmoke({
      apiBaseUrl,
      webBaseUrl,
      secretValues,
      storagePath: runtime.path
    });
    await runCandidateBrowserSmoke({
      apiBaseUrl,
      webBaseUrl,
      timeoutMs,
      executablePath: environment.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    });
  } catch (error) {
    failure = error;
  } finally {
    for (const processHandle of [webProcess, apiProcess]) {
      if (!processHandle) continue;
      try {
        await processHandle.stop();
      } catch (error) {
        failure ??= error;
      }
    }
    for (const reservation of [webReservation, apiReservation]) {
      if (!reservation) continue;
      try {
        await reservation.release();
      } catch (error) {
        failure ??= error;
      }
    }
    try {
      await runtime.cleanup();
    } catch (error) {
      failure ??= error;
    }
  }
  if (failure) throw failure;
  return smoke;
}

export async function runLegacyRuntimeSmoke({
  root = projectRoot,
  artifactDirectory,
  timeoutMs = 30_000,
  environment = process.env
}) {
  const apiEntry = join(root, 'apps', 'api-legacy', 'dist', 'main.js');
  const webRoot = join(root, 'apps', 'web-legacy');
  const vite = await accessibleVite(root, webRoot);
  await Promise.all([access(apiEntry), access(join(webRoot, 'dist', 'index.html'))]);
  const runtimeRoot = join(artifactDirectory, 'legacy-runtime', randomUUID());
  const storagePath = join(runtimeRoot, 'api-storage');
  await mkdir(storagePath, { recursive: true });
  let apiReservation;
  let webReservation;
  let apiProcess;
  let webProcess;
  let failure;
  let smoke;
  try {
    apiReservation = await reserveLoopbackPort();
    const apiBaseUrl = `http://127.0.0.1:${apiReservation.port}`;
    const masterKey = randomBytes(32).toString('base64');
    const apiEnvironment = {
      ...environment,
      HOST: '127.0.0.1',
      PORT: String(apiReservation.port),
      STORAGE_DIR: storagePath,
      API_CORS_ORIGINS: 'http://127.0.0.1:4174',
      API_REMOTE_TOKEN: '',
      SOURCE_READER_MASTER_KEY: masterKey,
      SOURCE_READER_CURSOR_KEY: 'legacy-canonical-candidate-smoke-key',
      SOURCE_READER_LOCAL_ADMIN: 'false',
      SOURCE_READER_PLUGIN_DIR: join(storagePath, 'source-plugins')
    };
    const logDirectory = join(artifactDirectory, 'logs');
    await apiReservation.release();
    apiReservation = undefined;
    apiProcess = await startManagedProcess({
      name: 'legacy-api',
      command: process.execPath,
      args: ['--experimental-sqlite', apiEntry],
      cwd: root,
      env: apiEnvironment,
      logPath: join(logDirectory, 'legacy-api.log'),
      secretValues: [masterKey, storagePath]
    });
    const health = await waitForHttp(`${apiBaseUrl}/health`, { timeoutMs });
    const healthBody = await health.json();
    if (healthBody?.data?.ok !== true || healthBody?.data?.name !== 'novel-tool') {
      throw new Error('Legacy API health smoke returned an invalid response');
    }

    await apiProcess.stop();
    apiProcess = undefined;
    webReservation = await reserveLoopbackPort();
    const webBaseUrl = `http://127.0.0.1:${webReservation.port}`;
    await webReservation.release();
    webReservation = undefined;
    webProcess = await startManagedProcess({
      name: 'legacy-web',
      command: process.execPath,
      args: [
        vite,
        'preview',
        '--host',
        '127.0.0.1',
        '--port',
        String(new URL(webBaseUrl).port),
        '--strictPort'
      ],
      cwd: webRoot,
      env: environment,
      logPath: join(logDirectory, 'legacy-web.log'),
      secretValues: [storagePath]
    });
    await waitForHttp(`${webBaseUrl}/`, {
      timeoutMs,
      accept: async (response) => response.ok && (await response.text()).includes('id="root"')
    });
    smoke = { apiHealth: true, webHome: true };
  } catch (error) {
    failure = error;
  } finally {
    for (const processHandle of [webProcess, apiProcess]) {
      if (!processHandle) continue;
      try {
        await processHandle.stop();
      } catch (error) {
        failure ??= error;
      }
    }
    for (const reservation of [webReservation, apiReservation]) {
      if (!reservation) continue;
      try {
        await reservation.release();
      } catch (error) {
        failure ??= error;
      }
    }
    await rm(runtimeRoot, { recursive: true, force: true });
  }
  if (failure) throw failure;
  return smoke;
}

export async function verifyCanonicalCandidate({
  root = projectRoot,
  storage,
  candidateManifestPath,
  rollbackRehearsalPath,
  outputPath,
  coverageMatrixPath = join(root, 'specs', 'v3-retained-test-coverage.json'),
  coverageRoot = root,
  readHead = () => gitHead(root),
  isAncestor: readAncestor = (ancestor, descendant) => isAncestor(ancestor, descendant, root),
  commandRunner = (step) => runCanonicalVerificationStep(step, { root }),
  canonicalSmokeRunner = (input) =>
    runCanonicalRuntimeSmoke({ ...input, root, artifactDirectory: dirname(resolve(outputPath)) }),
  legacySmokeRunner = (input) =>
    runLegacyRuntimeSmoke({ ...input, root, artifactDirectory: dirname(resolve(outputPath)) }),
  now = new Date(),
  maxRollbackAgeMs = 6 * 60 * 60 * 1_000
}) {
  if (!storage || !candidateManifestPath || !rollbackRehearsalPath || !outputPath) {
    throw new Error('Canonical verification requires storage, evidence, and output paths');
  }
  const output = resolve(outputPath);
  await rm(output, { force: true });
  const startedAt = now.toISOString();
  const currentCommit = await readHead();
  const [candidate, rollback, coverage, storageEvidence] = await Promise.all([
    validateCandidateManifest({
      path: candidateManifestPath,
      currentCommit,
      readAncestor
    }),
    validateRollbackRehearsal({
      path: rollbackRehearsalPath,
      currentCommit,
      now,
      maxAgeMs: maxRollbackAgeMs
    }),
    validateRetainedTestCoverage({ root, coverageRoot, matrixPath: coverageMatrixPath }),
    inspectMigratedStorage(storage)
  ]);
  const apiPackage = await readWorkspacePackage(root, 'api', '@novel-tool/api');
  const webPackage = await readWorkspacePackage(root, 'web', '@novel-tool/web');
  const legacyApiPackage = await readWorkspacePackage(root, 'api-legacy', '@novel-tool/api-legacy');
  const legacyWebPackage = await readWorkspacePackage(root, 'web-legacy', '@novel-tool/web-legacy');

  const commandResults = [];
  for (const step of canonicalVerificationSteps) {
    const stepStarted = performance.now();
    console.log(`[verify:v3:canonical] START ${step.name}`);
    const result = await commandRunner(step, { root });
    if (result?.passed !== true) throw new Error(`Canonical verification failed: ${step.name}`);
    const durationMs = Number.isFinite(result.durationMs)
      ? result.durationMs
      : Math.round(performance.now() - stepStarted);
    commandResults.push({
      name: step.name,
      command: `npm run ${step.script}`,
      durationMs,
      passed: true
    });
    console.log(`[verify:v3:canonical] PASS ${step.name} (${durationMs}ms)`);
  }

  const canonicalSmoke = await canonicalSmokeRunner({
    storagePath: storage,
    artifactDirectory: dirname(output),
    root
  });
  assertBooleanFields(canonicalSmoke, smokeFields, 'Canonical runtime smoke');
  const legacySmoke = await legacySmokeRunner({
    artifactDirectory: dirname(output),
    root
  });
  assertBooleanFields(legacySmoke, legacySmokeFields, 'Legacy runtime smoke');

  const finalCommit = await readHead();
  if (finalCommit !== currentCommit) throw new Error('HEAD changed during canonical verification');
  const finalStorage = await inspectMigratedStorage(storage);
  if (finalStorage.storageManifestSha256 !== storageEvidence.storageManifestSha256) {
    throw new Error('Staging storage changed during canonical verification');
  }
  const result = {
    formatVersion: 1,
    commit: currentCommit,
    apiPackage,
    webPackage,
    legacyApiPackage,
    legacyWebPackage,
    storageSchemaVersion: finalStorage.schemaVersion,
    preCutoverCandidateCommit: candidate.manifest.commit,
    preCutoverCandidateSha256: candidate.sha256,
    rollbackRehearsalSha256: rollback.sha256,
    stagingStorageManifestSha256: finalStorage.storageManifestSha256,
    retainedCoverageSha256: coverage.sha256,
    commands: commandResults,
    canonicalSmoke,
    legacySmoke,
    startedAt,
    completedAt: new Date().toISOString(),
    passed: true
  };
  await writeJsonAtomic(output, result);
  return result;
}

function option(args, name) {
  const index = args.indexOf(name);
  const value = index < 0 ? undefined : args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return value;
}

function printHelp() {
  console.log(`Usage: node --experimental-sqlite scripts/v3/verify-canonical-candidate.mjs [options]

Options:
  --storage <path>                 Migrated staging storage directory
  --candidate-manifest <path>      Pre-cutover candidate manifest
  --rollback-rehearsal <path>      Fresh rollback rehearsal artifact
  --output <path>                  Canonical acceptance artifact`);
}

const isMain =
  process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    printHelp();
  } else {
    verifyCanonicalCandidate({
      storage: option(args, '--storage'),
      candidateManifestPath: option(args, '--candidate-manifest'),
      rollbackRehearsalPath: option(args, '--rollback-rehearsal'),
      outputPath: option(args, '--output')
    })
      .then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
      .catch((error) => {
        console.error(error instanceof Error ? (error.stack ?? error.message) : error);
        process.exitCode = 1;
      });
  }
}
