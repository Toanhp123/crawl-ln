import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, parse, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { assertMigrationReport, validateMigrationReport } from './migration-report.mjs';
import { findStorageDatabase, sha256File, storageManifest } from './storage-manifest.mjs';

const execFileAsync = promisify(execFile);
const SHA256 = /^[a-f0-9]{64}$/;
const smokeFields = ['apiHealth', 'httpContracts', 'webRoutes', 'reader', 'sourceReaderAdmin'];
export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

export async function pathExists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return false;
    throw error;
  }
}

function comparablePath(path) {
  const resolved = resolve(path);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function assertSafePath(path, name, repositoryRoot) {
  if (dirname(path) === path) throw new Error(`${name} must not be a filesystem root`);
  if (comparablePath(path) === comparablePath(repositoryRoot)) {
    throw new Error(`${name} must not be the repository root`);
  }
}

export function assertCutoverPaths({
  livePath,
  candidatePath,
  backupPath,
  failedCandidatePath,
  repositoryRoot = projectRoot
}) {
  const paths = {
    livePath: resolve(livePath),
    candidatePath: resolve(candidatePath),
    backupPath: resolve(backupPath),
    failedCandidatePath: resolve(failedCandidatePath)
  };
  for (const [name, path] of Object.entries(paths)) {
    assertSafePath(path, name, resolve(repositoryRoot));
  }
  if (new Set(Object.values(paths).map(comparablePath)).size !== Object.keys(paths).length) {
    throw new Error('Cutover storage paths must be distinct');
  }
  const parents = new Set(Object.values(paths).map((path) => comparablePath(dirname(path))));
  if (parents.size !== 1) {
    throw new Error('Cutover storage paths must share one parent for atomic renames');
  }
  const volumes = new Set(Object.values(paths).map((path) => comparablePath(parse(path).root)));
  if (volumes.size !== 1) throw new Error('Cross-volume storage cutover is not allowed');
  return paths;
}

export async function assertDirectory(path, name) {
  const entry = await lstat(path);
  if (!entry.isDirectory() || entry.isSymbolicLink()) {
    throw new Error(`${name} must be a real directory: ${path}`);
  }
}

export async function assertMissing(path, name) {
  if (await pathExists(path)) throw new Error(`${name} already exists: ${path}`);
}

export async function writeJsonAtomic(path, value) {
  const target = resolve(path);
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
  await mkdir(dirname(target), { recursive: true });
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function withOperationLock(journalPath, operation) {
  const lockPath = `${resolve(journalPath)}.lock`;
  await mkdir(dirname(lockPath), { recursive: true });
  let lock;
  try {
    lock = await open(lockPath, 'wx');
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'EEXIST') {
      throw new Error(`Storage cutover is locked: ${lockPath}`);
    }
    throw error;
  }
  try {
    await lock.writeFile(
      `${JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() })}\n`
    );
    return await operation();
  } finally {
    await lock.close();
    await rm(lockPath, { force: true });
  }
}

export async function assertStorageQuiescent(storagePath) {
  const manifestBefore = await storageManifest(storagePath);
  const walSidecars = manifestBefore.files.filter(
    (file) => file.path.endsWith('-wal') || file.path.endsWith('-shm')
  );
  if (walSidecars.length > 0) {
    throw new Error(
      `Storage has WAL sidecar files and cannot be checked without changing source bytes: ${walSidecars
        .map((file) => file.path)
        .join(', ')}`
    );
  }

  const databasePath = await findStorageDatabase(storagePath);
  const database = new DatabaseSync(databasePath);
  let transactionOpen = false;
  try {
    database.exec('PRAGMA busy_timeout = 1');
    database.exec('BEGIN EXCLUSIVE');
    transactionOpen = true;
    database.exec('ROLLBACK');
    transactionOpen = false;
  } catch (error) {
    if (transactionOpen) {
      try {
        database.exec('ROLLBACK');
      } catch {
        // The original lock failure is the actionable error.
      }
    }
    throw new Error(`Storage database is not quiescent: ${databasePath}`, { cause: error });
  } finally {
    database.close();
  }

  const manifestAfter = await storageManifest(storagePath);
  if (manifestAfter.sha256 !== manifestBefore.sha256) {
    throw new Error(`Storage quiescence check changed source bytes: ${databasePath}`);
  }
}

export function assertCandidateManifest(manifest, commit) {
  if (!manifest || typeof manifest !== 'object' || manifest.formatVersion !== 1) {
    throw new Error('Invalid V3 candidate manifest');
  }
  if (manifest.commit !== commit) throw new Error('Candidate manifest commit does not match HEAD');
  if (!SHA256.test(manifest.migrationReportSha256 ?? '')) {
    throw new Error('Candidate manifest migration report hash is invalid');
  }
  if (
    manifest.verification?.command !== 'npm run verify:v3' ||
    manifest.verification?.passed !== true ||
    !Number.isFinite(Date.parse(manifest.verification?.completedAt))
  ) {
    throw new Error('Candidate manifest verification evidence is invalid');
  }
  for (const field of smokeFields) {
    if (manifest.smoke?.[field] !== true) {
      throw new Error(`Candidate manifest smoke evidence is invalid: ${field}`);
    }
  }
  return manifest;
}

export async function gitHead() {
  const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
    cwd: projectRoot,
    encoding: 'utf8'
  });
  return stdout.trim();
}

