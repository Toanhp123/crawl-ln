import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { findStorageDatabase, sha256File, storageManifest } from './storage-manifest.mjs';

const SHA256 = /^[a-f0-9]{64}$/;
const validationHashes = [
  'chapterContentSha256',
  'taskOutcomeSha256',
  'sourceReaderMetadataSha256',
  'schedulerPolicySha256'
];

function assertTimestamp(value, name) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new Error(`Invalid migration report ${name}`);
  }
}

function assertStorageEvidence(value, name) {
  if (!value || typeof value !== 'object') throw new Error(`Missing migration report ${name}`);
  if (typeof value.storagePath !== 'string' || value.storagePath.length === 0) {
    throw new Error(`Invalid migration report ${name}.storagePath`);
  }
  for (const field of ['databaseSha256', 'storageManifestSha256']) {
    if (!SHA256.test(value[field] ?? '')) {
      throw new Error(`Invalid migration report ${name}.${field}`);
    }
  }
}

export function assertMigrationReport(report) {
  if (!report || typeof report !== 'object') throw new Error('Migration report must be an object');
  if (report.formatVersion !== 1) throw new Error('Unsupported migration report formatVersion');
  if (!['dry-run', 'staging'].includes(report.mode))
    throw new Error('Invalid migration report mode');
  assertStorageEvidence(report.source, 'source');
  assertStorageEvidence(report.candidate, 'candidate');
  if (report.source.schemaVersion !== 22) throw new Error('Migration source schema must be 22');
  if (!Number.isInteger(report.candidate.schemaVersion) || report.candidate.schemaVersion <= 22) {
    throw new Error('Migration candidate schema must be newer than 22');
  }
  if (!report.validation || typeof report.validation !== 'object') {
    throw new Error('Missing migration validation evidence');
  }
  for (const field of ['idsPreserved', 'timestampsPreserved', 'searchRebuilt']) {
    if (typeof report.validation[field] !== 'boolean') {
      throw new Error(`Invalid migration validation ${field}`);
    }
  }
  if (!report.validation.recordCounts || typeof report.validation.recordCounts !== 'object') {
    throw new Error('Invalid migration validation recordCounts');
  }
  for (const [name, counts] of Object.entries(report.validation.recordCounts)) {
    if (
      !counts ||
      typeof counts !== 'object' ||
      !Number.isInteger(counts.source) ||
      !Number.isInteger(counts.candidate)
    ) {
      throw new Error(`Invalid migration validation recordCounts.${name}`);
    }
  }
  for (const field of validationHashes) {
    if (!SHA256.test(report.validation[field] ?? '')) {
      throw new Error(`Invalid migration validation ${field}`);
    }
  }
  if (!Array.isArray(report.validation.errors))
    throw new Error('Invalid migration validation errors');
  assertTimestamp(report.startedAt, 'startedAt');
  assertTimestamp(report.completedAt, 'completedAt');
  return report;
}

export async function writeMigrationReportAtomic(path, report) {
  assertMigrationReport(report);
  const target = resolve(path);
  const lockPath = `${target}.lock`;
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
  await mkdir(dirname(target), { recursive: true });
  let lock;
  try {
    lock = await open(lockPath, 'wx');
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'EEXIST') {
      throw new Error(`Migration report is locked: ${target}`);
    }
    throw error;
  }

  try {
    await writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
    await lock.close();
    await rm(lockPath, { force: true });
  }
}

export async function validateMigrationReport({ reportPath, staging }) {
  const report = assertMigrationReport(JSON.parse(await readFile(resolve(reportPath), 'utf8')));
  const stagingPath = resolve(staging);
  if (resolve(report.candidate.storagePath) !== stagingPath) {
    throw new Error('Migration report candidate storage path does not match staging');
  }
  if (report.validation.errors.length > 0) {
    throw new Error(`Migration validation contains errors: ${report.validation.errors.join('; ')}`);
  }
  if (
    report.validation.idsPreserved !== true ||
    report.validation.timestampsPreserved !== true ||
    report.validation.searchRebuilt !== true
  ) {
    throw new Error('Migration validation contains a failed preservation check');
  }
  for (const [name, counts] of Object.entries(report.validation.recordCounts)) {
    if (counts.source !== counts.candidate) {
      throw new Error(`Migration validation count mismatch: ${name}`);
    }
  }
  const manifest = await storageManifest(stagingPath);
  if (manifest.sha256 !== report.candidate.storageManifestSha256) {
    throw new Error('Migration candidate storage manifest hash mismatch');
  }
  const databaseSha256 = await sha256File(await findStorageDatabase(stagingPath));
  if (databaseSha256 !== report.candidate.databaseSha256) {
    throw new Error('Migration candidate database hash mismatch');
  }
  return report;
}

function option(args, name) {
  const index = args.indexOf(name);
  const value = index < 0 ? undefined : args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return value;
}

const isMain =
  process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  validateMigrationReport({
    reportPath: option(process.argv.slice(2), '--check'),
    staging: option(process.argv.slice(2), '--staging')
  })
    .then(() => console.log('Migration report is valid.'))
    .catch((error) => {
      console.error(error instanceof Error ? (error.stack ?? error.message) : error);
      process.exitCode = 1;
    });
}
