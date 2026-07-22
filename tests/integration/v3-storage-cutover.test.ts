import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rename, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { promisify } from 'node:util';
import { cutoverStorage } from '../../scripts/v3/cutover-storage.mjs';
import { rollbackStorage } from '../../scripts/v3/rollback-storage.mjs';
import { sha256File, storageManifest } from '../../scripts/v3/storage-manifest.mjs';

const execFileAsync = promisify(execFile);

async function exists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function gitHead() {
  const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });
  return stdout.trim();
}

async function createStorage(path: string, marker: 'v22' | 'v3') {
  await mkdir(path, { recursive: true });
  const databasePath = join(path, 'novel-tool.sqlite');
  const database = new DatabaseSync(databasePath);
  database.exec(
    `CREATE TABLE cutover_marker (value TEXT NOT NULL); INSERT INTO cutover_marker VALUES ('${marker}')`
  );
  database.exec(`PRAGMA user_version = ${marker === 'v22' ? 22 : 23}`);
  database.close();
}

function readMarker(path: string) {
  const database = new DatabaseSync(join(path, 'novel-tool.sqlite'), { readOnly: true });
  try {
    return database.prepare('SELECT value FROM cutover_marker').get()!.value as string;
  } finally {
    database.close();
  }
}

async function writeEvidence(root: string, livePath: string, candidatePath: string) {
  const migrationReportPath = join(root, 'migration-report.json');
  const candidateManifestPath = join(root, 'candidate-manifest.json');
  const sourceManifest = await storageManifest(livePath);
  const candidateStorageManifest = await storageManifest(candidatePath);
  const migrationReport = {
    formatVersion: 1,
    mode: 'staging',
    source: {
      storagePath: livePath,
      schemaVersion: 22,
      databaseSha256: await sha256File(join(livePath, 'novel-tool.sqlite')),
      storageManifestSha256: sourceManifest.sha256
    },
    candidate: {
      storagePath: candidatePath,
      schemaVersion: 23,
      databaseSha256: await sha256File(join(candidatePath, 'novel-tool.sqlite')),
      storageManifestSha256: candidateStorageManifest.sha256
    },
    validation: {
      idsPreserved: true,
      timestampsPreserved: true,
      recordCounts: { marker: { source: 1, candidate: 1 } },
      chapterContentSha256: '1'.repeat(64),
      taskOutcomeSha256: '2'.repeat(64),
      sourceReaderMetadataSha256: '3'.repeat(64),
      schedulerPolicySha256: '4'.repeat(64),
      searchRebuilt: true,
      errors: []
    },
    startedAt: '2026-07-22T00:00:00.000Z',
    completedAt: '2026-07-22T00:01:00.000Z'
  };
  const migrationBytes = Buffer.from(`${JSON.stringify(migrationReport, null, 2)}\n`);
  await writeFile(migrationReportPath, migrationBytes);
  const candidateManifest = {
    formatVersion: 1,
    commit: await gitHead(),
    migrationReportSha256: createHash('sha256').update(migrationBytes).digest('hex'),
    verification: {
      command: 'npm run verify:v3',
      passed: true,
      completedAt: '2026-07-22T00:02:00.000Z'
    },
    smoke: {
      apiHealth: true,
      httpContracts: true,
      webRoutes: true,
      reader: true,
      sourceReaderAdmin: true
    }
  };
  await writeFile(candidateManifestPath, `${JSON.stringify(candidateManifest, null, 2)}\n`, 'utf8');
  return {
    candidateManifestPath,
    migrationReportPath,
    sourceManifestSha256: sourceManifest.sha256,
    candidateManifestSha256: candidateStorageManifest.sha256
  };
}

async function storageCutoverFixture() {
  const root = await mkdtemp(join(tmpdir(), 'novel-tool-v3-cutover-'));
  const livePath = join(root, 'storage-live');
  const candidatePath = join(root, 'storage-candidate');
  const backupPath = join(root, 'storage-v22-backup');
  const failedCandidatePath = join(root, 'storage-v3-failed');
  const journalPath = join(root, 'cutover-journal.json');
  await createStorage(livePath, 'v22');
  await createStorage(candidatePath, 'v3');
  const evidence = await writeEvidence(root, livePath, candidatePath);
  return {
    root,
    livePath,
    candidatePath,
    backupPath,
    failedCandidatePath,
    journalPath,
    ...evidence,
    options: {
      livePath,
      candidatePath,
      backupPath,
      failedCandidatePath,
      journalPath,
      candidateManifestPath: evidence.candidateManifestPath,
      migrationReportPath: evidence.migrationReportPath
    }
  };
}

test('cutover atomically swaps candidate storage and rollback restores source bytes', async () => {
  const fixture = await storageCutoverFixture();
  const journal = await cutoverStorage(fixture.options);

  assert.equal(readMarker(fixture.livePath), 'v3');
  assert.equal(readMarker(fixture.backupPath), 'v22');
  assert.equal(journal.state, 'live-swapped');
  assert.equal(journal.sourceManifestSha256, fixture.sourceManifestSha256);
  assert.equal(journal.candidateManifestSha256, fixture.candidateManifestSha256);

  const rolledBack = await rollbackStorage({ journalPath: journal.path });

  assert.equal(readMarker(fixture.livePath), 'v22');
  assert.equal(readMarker(fixture.failedCandidatePath), 'v3');
  assert.equal((await storageManifest(fixture.livePath)).sha256, fixture.sourceManifestSha256);
  assert.equal(rolledBack.state, 'rolled-back');
  assert.equal(rolledBack.failedCandidatePath, fixture.failedCandidatePath);
});

test('failed candidate rename restores live storage before returning an error', async () => {
  const fixture = await storageCutoverFixture();

  await assert.rejects(
    () =>
      cutoverStorage({
        ...fixture.options,
        renamePath: async (source: string, target: string) => {
          if (source === fixture.candidatePath && target === fixture.livePath) {
            throw Object.assign(new Error('injected candidate rename failure'), { code: 'EACCES' });
          }
          await rename(source, target);
        }
      }),
    /injected candidate rename failure/i
  );

  assert.equal(readMarker(fixture.livePath), 'v22');
  assert.equal(readMarker(fixture.candidatePath), 'v3');
  assert.equal(await exists(fixture.backupPath), false);
  assert.equal(JSON.parse(await readFile(fixture.journalPath, 'utf8')).state, 'prepared');
});

test('cutover refuses tampered candidate evidence without moving storage', async () => {
  const fixture = await storageCutoverFixture();
  await writeFile(join(fixture.candidatePath, 'tampered.txt'), 'tampered', 'utf8');

  await assert.rejects(() => cutoverStorage(fixture.options), /manifest hash mismatch/i);

  assert.equal(readMarker(fixture.livePath), 'v22');
  assert.equal(readMarker(fixture.candidatePath), 'v3');
  assert.equal(await exists(fixture.backupPath), false);
});

test('cutover refuses an existing operation lock without moving storage', async () => {
  const fixture = await storageCutoverFixture();
  await writeFile(`${fixture.journalPath}.lock`, 'owner', 'utf8');

  await assert.rejects(() => cutoverStorage(fixture.options), /locked/i);

  assert.equal(readMarker(fixture.livePath), 'v22');
  assert.equal(readMarker(fixture.candidatePath), 'v3');
});
