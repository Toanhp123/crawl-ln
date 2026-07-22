import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const currentCommit = 'c'.repeat(40);
const canonicalCommit = 'b'.repeat(40);
const preCutoverCommit = 'a'.repeat(40);
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const sha = '1'.repeat(64);
const verificationStepNames = [
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

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

function verification(commit: string) {
  return {
    formatVersion: 1,
    command: 'npm run verify:v3',
    commit,
    startedAt: '2026-07-23T10:00:00.000Z',
    completedAt: '2026-07-23T10:05:00.000Z',
    steps: verificationStepNames.map((name) => ({ name, durationMs: 1 })),
    passed: true
  };
}

function rollbackRehearsal(commit: string, workDir: string) {
  return {
    formatVersion: 1,
    commit,
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
    sourceManifestSha256: sha,
    candidateManifestSha256: sha,
    sourceManifestRestored: true,
    rollbackTriggered: true,
    liveSmokeFailed: true,
    liveSmokeFailureInjected: true,
    workDir,
    journalPath: `${workDir}/cutover-journal.json`,
    startedAt: '2026-07-23T09:20:00.000Z',
    completedAt: '2026-07-23T09:30:00.000Z'
  };
}

function migrationReport() {
  return {
    formatVersion: 1,
    mode: 'staging',
    source: {
      storagePath: 'source-storage',
      schemaVersion: 22,
      databaseSha256: sha,
      storageManifestSha256: sha
    },
    candidate: {
      storagePath: 'candidate-storage',
      schemaVersion: 23,
      databaseSha256: sha,
      storageManifestSha256: sha
    },
    validation: {
      idsPreserved: true,
      timestampsPreserved: true,
      recordCounts: { novels: { source: 1, candidate: 1 } },
      chapterContentSha256: sha,
      taskOutcomeSha256: sha,
      sourceReaderMetadataSha256: sha,
      schedulerPolicySha256: sha,
      searchRebuilt: true,
      errors: []
    },
    startedAt: '2026-07-23T09:00:00.000Z',
    completedAt: '2026-07-23T09:01:00.000Z'
  };
}

function completeArtifacts() {
  const migration = migrationReport();
  const migrationBytes = json(migration);
  const finalMigration = {
    ...migrationReport(),
    source: { ...migration.source, storagePath: 'rehearsal-source-storage' },
    candidate: { ...migration.candidate, storagePath: 'rehearsal-candidate-storage' }
  };
  const finalMigrationBytes = json(finalMigration);
  const preCandidate = {
    formatVersion: 1,
    commit: preCutoverCommit,
    migrationReportSha256: hash(migrationBytes),
    verification: {
      command: 'npm run verify:v3',
      passed: true,
      completedAt: '2026-07-23T09:05:00.000Z'
    },
    smoke: {
      apiHealth: true,
      httpContracts: true,
      webRoutes: true,
      reader: true,
      sourceReaderAdmin: true
    }
  };
  const preCandidateBytes = json(preCandidate);
  const acceptedRollback = rollbackRehearsal(canonicalCommit, 'rehearsal-accepted');
  const acceptedRollbackBytes = json(acceptedRollback);
  const canonical = {
    formatVersion: 1,
    commit: canonicalCommit,
    apiPackage: '@novel-tool/api',
    webPackage: '@novel-tool/web',
    preCutoverCandidateCommit: preCutoverCommit,
    preCutoverCandidateSha256: hash(preCandidateBytes),
    rollbackRehearsalSha256: hash(acceptedRollbackBytes),
    stagingStorageManifestSha256: sha,
    commands: [{ name: 'verify', durationMs: 1, passed: true }],
    canonicalSmoke: {
      apiHealth: true,
      httpContracts: true,
      webRoutes: true,
      reader: true,
      sourceReaderAdmin: true
    },
    legacySmoke: { apiHealth: true, webHome: true },
    passed: true,
    startedAt: '2026-07-23T09:10:00.000Z',
    completedAt: '2026-07-23T09:15:00.000Z'
  };
  const canonicalBytes = json(canonical);
  const acceptance = {
    formatVersion: 1,
    commit: canonicalCommit,
    canonicalCandidateSha256: hash(canonicalBytes),
    approvedBy: 'release-operator-secret',
    approvedAt: '2026-07-23T09:16:00.000Z',
    legacyRemovalApproved: true
  };
  const rollback = rollbackRehearsal(currentCommit, 'rehearsal-current');
  const journal = {
    formatVersion: 1,
    state: 'rolled-back',
    livePath: 'storage-live',
    candidatePath: 'storage-candidate',
    backupPath: 'storage-v22-backup',
    failedCandidatePath: 'storage-v3-failed',
    sourceManifestSha256: sha,
    candidateManifestSha256: sha,
    createdAt: '2026-07-23T09:25:00.000Z',
    updatedAt: '2026-07-23T09:29:00.000Z'
  };
  const finalCandidate = {
    ...preCandidate,
    commit: currentCommit,
    migrationReportSha256: hash(finalMigrationBytes)
  };
  return {
    migration,
    migrationBytes,
    finalMigration,
    finalMigrationBytes,
    preCandidate,
    preCandidateBytes,
    canonical,
    canonicalBytes,
    acceptance,
    acceptedRollback,
    acceptedRollbackBytes,
    rollback,
    journal,
    finalCandidate,
    verification: verification(currentCommit)
  };
}

function refreshAcceptedRollbackLineage(artifacts: ReturnType<typeof completeArtifacts>) {
  artifacts.acceptedRollbackBytes = json(artifacts.acceptedRollback);
  artifacts.canonical.rollbackRehearsalSha256 = hash(artifacts.acceptedRollbackBytes);
  refreshCanonicalLineage(artifacts);
}

function refreshCanonicalLineage(artifacts: ReturnType<typeof completeArtifacts>) {
  artifacts.canonicalBytes = json(artifacts.canonical);
  artifacts.acceptance.canonicalCandidateSha256 = hash(artifacts.canonicalBytes);
}

async function writeFixture(root: string, artifacts: ReturnType<typeof completeArtifacts>) {
  const paths = {
    migrationReportPath: join(root, 'migration.json'),
    preCutoverCandidatePath: join(root, 'pre-candidate.json'),
    canonicalCandidatePath: join(root, 'canonical.json'),
    acceptancePath: join(root, 'acceptance.json'),
    acceptedRollbackRehearsalPath: join(root, 'accepted-rollback.json'),
    rollbackRehearsalPath: join(root, 'rollback.json'),
    finalMigrationReportPath: join(root, 'final-migration.json'),
    cutoverJournalPath: join(root, 'journal.json'),
    finalCandidateManifestPath: join(root, 'final-candidate.json'),
    finalVerificationPath: join(root, 'verification.json')
  };
  await Promise.all([
    writeFile(paths.migrationReportPath, artifacts.migrationBytes),
    writeFile(paths.preCutoverCandidatePath, artifacts.preCandidateBytes),
    writeFile(paths.canonicalCandidatePath, artifacts.canonicalBytes),
    writeFile(paths.acceptancePath, `${JSON.stringify(artifacts.acceptance, null, 2)}\n`),
    writeFile(paths.acceptedRollbackRehearsalPath, artifacts.acceptedRollbackBytes),
    writeFile(paths.rollbackRehearsalPath, `${JSON.stringify(artifacts.rollback, null, 2)}\n`),
    writeFile(paths.finalMigrationReportPath, artifacts.finalMigrationBytes),
    writeFile(paths.cutoverJournalPath, `${JSON.stringify(artifacts.journal, null, 2)}\n`),
    writeFile(
      paths.finalCandidateManifestPath,
      `${JSON.stringify(artifacts.finalCandidate, null, 2)}\n`
    ),
    writeFile(paths.finalVerificationPath, `${JSON.stringify(artifacts.verification, null, 2)}\n`)
  ]);
  return paths;
}

test('release evidence refuses missing or mismatched verification artifacts', async () => {
  const { createReleaseEvidence } = await import('../../scripts/v3/release-evidence.mjs');
  await assert.rejects(() => createReleaseEvidence({ root: tmpdir(), artifacts: {} }), /missing/i);

  const root = await mkdtemp(join(tmpdir(), 'novel-tool-release-evidence-'));
  try {
    const fixture = completeArtifacts();
    const paths = await writeFixture(root, fixture);
    const evidence = await createReleaseEvidence({
      root,
      artifacts: paths,
      readHead: async () => currentCommit,
      isAncestor: async () => true,
      now: new Date('2026-07-23T09:31:00.000Z')
    });
    assert.equal(evidence.version, '3.0.0');
    assert.equal(evidence.commit, currentCommit);
    for (const value of Object.values(evidence.artifactSha256)) {
      assert.match(value, /^[a-f0-9]{64}$/);
    }
    assert.doesNotMatch(JSON.stringify(evidence), /release-operator-secret/);
    assert.doesNotMatch(JSON.stringify(evidence), /raw log|password|token/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('release evidence rejects a canonical artifact from a different lineage', async () => {
  const { createReleaseEvidence } = await import('../../scripts/v3/release-evidence.mjs');
  const root = await mkdtemp(join(tmpdir(), 'novel-tool-release-evidence-'));
  try {
    const fixture = completeArtifacts();
    const paths = await writeFixture(root, fixture);
    await assert.rejects(
      () =>
        createReleaseEvidence({
          root,
          artifacts: paths,
          readHead: async () => currentCommit,
          isAncestor: async () => false,
          now: new Date('2026-07-23T09:31:00.000Z')
        }),
      /acceptance|canonical|lineage/i
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('release evidence requires the canonical rollback rehearsal hash', async () => {
  const { createReleaseEvidence } = await import('../../scripts/v3/release-evidence.mjs');
  const root = await mkdtemp(join(tmpdir(), 'novel-tool-release-evidence-'));
  try {
    const fixture = completeArtifacts();
    delete (fixture.canonical as { rollbackRehearsalSha256?: string }).rollbackRehearsalSha256;
    refreshCanonicalLineage(fixture);
    const paths = await writeFixture(root, fixture);
    await assert.rejects(
      () =>
        createReleaseEvidence({
          root,
          artifacts: paths,
          readHead: async () => currentCommit,
          isAncestor: async () => true,
          now: new Date('2026-07-23T09:31:00.000Z')
        }),
      /canonical candidate rollback rehearsal hash is required/i
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('release evidence links final migration source storage to rollback evidence', async () => {
  const { createReleaseEvidence } = await import('../../scripts/v3/release-evidence.mjs');
  const root = await mkdtemp(join(tmpdir(), 'novel-tool-release-evidence-'));
  try {
    const fixture = completeArtifacts();
    fixture.finalMigration.source.storageManifestSha256 = '2'.repeat(64);
    fixture.finalMigrationBytes = json(fixture.finalMigration);
    fixture.finalCandidate.migrationReportSha256 = hash(fixture.finalMigrationBytes);
    const paths = await writeFixture(root, fixture);
    await assert.rejects(
      () =>
        createReleaseEvidence({
          root,
          artifacts: paths,
          readHead: async () => currentCommit,
          isAncestor: async () => true,
          now: new Date('2026-07-23T09:31:00.000Z')
        }),
      /final migration report does not match rollback source storage/i
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('release evidence rejects an incomplete final verification graph', async () => {
  const { createReleaseEvidence } = await import('../../scripts/v3/release-evidence.mjs');
  const root = await mkdtemp(join(tmpdir(), 'novel-tool-release-evidence-'));
  try {
    const fixture = completeArtifacts();
    fixture.verification.steps = fixture.verification.steps.slice(0, -1);
    const paths = await writeFixture(root, fixture);
    await assert.rejects(
      () =>
        createReleaseEvidence({
          root,
          artifacts: paths,
          readHead: async () => currentCommit,
          isAncestor: async () => true,
          now: new Date('2026-07-23T09:31:00.000Z')
        }),
      /final verification graph is incomplete/i
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('release evidence rejects an accepted rollback from the wrong commit', async () => {
  const { createReleaseEvidence } = await import('../../scripts/v3/release-evidence.mjs');
  const root = await mkdtemp(join(tmpdir(), 'novel-tool-release-evidence-'));
  try {
    const fixture = completeArtifacts();
    fixture.acceptedRollback.commit = preCutoverCommit;
    refreshAcceptedRollbackLineage(fixture);
    const paths = await writeFixture(root, fixture);
    await assert.rejects(
      () =>
        createReleaseEvidence({
          root,
          artifacts: paths,
          readHead: async () => currentCommit,
          isAncestor: async () => true,
          now: new Date('2026-07-23T09:31:00.000Z')
        }),
      /accepted rollback rehearsal commit does not match/i
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('release evidence rejects accepted rollback evidence without restored source storage', async () => {
  const { createReleaseEvidence } = await import('../../scripts/v3/release-evidence.mjs');
  const root = await mkdtemp(join(tmpdir(), 'novel-tool-release-evidence-'));
  try {
    const fixture = completeArtifacts();
    fixture.acceptedRollback.sourceManifestRestored = false;
    refreshAcceptedRollbackLineage(fixture);
    const paths = await writeFixture(root, fixture);
    await assert.rejects(
      () =>
        createReleaseEvidence({
          root,
          artifacts: paths,
          readHead: async () => currentCommit,
          isAncestor: async () => true,
          now: new Date('2026-07-23T09:31:00.000Z')
        }),
      /accepted rollback rehearsal did not restore source storage/i
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
