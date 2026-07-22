import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { createV22StorageFixture } from '../../scripts/v3/create-v22-fixture.mjs';
import { runMigrationDryRun } from '../../scripts/v3/migrate-storage.mjs';

const capabilities = [
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

async function canonicalFixture() {
  const root = await mkdtemp(join(tmpdir(), 'novel-tool-v3-canonical-'));
  const source = join(root, 'source');
  const storage = join(root, 'staging');
  const candidateManifestPath = join(root, 'candidate-manifest.json');
  const rollbackRehearsalPath = join(root, 'rollback-rehearsal.json');
  const outputPath = join(root, 'canonical-candidate.json');
  const now = new Date('2026-07-22T12:00:00.000Z');
  await mkdir(join(root, 'apps', 'api'), { recursive: true });
  await mkdir(join(root, 'apps', 'web'), { recursive: true });
  await mkdir(join(root, 'apps', 'api-legacy'), { recursive: true });
  await mkdir(join(root, 'apps', 'web-legacy'), { recursive: true });
  for (const [path, name] of [
    ['apps/api/package.json', '@novel-tool/api'],
    ['apps/web/package.json', '@novel-tool/web'],
    ['apps/api-legacy/package.json', '@novel-tool/api-legacy'],
    ['apps/web-legacy/package.json', '@novel-tool/web-legacy']
  ]) {
    await writeFile(join(root, path), `${JSON.stringify({ name })}\n`, 'utf8');
  }
  await createV22StorageFixture(source);
  await runMigrationDryRun({
    source,
    staging: storage,
    reportPath: join(root, 'migration-report.json')
  });
  await writeFile(
    candidateManifestPath,
    `${JSON.stringify({
      formatVersion: 1,
      commit: 'candidate-commit',
      migrationReportSha256: 'a'.repeat(64),
      verification: {
        command: 'npm run verify:v3',
        passed: true,
        completedAt: '2026-07-22T10:00:00.000Z'
      },
      smoke: {
        apiHealth: true,
        httpContracts: true,
        webRoutes: true,
        reader: true,
        sourceReaderAdmin: true
      }
    })}\n`,
    'utf8'
  );
  await writeFile(
    rollbackRehearsalPath,
    `${JSON.stringify({
      formatVersion: 1,
      commit: 'current-commit',
      steps: [
        'copy',
        'migrate',
        'validate',
        'candidate-smoke',
        'cutover',
        'live-smoke',
        'rollback',
        'hash-verify'
      ],
      sourceManifestSha256: 'b'.repeat(64),
      candidateManifestSha256: 'c'.repeat(64),
      sourceManifestRestored: true,
      rollbackTriggered: true,
      liveSmokeFailed: true,
      liveSmokeFailureInjected: true,
      startedAt: '2026-07-22T11:58:00.000Z',
      completedAt: '2026-07-22T11:59:00.000Z'
    })}\n`,
    'utf8'
  );

  return {
    root,
    storage,
    candidateManifestPath,
    rollbackRehearsalPath,
    outputPath,
    coverageMatrixPath: resolve('specs/v3-retained-test-coverage.json'),
    coverageRoot: resolve('.'),
    now,
    readHead: async () => 'current-commit',
    isAncestor: async (ancestor: string, descendant: string) =>
      ancestor === 'candidate-commit' && descendant === 'current-commit',
    commandRunner: async ({ name }: { name: string }) => ({ name, passed: true, durationMs: 1 }),
    canonicalSmokeRunner: async () => ({
      apiHealth: true,
      httpContracts: true,
      webRoutes: true,
      reader: true,
      sourceReaderAdmin: true
    }),
    legacySmokeRunner: async () => ({ apiHealth: true, webHome: true })
  };
}

test('retained V3 coverage names every acceptance capability', async () => {
  const matrix = JSON.parse(
    await readFile('specs/v3-retained-test-coverage.json', 'utf8')
  ) as Record<string, string[]>;

  assert.deepEqual(Object.keys(matrix).sort(), capabilities);
  for (const files of Object.values(matrix)) {
    assert.ok(files.length > 0);
    for (const file of files) {
      const source = await readFile(file, 'utf8');
      assert.doesNotMatch(source, /apps\/(?:api|web)-legacy|current-api\.runtime/);
    }
  }
});

test('canonical candidate uses V3 packages and migrated storage', async () => {
  const { verifyCanonicalCandidate } =
    await import('../../scripts/v3/verify-canonical-candidate.mjs');
  const fixture = await canonicalFixture();
  const result = await verifyCanonicalCandidate(fixture);

  assert.equal(result.apiPackage, '@novel-tool/api');
  assert.equal(result.webPackage, '@novel-tool/web');
  assert.equal(result.storageSchemaVersion > 22, true);
  assert.equal(result.passed, true);
  assert.match(result.preCutoverCandidateSha256, /^[a-f0-9]{64}$/);
  assert.match(result.rollbackRehearsalSha256, /^[a-f0-9]{64}$/);
  assert.match(result.stagingStorageManifestSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(JSON.parse(await readFile(fixture.outputPath, 'utf8')), result);
});

test('canonical candidate verification is exposed through the root package', async () => {
  const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as {
    scripts: Record<string, string>;
  };
  const { canonicalVerificationSteps } =
    await import('../../scripts/v3/verify-canonical-candidate.mjs');

  assert.equal(
    packageJson.scripts['verify:v3:canonical'],
    'node --experimental-sqlite scripts/v3/verify-canonical-candidate.mjs'
  );
  assert.deepEqual(
    canonicalVerificationSteps.map((step: { name: string }) => step.name),
    ['verify', 'build:legacy', 'reader-engine', 'e2e']
  );
});

test('canonical verification invokes npm without a child-process shell', async () => {
  const { createNpmInvocation } = await import('../../scripts/v3/verify-canonical-candidate.mjs');

  assert.deepEqual(
    createNpmInvocation('verify', {
      platform: 'win32',
      environment: {
        npm_execpath: 'C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js',
        npm_node_execpath: 'C:/Program Files/nodejs/node.exe'
      }
    }),
    {
      command: 'C:/Program Files/nodejs/node.exe',
      args: ['C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js', 'run', 'verify']
    }
  );
  assert.deepEqual(
    createNpmInvocation('build:legacy', {
      platform: 'win32',
      environment: { ComSpec: 'C:/Windows/System32/cmd.exe' }
    }),
    {
      command: 'C:/Windows/System32/cmd.exe',
      args: ['/d', '/s', '/c', 'npm.cmd run build:legacy']
    }
  );
  assert.throws(
    () =>
      createNpmInvocation('verify && whoami', {
        platform: 'win32',
        environment: { ComSpec: 'cmd.exe' }
      }),
    /invalid npm script/i
  );
});
