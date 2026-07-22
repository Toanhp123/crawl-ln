import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import {
  createCandidateManifest,
  writeCandidateManifestFromEvidence
} from '../../scripts/v3/candidate-manifest.mjs';
import { createV22StorageFixture } from '../../scripts/v3/create-v22-fixture.mjs';
import { runMigrationDryRun } from '../../scripts/v3/migrate-storage.mjs';
import {
  reserveLoopbackPort,
  startManagedProcess,
  waitForHttp
} from '../../scripts/v3/process-runner.mjs';
import {
  assertRedactedCandidateData,
  createCandidateApiEnvironment,
  createCandidateRuntimeStorage,
  ensureCandidateSmokeProbe,
  runCandidateHttpSmoke,
  smokeCandidate
} from '../../scripts/v3/smoke-candidate.mjs';

function reportFixture(overrides: { errors?: string[] } = {}) {
  return {
    formatVersion: 1,
    mode: 'dry-run',
    source: {
      storagePath: '/fixture/source',
      schemaVersion: 22,
      databaseSha256: '1'.repeat(64),
      storageManifestSha256: '2'.repeat(64)
    },
    candidate: {
      storagePath: '/fixture/staging',
      schemaVersion: 23,
      databaseSha256: '3'.repeat(64),
      storageManifestSha256: '4'.repeat(64)
    },
    validation: {
      idsPreserved: true,
      timestampsPreserved: true,
      recordCounts: { novels: { source: 1, candidate: 1 } },
      chapterContentSha256: '5'.repeat(64),
      taskOutcomeSha256: '6'.repeat(64),
      sourceReaderMetadataSha256: '7'.repeat(64),
      schedulerPolicySha256: '8'.repeat(64),
      searchRebuilt: true,
      errors: overrides.errors ?? []
    },
    startedAt: '2026-07-22T00:00:00.000Z',
    completedAt: '2026-07-22T00:01:00.000Z'
  };
}

function passedVerificationFixture() {
  return {
    formatVersion: 1,
    command: 'npm run verify:v3',
    commit: 'abc123',
    startedAt: '2026-07-22T00:01:00.000Z',
    completedAt: '2026-07-22T00:03:00.000Z',
    steps: [
      'check:lockfile',
      'prepare:packages',
      'check:docs',
      'check:current-reference',
      'build:current-reference',
      'check:api-next-arch',
      'check:web-next-arch',
      'check:web-next-contracts',
      'check:reader-engine-arch',
      'check:next-types',
      'build:next',
      'contract',
      'regression',
      'integration',
      'e2e:web-next'
    ].map((name) => ({ name, durationMs: 10 })),
    passed: true
  } as const;
}

function passedSmokeFixture() {
  return {
    apiHealth: true,
    httpContracts: true,
    webRoutes: true,
    reader: true,
    sourceReaderAdmin: true
  } as const;
}

test('candidate manifest binds verification and smoke evidence to one commit', () => {
  const result = createCandidateManifest({
    commit: 'abc123',
    migrationReport: reportFixture(),
    verification: passedVerificationFixture(),
    smoke: passedSmokeFixture()
  });

  assert.equal(result.commit, 'abc123');
  assert.match(result.migrationReportSha256, /^[a-f0-9]{64}$/);
  assert.equal(result.verification.command, 'npm run verify:v3');
  assert.equal(result.smoke.sourceReaderAdmin, true);
});

test('candidate manifest refuses an incomplete verification graph', () => {
  const passed = passedVerificationFixture();
  const verification = { ...passed, steps: passed.steps.slice(0, 1) };
  assert.throws(
    () =>
      createCandidateManifest({
        commit: 'abc123',
        migrationReport: reportFixture(),
        verification,
        smoke: passedSmokeFixture()
      }),
    /verification/i
  );
});

test('candidate manifest refuses unsuccessful migration evidence', () => {
  assert.throws(
    () =>
      createCandidateManifest({
        commit: 'abc123',
        migrationReport: reportFixture({ errors: ['metadata mismatch'] }),
        verification: passedVerificationFixture(),
        smoke: passedSmokeFixture()
      }),
    /migration/i
  );
});

