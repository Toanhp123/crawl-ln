import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { importV22StagingDatabase } from '../../apps/api/src/platform/migration/v22-import.cli.ts';
import { createV22StorageFixture } from '../../scripts/v3/create-v22-fixture.mjs';
import { validateMigrationReport } from '../../scripts/v3/migration-report.mjs';
import { assertMigrationPaths, runMigrationDryRun } from '../../scripts/v3/migrate-storage.mjs';
import { sha256File, storageManifest } from '../../scripts/v3/storage-manifest.mjs';
import { createV22Fixture } from '../helpers/v22-database.fixture.ts';

test('v22 fixture command creates a canonical storage directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'novel-tool-v3-fixture-command-'));
  const output = join(root, 'fixture');

  const fixture = await createV22StorageFixture(output);

  assert.equal(fixture.schemaVersion, 22);
  assert.equal(fixture.databasePath, join(output, 'novel-tool.sqlite'));
  assert.equal((await storageManifest(output)).files.length, 1);
});

test('migration commands are exposed from the root and api-next workspaces', async () => {
  const rootPackage = JSON.parse(await readFile('package.json', 'utf8')) as {
    scripts: Record<string, string>;
  };
  const apiPackage = JSON.parse(await readFile('apps/api/package.json', 'utf8')) as {
    scripts: Record<string, string>;
  };

  assert.equal(
    rootPackage.scripts['migrate:v3:dry-run'],
    'node --experimental-sqlite scripts/v3/migrate-storage.mjs --mode dry-run'
  );
  assert.equal(
    apiPackage.scripts['migrate:v22'],
    'node --experimental-sqlite --import tsx src/platform/migration/v22-import.cli.ts'
  );
});

test('migration dry run preserves source bytes and emits complete validation evidence', async () => {
  const root = await mkdtemp(join(tmpdir(), 'novel-tool-v3-migration-'));
  const source = join(root, 'source');
  const staging = join(root, 'staging');
  const reportPath = join(root, 'migration-report.json');
  await createV22Fixture(source);
  const before = await storageManifest(source);

  const report = await runMigrationDryRun({ source, staging, reportPath });
  const after = await storageManifest(source);

  assert.deepEqual(after, before);
  assert.equal(report.source.schemaVersion, 22);
  assert.ok(report.candidate.schemaVersion > 22);
  assert.equal(report.validation.idsPreserved, true);
  assert.equal(report.validation.timestampsPreserved, true);
  assert.equal(report.validation.errors.length, 0);
  assert.equal(report.validation.searchRebuilt, true);
  assert.match(report.source.databaseSha256, /^[a-f0-9]{64}$/);
  assert.match(report.source.storageManifestSha256, /^[a-f0-9]{64}$/);
  assert.match(report.candidate.databaseSha256, /^[a-f0-9]{64}$/);
  assert.match(report.candidate.storageManifestSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(JSON.parse(await readFile(reportPath, 'utf8')), report);
});

test('repeated dry runs produce identical candidate integrity evidence', async () => {
  const root = await mkdtemp(join(tmpdir(), 'novel-tool-v3-migration-repeat-'));
  const source = join(root, 'source');
  await createV22Fixture(source);

  const first = await runMigrationDryRun({
    source,
    staging: join(root, 'staging-first'),
    reportPath: join(root, 'report-first.json')
  });
  const second = await runMigrationDryRun({
    source,
    staging: join(root, 'staging-second'),
    reportPath: join(root, 'report-second.json')
  });

  assert.equal(second.candidate.databaseSha256, first.candidate.databaseSha256);
  assert.equal(second.candidate.storageManifestSha256, first.candidate.storageManifestSha256);
  assert.deepEqual(second.validation, first.validation);
});

test('staging importer reports the hash of its finalized database bytes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'novel-tool-v3-import-cli-'));
  const fixture = await createV22Fixture(join(root, 'source'));
  const targetPath = join(root, 'candidate.sqlite');

  const report = await importV22StagingDatabase({
    sourcePath: fixture.databasePath,
    targetPath
  });

  assert.equal(report.targetDatabaseSha256, await sha256File(targetPath));
  assert.equal(report.candidateSchemaVersion, 23);
});

test('report validation rejects failed preservation evidence even without listed errors', async () => {
  const root = await mkdtemp(join(tmpdir(), 'novel-tool-v3-report-validation-'));
  const source = join(root, 'source');
  const staging = join(root, 'staging');
  const reportPath = join(root, 'report.json');
  await createV22Fixture(source);
  const report = await runMigrationDryRun({ source, staging, reportPath });
  report.validation.idsPreserved = false;
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  await assert.rejects(() => validateMigrationReport({ reportPath, staging }), /validation/i);
});

test('migration rejects overlapping paths and populated staging without replacement', async () => {
  const root = await mkdtemp(join(tmpdir(), 'novel-tool-v3-migration-paths-'));
  const source = join(root, 'source');
  await createV22Fixture(source);

  await assert.rejects(
    () =>
      runMigrationDryRun({
        source,
        staging: join(source, 'staging'),
        reportPath: join(root, 'overlap-report.json')
      }),
    /separate/i
  );

  const staging = join(root, 'staging');
  await mkdir(staging);
  await writeFile(join(staging, 'owner-data.txt'), 'keep', 'utf8');
  await assert.rejects(
    () =>
      runMigrationDryRun({
        source,
        staging,
        reportPath: join(root, 'populated-report.json')
      }),
    /not empty/i
  );
  assert.equal(await readFile(join(staging, 'owner-data.txt'), 'utf8'), 'keep');
});

test('migration path safety rejects the repository root as staging', () => {
  assert.throws(
    () =>
      assertMigrationPaths({
        source: join(tmpdir(), 'novel-tool-v22-source'),
        staging: resolve('.'),
        reportPath: join(tmpdir(), 'novel-tool-v3-report.json')
      }),
    /repository root/i
  );
});

test('report validation re-hashes staging and detects candidate tampering', async () => {
  const root = await mkdtemp(join(tmpdir(), 'novel-tool-v3-report-tamper-'));
  const source = join(root, 'source');
  const staging = join(root, 'staging');
  const reportPath = join(root, 'report.json');
  await createV22Fixture(source);
  await runMigrationDryRun({ source, staging, reportPath });
  await validateMigrationReport({ reportPath, staging });
  await writeFile(join(staging, 'tampered.txt'), 'tampered', 'utf8');

  await assert.rejects(
    () => validateMigrationReport({ reportPath, staging }),
    /manifest hash mismatch/i
  );
});
