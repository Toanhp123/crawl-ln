import { randomUUID } from 'node:crypto';
import { cp, lstat, mkdir, readdir, rm } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { runV3Verification } from '../verify-v3.mjs';
import { cutoverStorage } from './cutover-storage.mjs';
import { validateMigrationReport } from './migration-report.mjs';
import { runMigrationDryRun } from './migrate-storage.mjs';
import { rollbackStorage } from './rollback-storage.mjs';
import { smokeCandidate } from './smoke-candidate.mjs';
import { gitHead, pathExists, writeJsonAtomic } from './storage-safety.mjs';
import { findStorageDatabase, storageManifest } from './storage-manifest.mjs';

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

function isSameOrNested(parent, child) {
  const path = relative(parent, child);
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
}

async function assertFixtureDirectory(path) {
  const entry = await lstat(path);
  if (!entry.isDirectory() || entry.isSymbolicLink()) {
    throw new Error(`Rehearsal fixture must be a real directory: ${path}`);
  }
}

async function prepareWorkDirectory(path, replace) {
  if (dirname(path) === path) throw new Error('Rehearsal work directory must not be a root');
  if (await pathExists(path)) {
    const entries = await readdir(path);
    if (entries.length > 0 && !replace) {
      throw new Error(`Rehearsal work directory is not empty: ${path}`);
    }
    if (entries.length > 0) await rm(path, { recursive: true, force: true });
  }
  await mkdir(path, { recursive: true });
}

async function defaultVerificationRunner({ verificationReportPath }) {
  await runV3Verification({ reportPath: verificationReportPath });
}

async function defaultCandidateEvidenceRunner({
  migrationReportPath,
  verificationReportPath,
  candidateManifestPath
}) {
  return smokeCandidate({
    migrationReportPath,
    verificationReportPath,
    outputPath: candidateManifestPath
  });
}