test('candidate evidence writer revalidates staging and hashes exact report bytes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'novel-tool-v3-candidate-evidence-'));
  const source = join(root, 'source');
  const staging = join(root, 'staging');
  const migrationReportPath = join(root, 'migration.json');
  const verificationReportPath = join(root, 'verification.json');
  const outputPath = join(root, 'candidate.json');
  await createV22StorageFixture(source);
  const migration = await runMigrationDryRun({
    source,
    staging,
    reportPath: migrationReportPath
  });
  const verification = {
    ...passedVerificationFixture(),
    startedAt: migration.completedAt,
    completedAt: new Date(Date.parse(migration.completedAt) + 1_000).toISOString()
  };
  await writeFile(verificationReportPath, `${JSON.stringify(verification, null, 2)}\n`, 'utf8');

  const manifest = await writeCandidateManifestFromEvidence({
    migrationReportPath,
    verificationReportPath,
    outputPath,
    smoke: passedSmokeFixture(),
    readHead: async () => 'abc123',
    now: new Date(Date.parse(verification.completedAt) + 1_000)
  });
  const migrationBytes = await readFile(migrationReportPath);

  assert.equal(
    manifest.migrationReportSha256,
    createHash('sha256').update(migrationBytes).digest('hex')
  );
  assert.deepEqual(JSON.parse(await readFile(outputPath, 'utf8')), manifest);
});

test('candidate smoke rejects a migration report containing validation errors', async () => {
  await assert.rejects(
    () => smokeCandidate({ migrationReport: reportFixture({ errors: ['count mismatch'] }) }),
    /validation/i
  );
});

test('candidate API environment preserves the configured Source Reader master key', () => {
  const environment = createCandidateApiEnvironment({
    baseEnvironment: { SOURCE_READER_MASTER_KEY: 'configured-key' },
    apiPort: 31_001,
    webBaseUrl: 'http://127.0.0.1:41001',
    storagePath: 'D:/candidate-storage'
  });

  assert.equal(environment.SOURCE_READER_MASTER_KEY, 'configured-key');
  assert.equal(environment.NEXT_API_PORT, '31001');
  assert.equal(environment.NEXT_STORAGE_DIR, 'D:/candidate-storage');
});

test('candidate redaction checks detect escaped Windows storage paths', () => {
  assert.throws(
    () =>
      assertRedactedCandidateData({ diagnosticPath: 'D:\\candidate-storage\\private.sqlite' }, [
        'D:\\candidate-storage'
      ]),
    /sensitive/i
  );
});

test('candidate runtime storage is disposable and leaves staging bytes unchanged', async () => {
  const root = await mkdtemp(join(tmpdir(), 'novel-tool-v3-runtime-storage-'));
  const staging = join(root, 'staging');
  await createV22StorageFixture(staging);
  const before = await readFile(join(staging, 'novel-tool.sqlite'));
  const runtime = await createCandidateRuntimeStorage({
    staging,
    workRoot: join(root, 'runtime')
  });
  await writeFile(join(runtime.path, 'runtime-only.txt'), 'changed', 'utf8');

  assert.deepEqual(await readFile(join(staging, 'novel-tool.sqlite')), before);
  await runtime.cleanup();
  await assert.rejects(() => access(runtime.path));
});

test('candidate runtime seeds a disposable reader probe when migrated storage is empty', async () => {
  const root = await mkdtemp(join(tmpdir(), 'novel-tool-v3-empty-runtime-'));
  const source = join(root, 'source');
  const staging = join(root, 'staging');
  const reportPath = join(root, 'migration.json');
  await createV22StorageFixture(source);

  const sourceDatabase = new DatabaseSync(join(source, 'novel-tool.sqlite'));
  sourceDatabase.exec('DELETE FROM crawl_tasks; DELETE FROM chapters; DELETE FROM novels');
  sourceDatabase.close();
  await runMigrationDryRun({ source, staging, reportPath });

  const stagingBefore = await readFile(join(staging, 'novel-tool.sqlite'));
  const runtime = await createCandidateRuntimeStorage({
    staging,
    workRoot: join(root, 'runtime')
  });
  const probe = await ensureCandidateSmokeProbe(runtime.path);
  const runtimeDatabase = new DatabaseSync(join(runtime.path, 'novel-tool.sqlite'), {
    readOnly: true
  });

  try {
    assert.equal(probe.seeded, true);
    assert.equal(
      runtimeDatabase.prepare('SELECT COUNT(*) AS count FROM library_novels').get()!.count,
      1
    );
    assert.equal(
      runtimeDatabase.prepare('SELECT clean_text FROM library_chapters').get()!.clean_text,
      'Candidate smoke chapter content.'
    );
    assert.deepEqual(await readFile(join(staging, 'novel-tool.sqlite')), stagingBefore);
  } finally {
    runtimeDatabase.close();
    await runtime.cleanup();
  }
});

