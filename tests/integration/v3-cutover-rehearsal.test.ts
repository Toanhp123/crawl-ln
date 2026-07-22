import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { writeCandidateManifestFromEvidence } from '../../scripts/v3/candidate-manifest.mjs';
import { createV22StorageFixture } from '../../scripts/v3/create-v22-fixture.mjs';
import { rehearseCutover } from '../../scripts/v3/rehearse-cutover.mjs';

const execFileAsync = promisify(execFile);
const verificationSteps = [
  'check:lockfile',
  'prepare:packages',
  'check:docs',
  'check:current-reference',
  'build:current-reference',
  'check:arch',
  'check:web-arch',
  'check:web-contracts',
  'check:reader-engine-arch',
  'check:types',
  'build',
  'contract',
  'regression',
  'integration',
  'e2e'
];

async function fixtureEvidenceRunners() {
  const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });
  const commit = stdout.trim();
  return {
    verificationRunner: async ({ migrationReportPath, verificationReportPath }: any) => {
      const migration = JSON.parse(await readFile(migrationReportPath, 'utf8'));
      const startedAt = migration.completedAt;
      const completedAt = new Date(Date.parse(startedAt) + 1_000).toISOString();
      await writeFile(
        verificationReportPath,
        `${JSON.stringify(
          {
            formatVersion: 1,
            command: 'npm run verify:v3',
            commit,
            startedAt,
            completedAt,
            steps: verificationSteps.map((name) => ({ name, durationMs: 1 })),
            passed: true
          },
          null,
          2
        )}\n`,
        'utf8'
      );
    },
    candidateEvidenceRunner: async ({
      migrationReportPath,
      verificationReportPath,
      candidateManifestPath
    }: any) =>
      writeCandidateManifestFromEvidence({
        migrationReportPath,
        verificationReportPath,
        outputPath: candidateManifestPath,
        smoke: {
          apiHealth: true,
          httpContracts: true,
          webRoutes: true,
          reader: true,
          sourceReaderAdmin: true
        },
        now: new Date()
      })
  };
}

test('rehearsal migrates, verifies, swaps, smokes, rolls back, and restores hashes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'novel-tool-v3-rehearsal-'));
  const fixture = await createV22StorageFixture(join(root, 'fixture'));
  const evidenceRunners = await fixtureEvidenceRunners();
  const result = await rehearseCutover({
    fixture: fixture.databasePath.replace(/novel-tool\.sqlite$/, ''),
    workDir: join(root, 'work'),
    ...evidenceRunners,
    expectLiveSmokeFailure: true,
    liveSmoke: async () => {
      throw new Error('injected live-smoke failure');
    }
  });

  assert.deepEqual(result.steps, [
    'copy',
    'migrate',
    'validate',
    'candidate-smoke',
    'cutover',
    'live-smoke',
    'rollback',
    'hash-verify'
  ]);
  assert.equal(result.sourceManifestRestored, true);
  assert.equal(result.liveSmokeFailed, true);
  assert.equal(result.rollbackTriggered, true);
});

test('rehearsal records a successful live smoke before its planned rollback', async () => {
  const root = await mkdtemp(join(tmpdir(), 'novel-tool-v3-rehearsal-success-'));
  const fixture = await createV22StorageFixture(join(root, 'fixture'));
  const evidenceRunners = await fixtureEvidenceRunners();
  const result = await rehearseCutover({
    fixture: fixture.databasePath.replace(/novel-tool\.sqlite$/, ''),
    workDir: join(root, 'work'),
    ...evidenceRunners,
    liveSmoke: async () => ({ health: true, library: true })
  });

  assert.equal(result.liveSmokeFailed, false);
  assert.equal(result.sourceManifestRestored, true);
  assert.equal(result.rollbackTriggered, true);
});

test('rehearsal injects failure only after the default live smoke passes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'novel-tool-v3-rehearsal-default-smoke-'));
  const fixture = await createV22StorageFixture(join(root, 'fixture'));
  const evidenceRunners = await fixtureEvidenceRunners();
  const result = await rehearseCutover({
    fixture: fixture.databasePath.replace(/novel-tool\.sqlite$/, ''),
    workDir: join(root, 'work'),
    ...evidenceRunners,
    injectLiveSmokeFailure: true
  });

  assert.equal(result.liveSmokeFailed, true);
  assert.equal(result.liveSmokeFailureInjected, true);
  assert.equal(result.sourceManifestRestored, true);
});