async function defaultLiveSmoke({ livePath, migrationReport }) {
  const database = new DatabaseSync(await findStorageDatabase(livePath), { readOnly: true });
  try {
    const version = migrationReport?.candidate?.schemaVersion;
    if (!Number.isInteger(version) || version <= 22) {
      throw new Error(`Live rehearsal evidence has invalid schema version: ${version}`);
    }
    const migrationCount = database
      .prepare('SELECT COUNT(*) AS count FROM platform_module_migrations')
      .get().count;
    if (!Number.isInteger(Number(migrationCount)) || Number(migrationCount) === 0) {
      throw new Error('Live rehearsal storage has no applied module migrations');
    }
    const novel = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'library_novels'")
      .get();
    if (!novel) throw new Error('Live rehearsal storage is missing the migrated library');
    return { schemaVersion: version, moduleMigrations: Number(migrationCount), library: true };
  } finally {
    database.close();
  }
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

export async function rehearseCutover({
  fixture,
  workDir,
  outputPath,
  replaceWorkDir = false,
  verificationRunner = defaultVerificationRunner,
  candidateEvidenceRunner = defaultCandidateEvidenceRunner,
  liveSmoke = defaultLiveSmoke,
  injectLiveSmokeFailure = false,
  expectLiveSmokeFailure = injectLiveSmokeFailure
}) {
  const root = resolve(workDir);
  const fixturePath = fixture ? resolve(fixture) : join(root, 'fixture-source');
  if (isSameOrNested(fixturePath, root) || isSameOrNested(root, fixturePath)) {
    throw new Error('Rehearsal fixture and work directory must be separate');
  }
  await prepareWorkDirectory(root, replaceWorkDir);
  if (fixture) {
    await assertFixtureDirectory(fixturePath);
  } else {
    const { createV22StorageFixture } = await import('./create-v22-fixture.mjs');
    await createV22StorageFixture(fixturePath);
  }

  const paths = {
    livePath: join(root, 'storage-live'),
    candidatePath: join(root, 'storage-candidate'),
    backupPath: join(root, 'storage-v22-backup'),
    failedCandidatePath: join(root, 'storage-v3-failed'),
    migrationReportPath: join(root, 'migration-report.json'),
    verificationReportPath: join(root, 'verification.json'),
    candidateManifestPath: join(root, 'candidate-manifest.json'),
    journalPath: join(root, 'cutover-journal.json')
  };
  const resultPath = resolve(outputPath ?? join(root, 'rollback-rehearsal.json'));
  const completed = [];
  const startedAt = new Date().toISOString();

  await cp(fixturePath, paths.livePath, { recursive: true, preserveTimestamps: true });
  const sourceBefore = await storageManifest(paths.livePath);
  completed.push('copy');

  await runMigrationDryRun({
    source: paths.livePath,
    staging: paths.candidatePath,
    reportPath: paths.migrationReportPath
  });
  completed.push('migrate');

  const migrationReport = await validateMigrationReport({
    reportPath: paths.migrationReportPath,
    staging: paths.candidatePath
  });
  completed.push('validate');

  await verificationRunner({ ...paths, workDir: root });
  await candidateEvidenceRunner({ ...paths, workDir: root });
  completed.push('candidate-smoke');

  const journal = await cutoverStorage({
    ...paths,
    candidateManifestPath: paths.candidateManifestPath,
    migrationReportPath: paths.migrationReportPath
  });
  completed.push('cutover');

  let liveSmokeFailure;
  let liveSmokeFailureInjected = false;
  try {
    await liveSmoke({ ...paths, journal, migrationReport, workDir: root });
    if (injectLiveSmokeFailure) {
      liveSmokeFailureInjected = true;
      throw new Error('Injected rehearsal live-smoke failure');
    }
  } catch (error) {
    liveSmokeFailure = error;
  }
  completed.push('live-smoke');

  await rollbackStorage({ journalPath: paths.journalPath });
  completed.push('rollback');

  const sourceAfter = await storageManifest(paths.livePath);
  const sourceManifestRestored = sourceAfter.sha256 === sourceBefore.sha256;
  if (!sourceManifestRestored) {
    throw new Error('Rehearsal rollback did not restore the source storage manifest');
  }
  completed.push('hash-verify');

  if (injectLiveSmokeFailure && !liveSmokeFailureInjected) {
    throw new Error(
      `Rehearsal live smoke failed before the injected branch: ${errorMessage(liveSmokeFailure)}`
    );
  }
  if (expectLiveSmokeFailure && !liveSmokeFailure) {
    throw new Error('Rehearsal expected a live-smoke failure but none occurred');
  }
  if (!expectLiveSmokeFailure && liveSmokeFailure) throw liveSmokeFailure;

  const result = {
    formatVersion: 1,
    commit: await gitHead(),
    steps: completed,
    sourceManifestSha256: sourceBefore.sha256,
    candidateManifestSha256: journal.candidateManifestSha256,
    sourceManifestRestored,
    rollbackTriggered: true,
    liveSmokeFailed: Boolean(liveSmokeFailure),
    liveSmokeFailureInjected,
    ...(liveSmokeFailure ? { liveSmokeFailure: errorMessage(liveSmokeFailure) } : {}),
    journalPath: paths.journalPath,
    workDir: root,
    startedAt,
    completedAt: new Date().toISOString()
  };
  if (completed.length !== rehearsalSteps.length) {
    throw new Error('Rehearsal did not complete the locked operation sequence');
  }
  await writeJsonAtomic(resultPath, result);
  return { ...result, path: resultPath };
}

function option(args, name, fallback) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return value;
}

function printHelp() {
  console.log(`Usage: node --experimental-sqlite scripts/v3/rehearse-cutover.mjs [options]

Options:
  --fixture <path>       Existing V22 storage fixture (default: create one outside work-dir)
  --work-dir <path>      Same-parent rehearsal workspace
  --output <path>        Rollback rehearsal result JSON
  --replace-work-dir     Replace a populated rehearsal workspace
  --no-failure-injection Do not inject the rollback-triggering live-smoke failure`);
}

const isMain =
  process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    printHelp();
  } else {
    const artifactRoot = resolve('.artifacts', 'v3');
    const workDir = option(args, '--work-dir', join(artifactRoot, `rehearsal-${randomUUID()}`));
    const fixture = option(
      args,
      '--fixture',
      join(artifactRoot, `rehearsal-fixture-${randomUUID()}`)
    );
    const suppliedFixture = args.includes('--fixture');
    const run = async () => {
      if (!suppliedFixture) {
        const { createV22StorageFixture } = await import('./create-v22-fixture.mjs');
        await createV22StorageFixture(fixture);
      }
      return rehearseCutover({
        fixture,
        workDir,
        outputPath: option(args, '--output', join(artifactRoot, 'rollback-rehearsal.json')),
        replaceWorkDir: args.includes('--replace-work-dir'),
        injectLiveSmokeFailure: !args.includes('--no-failure-injection')
      });
    };
    run()
      .then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
      .catch((error) => {
        console.error(error instanceof Error ? (error.stack ?? error.message) : error);
        process.exitCode = 1;
      });
  }
}