test('candidate smoke command is exposed and its evidence directory is ignored', async () => {
  const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as {
    scripts: Record<string, string>;
  };
  const gitignore = await readFile('.gitignore', 'utf8');

  assert.equal(
    packageJson.scripts['smoke:v3:candidate'],
    'node --experimental-sqlite scripts/v3/smoke-candidate.mjs'
  );
  assert.match(gitignore, /^\.artifacts\/$/m);
});

test('candidate HTTP smoke covers health, library, reader, web routes and redacted admin data', async () => {
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    response.setHeader(
      'content-type',
      path.startsWith('/api') || path === '/health' ? 'application/json' : 'text/html'
    );
    if (path === '/health') {
      response.end(JSON.stringify({ data: { ok: true, name: 'novel-tool' }, error: null }));
      return;
    }
    if (path === '/api/not-a-route') {
      response.statusCode = 404;
      response.end(JSON.stringify({ data: null, error: { code: 'NOT_FOUND' } }));
      return;
    }
    if (path === '/api/novels') {
      response.end(
        JSON.stringify({
          data: { items: [{ id: 'fixture-novel', title: 'Fixture Novel' }], total: 1 },
          error: null
        })
      );
      return;
    }
    if (path === '/api/novels/fixture-novel') {
      response.end(
        JSON.stringify({
          data: {
            novel: { id: 'fixture-novel', title: 'Fixture Novel' },
            chapters: [{ id: 'fixture-chapter', index: 1 }]
          },
          error: null
        })
      );
      return;
    }
    if (path === '/api/novels/fixture-novel/chapters/1') {
      response.end(
        JSON.stringify({
          data: { id: 'fixture-chapter', index: 1, cleanText: 'Fixture chapter content.' },
          error: null
        })
      );
      return;
    }
    if (path.startsWith('/api/source-reader/')) {
      response.end(JSON.stringify({ data: [], error: null }));
      return;
    }
    response.end('<!doctype html><div id="root"></div>');
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    assert.deepEqual(
      await runCandidateHttpSmoke({ apiBaseUrl: baseUrl, webBaseUrl: baseUrl }),
      passedSmokeFixture()
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
});

test('managed candidate processes use loopback ports and redact captured secrets', async () => {
  const root = await mkdtemp(join(tmpdir(), 'novel-tool-v3-process-runner-'));
  const logPath = join(root, 'server.log');
  const secret = 'candidate-secret-value';
  const [secretPrefix, secretSuffix] = ['candidate-', 'secret-value'];
  const reservation = await reserveLoopbackPort();
  const port = reservation.port;
  await reservation.release();
  const program = [
    "const http = require('node:http')",
    `process.stdout.write('secret=${secretPrefix}')`,
    `const server = http.createServer((req, res) => { res.writeHead(200, {'content-type':'application/json'}); res.end('{\"ok\":true}') })`,
    `setTimeout(() => { process.stdout.write('${secretSuffix}\\n'); server.listen(${port}, '127.0.0.1') }, 20)`,
    "process.on('SIGTERM', () => server.close(() => process.exit(0)))"
  ].join(';');
  const processHandle = await startManagedProcess({
    name: 'fixture-server',
    command: process.execPath,
    args: ['-e', program],
    cwd: root,
    env: process.env,
    logPath,
    secretValues: [secret]
  });

  try {
    await waitForHttp(`http://127.0.0.1:${port}`, { timeoutMs: 5_000 });
  } finally {
    await processHandle.stop();
  }

  const log = await readFile(logPath, 'utf8');
  assert.doesNotMatch(log, new RegExp(secret));
  assert.doesNotMatch(log, new RegExp(secretPrefix));
  assert.doesNotMatch(log, new RegExp(secretSuffix));
  assert.match(log, /\[REDACTED\]/);
});
