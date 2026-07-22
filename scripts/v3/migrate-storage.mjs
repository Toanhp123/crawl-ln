import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { cp, lstat, mkdir, readdir, rename, rm } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { writeMigrationReportAtomic } from './migration-report.mjs';
import { findStorageDatabase, sha256File, storageManifest } from './storage-manifest.mjs';

const execFileAsync = promisify(execFile);
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const importCli = join(
  projectRoot,
  'apps',
  'api-next',
  'src',
  'platform',
  'migration',
  'v22-import.cli.ts'
);
const DEFAULT_SOURCE = join(projectRoot, 'apps', 'api', 'storage');
const DEFAULT_STAGING = join(projectRoot, '.artifacts', 'v3', 'staging');
const DEFAULT_REPORT = join(projectRoot, '.artifacts', 'v3', 'migration-report.json');

function isSameOrNested(parent, child) {
  const path = relative(parent, child);
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
}

function assertSafeDirectory(path, name) {
  if (dirname(path) === path) throw new Error(`${name} must not be a filesystem root`);
}

export function assertMigrationPaths({ source, staging, reportPath }) {
  const sourcePath = resolve(source);
  const stagingPath = resolve(staging);
  const outputPath = resolve(reportPath);
  assertSafeDirectory(sourcePath, 'Source storage');
  assertSafeDirectory(stagingPath, 'Staging storage');
  if (sourcePath === projectRoot || isSameOrNested(stagingPath, projectRoot)) {
    throw new Error('Source and staging storage must not use the repository root');
  }
  if (isSameOrNested(sourcePath, stagingPath) || isSameOrNested(stagingPath, sourcePath)) {
    throw new Error('Source and staging storage paths must be separate');
  }
  if (isSameOrNested(sourcePath, outputPath) || isSameOrNested(stagingPath, outputPath)) {
    throw new Error('Migration report must be outside source and staging storage');
  }
}

async function pathExists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return false;
    throw error;
  }
}

async function prepareStaging(staging, replaceStaging) {
  if (await pathExists(staging)) {
    const entries = await readdir(staging);
    if (entries.length > 0 && !replaceStaging) {
      throw new Error(`Staging storage is not empty: ${staging}`);
    }
    if (entries.length > 0) await rm(staging, { recursive: true, force: true });
  }
  await mkdir(dirname(staging), { recursive: true });
}

async function runImporter(sourcePath, targetPath) {
  const { stdout } = await execFileAsync(
    process.execPath,
    [
      '--experimental-sqlite',
      '--import',
      'tsx',
      importCli,
      '--source',
      sourcePath,
      '--target',
      targetPath
    ],
    { cwd: projectRoot, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
  );
  return JSON.parse(stdout.trim());
}

async function removeDatabaseFiles(path) {
  await Promise.all([
    rm(path, { force: true }),
    rm(`${path}-wal`, { force: true }),
    rm(`${path}-shm`, { force: true })
  ]);
}

export async function migrateStorage({
  mode,
  source,
  staging,
  reportPath,
  replaceStaging = false
}) {
  if (!['dry-run', 'staging'].includes(mode))
    throw new Error(`Unsupported migration mode: ${mode}`);
  const sourcePath = resolve(source);
  const stagingPath = resolve(staging);
  const outputPath = resolve(reportPath);
  assertMigrationPaths({ source: sourcePath, staging: stagingPath, reportPath: outputPath });

  const startedAt = new Date().toISOString();
  const sourceDatabase = await findStorageDatabase(sourcePath);
  const sourceManifestBefore = await storageManifest(sourcePath);
  const sourceDatabaseSha256Before = await sha256File(sourceDatabase);
  await prepareStaging(stagingPath, replaceStaging);
  await cp(sourcePath, stagingPath, { recursive: true, preserveTimestamps: true });

  const copiedSourceDatabase = join(stagingPath, relative(sourcePath, sourceDatabase));
  const candidateTemporary = join(stagingPath, `.v3-candidate-${randomUUID()}.sqlite`);
  const candidateDatabase = join(stagingPath, 'novel-tool.sqlite');
  let importReport;
  try {
    importReport = await runImporter(copiedSourceDatabase, candidateTemporary);
    await removeDatabaseFiles(copiedSourceDatabase);
    if (candidateDatabase !== copiedSourceDatabase) await removeDatabaseFiles(candidateDatabase);
    await rename(candidateTemporary, candidateDatabase);
  } finally {
    await removeDatabaseFiles(candidateTemporary);
  }

  const sourceManifestAfter = await storageManifest(sourcePath);
  const sourceDatabaseSha256After = await sha256File(sourceDatabase);
  if (
    sourceManifestAfter.sha256 !== sourceManifestBefore.sha256 ||
    sourceDatabaseSha256After !== sourceDatabaseSha256Before
  ) {
    throw new Error('Source storage changed during migration');
  }

  const candidateManifest = await storageManifest(stagingPath);
  const report = {
    formatVersion: 1,
    mode,
    source: {
      storagePath: sourcePath,
      schemaVersion: 22,
      databaseSha256: sourceDatabaseSha256Before,
      storageManifestSha256: sourceManifestBefore.sha256
    },
    candidate: {
      storagePath: stagingPath,
      schemaVersion: importReport.candidateSchemaVersion,
      databaseSha256: await sha256File(candidateDatabase),
      storageManifestSha256: candidateManifest.sha256
    },
    validation: importReport.validation,
    startedAt,
    completedAt: new Date().toISOString()
  };
  await writeMigrationReportAtomic(outputPath, report);
  return report;
}

export function runMigrationDryRun(input) {
  return migrateStorage({ ...input, mode: 'dry-run' });
}

function option(args, name, fallback) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return value;
}

const isMain =
  process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  const args = process.argv.slice(2);
  migrateStorage({
    mode: option(args, '--mode', 'dry-run'),
    source: option(args, '--source', process.env.V3_MIGRATION_SOURCE ?? DEFAULT_SOURCE),
    staging: option(args, '--staging', process.env.V3_MIGRATION_STAGING ?? DEFAULT_STAGING),
    reportPath: option(args, '--report', process.env.V3_MIGRATION_REPORT ?? DEFAULT_REPORT),
    replaceStaging: args.includes('--replace-staging')
  })
    .then((report) => process.stdout.write(`${JSON.stringify(report, null, 2)}\n`))
    .catch((error) => {
      console.error(error instanceof Error ? (error.stack ?? error.message) : error);
      process.exitCode = 1;
    });
}