function assertSuccessfulMigration(report) {
  assertMigrationReport(report);
  if (
    report.validation.idsPreserved !== true ||
    report.validation.timestampsPreserved !== true ||
    report.validation.searchRebuilt !== true ||
    report.validation.errors.length > 0 ||
    Object.values(report.validation.recordCounts).some(
      (counts) => counts.source !== counts.candidate
    )
  ) {
    throw new Error('Storage cutover requires successful migration evidence');
  }
}

export async function validateCutoverEvidence({
  livePath,
  candidatePath,
  candidateManifestPath,
  migrationReportPath,
  readHead = gitHead
}) {
  const migrationBytes = await readFile(resolve(migrationReportPath));
  const report = JSON.parse(migrationBytes.toString('utf8'));
  assertSuccessfulMigration(report);
  const manifest = assertCandidateManifest(
    JSON.parse(await readFile(resolve(candidateManifestPath), 'utf8')),
    await readHead()
  );
  if (sha256(migrationBytes) !== manifest.migrationReportSha256) {
    throw new Error('Candidate manifest migration report hash mismatch');
  }
  await validateMigrationReport({ reportPath: migrationReportPath, staging: candidatePath });

  const sourceManifest = await storageManifest(livePath);
  const candidateManifest = await storageManifest(candidatePath);
  if (sourceManifest.sha256 !== report.source.storageManifestSha256) {
    throw new Error('Source storage manifest hash mismatch');
  }
  if (candidateManifest.sha256 !== report.candidate.storageManifestSha256) {
    throw new Error('Candidate storage manifest hash mismatch');
  }
  if ((await sha256File(await findStorageDatabase(livePath))) !== report.source.databaseSha256) {
    throw new Error('Source storage database hash mismatch');
  }
  return {
    sourceManifestSha256: sourceManifest.sha256,
    candidateManifestSha256: candidateManifest.sha256
  };
}

export function assertCutoverJournal(journal) {
  if (!journal || typeof journal !== 'object' || journal.formatVersion !== 1) {
    throw new Error('Invalid V3 cutover journal');
  }
  if (!['prepared', 'live-swapped', 'rolled-back', 'accepted'].includes(journal.state)) {
    throw new Error('Invalid V3 cutover journal state');
  }
  for (const field of ['livePath', 'candidatePath', 'backupPath']) {
    if (typeof journal[field] !== 'string' || journal[field].length === 0) {
      throw new Error(`Invalid V3 cutover journal ${field}`);
    }
  }
  if (
    journal.failedCandidatePath !== undefined &&
    (typeof journal.failedCandidatePath !== 'string' || journal.failedCandidatePath.length === 0)
  ) {
    throw new Error('Invalid V3 cutover journal failedCandidatePath');
  }
  for (const field of ['sourceManifestSha256', 'candidateManifestSha256']) {
    if (!SHA256.test(journal[field] ?? '')) throw new Error(`Invalid V3 cutover journal ${field}`);
  }
  for (const field of ['createdAt', 'updatedAt']) {
    if (typeof journal[field] !== 'string' || !Number.isFinite(Date.parse(journal[field]))) {
      throw new Error(`Invalid V3 cutover journal ${field}`);
    }
  }
  return journal;
}

export async function readCutoverJournal(path) {
  return assertCutoverJournal(JSON.parse(await readFile(resolve(path), 'utf8')));
}

export async function writeCutoverJournal(path, journal) {
  assertCutoverJournal(journal);
  await writeJsonAtomic(path, journal);
}
