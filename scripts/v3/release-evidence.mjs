import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { assertMigrationReport } from './migration-report.mjs';
import { assertCutoverJournal } from './storage-safety.mjs';

const execFileAsync = promisify(execFile);
const SHA256 = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const smokeFields = ['apiHealth', 'httpContracts', 'webRoutes', 'reader', 'sourceReaderAdmin'];
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
const baseArtifactKeys = [
  'migrationReportPath',
  'preCutoverCandidatePath',
  'canonicalCandidatePath',
  'acceptancePath',
  'rollbackRehearsalPath'
];

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function assertHash(value, name) {
  if (!SHA256.test(value ?? '')) throw new Error(`${name} must be a SHA-256 hash`);
}

function assertCommit(value, name) {
  if (!COMMIT.test(value ?? '')) throw new Error(`${name} must be a full Git commit`);
}

function assertTimestamp(value, name) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${name} timestamp is invalid`);
  }
}

function assertTimestampRange(value, name) {
  assertTimestamp(value?.startedAt, `${name} startedAt`);
  assertTimestamp(value?.completedAt, `${name} completedAt`);
  if (Date.parse(value.completedAt) < Date.parse(value.startedAt)) {
    throw new Error(`${name} timestamps are out of order`);
  }
}

function assertBooleanFields(value, fields, name) {
  for (const field of fields) {
    if (value?.[field] !== true) throw new Error(`${name} did not pass: ${field}`);
  }
}

function assertSuccessfulMigration(report) {
  assertMigrationReport(report);
  if (
    report.validation.idsPreserved !== true ||
    report.validation.timestampsPreserved !== true ||
    report.validation.searchRebuilt !== true ||
    report.validation.errors.length > 0
  ) {
    throw new Error('Migration validation did not pass');
  }
  for (const [name, counts] of Object.entries(report.validation.recordCounts)) {
    if (counts.source !== counts.candidate) {
      throw new Error(`Migration validation count mismatch: ${name}`);
    }
  }
}

function assertCandidateManifest(manifest, name, expectedCommit) {
  if (!manifest || manifest.formatVersion !== 1) throw new Error(`${name} is invalid`);
  assertCommit(manifest.commit, `${name} commit`);
  if (expectedCommit && manifest.commit !== expectedCommit) {
    throw new Error(`${name} commit does not match current HEAD`);
  }
  assertHash(manifest.migrationReportSha256, `${name} migration report`);
  if (
    manifest.verification?.command !== 'npm run verify:v3' ||
    manifest.verification?.passed !== true
  ) {
    throw new Error(`${name} verification did not pass`);
  }
  assertTimestamp(manifest.verification.completedAt, `${name} verification completedAt`);
  assertBooleanFields(manifest.smoke, smokeFields, `${name} smoke`);
}

function assertCanonicalCandidate(canonical, migration, preCandidate, preCandidateSha256) {
  if (!canonical || canonical.formatVersion !== 1) {
    throw new Error('Canonical candidate artifact is invalid');
  }
  assertCommit(canonical.commit, 'Canonical candidate commit');
  if (canonical.apiPackage !== '@novel-tool/api' || canonical.webPackage !== '@novel-tool/web') {
    throw new Error('Canonical candidate workspace roles are invalid');
  }
  if (
    canonical.preCutoverCandidateCommit !== preCandidate.commit ||
    canonical.preCutoverCandidateSha256 !== preCandidateSha256
  ) {
    throw new Error('Canonical candidate does not match pre-cutover evidence');
  }
  if (canonical.stagingStorageManifestSha256 !== migration.candidate.storageManifestSha256) {
    throw new Error('Canonical candidate does not match migrated staging storage');
  }
  if (
    canonical.passed !== true ||
    !Array.isArray(canonical.commands) ||
    canonical.commands.length === 0 ||
    canonical.commands.some((command) => command?.passed !== true)
  ) {
    throw new Error('Canonical candidate verification did not pass');
  }
  assertBooleanFields(canonical.canonicalSmoke, smokeFields, 'Canonical candidate smoke');
  assertTimestampRange(canonical, 'Canonical candidate');
  if (canonical.rollbackRehearsalSha256 !== undefined) {
    assertHash(canonical.rollbackRehearsalSha256, 'Canonical rollback rehearsal');
  }
}

function assertAcceptance(acceptance, canonicalCommit, canonicalSha256) {
  if (!acceptance || acceptance.formatVersion !== 1) {
    throw new Error('Release acceptance artifact is invalid');
  }
  if (acceptance.commit !== canonicalCommit) {
    throw new Error('Release acceptance commit does not match the canonical candidate');
  }
  if (acceptance.canonicalCandidateSha256 !== canonicalSha256) {
    throw new Error('Release acceptance does not match the canonical candidate artifact');
  }
  if (typeof acceptance.approvedBy !== 'string' || acceptance.approvedBy.trim().length === 0) {
    throw new Error('Release acceptance approver is missing');
  }
  assertTimestamp(acceptance.approvedAt, 'Release acceptance approvedAt');
  if (acceptance.legacyRemovalApproved !== true) {
    throw new Error('Release acceptance did not approve legacy removal');
  }
}

function assertVerification(verification, currentCommit) {
  if (
    !verification ||
    verification.formatVersion !== 1 ||
    verification.command !== 'npm run verify:v3' ||
    verification.passed !== true
  ) {
    throw new Error('Final verification artifact did not pass');
  }
  if (verification.commit !== currentCommit) {
    throw new Error('Final verification commit does not match current HEAD');
  }
  assertTimestampRange(verification, 'Final verification');
  if (
    !Array.isArray(verification.steps) ||
    verification.steps.length !== verificationStepNames.length ||
    verification.steps.some(
      (step, index) =>
        step?.name !== verificationStepNames[index] ||
        !Number.isFinite(step.durationMs) ||
        step.durationMs < 0
    )
  ) {
    throw new Error('Final verification graph is incomplete');
  }
}

function assertRollbackRehearsal(rehearsal, expectedCommit, name = 'Rollback rehearsal') {
  if (!rehearsal || rehearsal.formatVersion !== 1) {
    throw new Error(`${name} artifact is invalid`);
  }
  if (rehearsal.commit !== expectedCommit) {
    throw new Error(`${name} commit does not match the expected commit`);
  }
  if (
    !Array.isArray(rehearsal.steps) ||
    rehearsal.steps.length !== rehearsalSteps.length ||
    rehearsal.steps.some((step, index) => step !== rehearsalSteps[index])
  ) {
    throw new Error(`${name} sequence is incomplete`);
  }
  for (const field of ['sourceManifestSha256', 'candidateManifestSha256']) {
    assertHash(rehearsal[field], `${name} ${field}`);
  }
  if (rehearsal.sourceManifestRestored !== true || rehearsal.rollbackTriggered !== true) {
    throw new Error(`${name} did not restore source storage`);
  }
  assertTimestampRange(rehearsal, name);
}

function assertInside(root, path, name) {
  const child = relative(root, path);
  if (child === '' || child.startsWith('..') || isAbsolute(child)) {
    throw new Error(`${name} must be inside the repository root`);
  }
}

function resolveArtifact(root, value, name) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Missing release evidence artifact path: ${name}`);
  }
  const path = resolve(root, value);
  assertInside(root, path, name);
  return path;
}

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function readJsonArtifact(path, name) {
  let bytes;
  try {
    bytes = await readFile(path);
  } catch (error) {
    if (error?.code === 'ENOENT') throw new Error(`Missing release evidence artifact: ${name}`);
    throw error;
  }
  let value;
  try {
    value = JSON.parse(bytes.toString('utf8'));
  } catch (error) {
    throw new Error(`Release evidence artifact is not valid JSON: ${name}`, { cause: error });
  }
  return { path, bytes, value, sha256: sha256(bytes) };
}

function artifactPath(root, path) {
  return relative(root, path).replaceAll('\\', '/');
}

async function readHeadCommit(root) {
  const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8'
  });
  return stdout.trim();
}

async function gitIsAncestor(root, ancestor, descendant) {
  try {
    await execFileAsync('git', ['merge-base', '--is-ancestor', ancestor, descendant], {
      cwd: root,
      encoding: 'utf8'
    });
    return true;
  } catch (error) {
    if (error?.code === 1) return false;
    throw error;
  }
}

async function readReleaseVersion(root) {
  try {
    return JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version;
  } catch (error) {
    if (error?.code === 'ENOENT') return '3.0.0';
    throw error;
  }
}

async function resolveCanonicalRollbackArtifact({ root, artifacts, canonical, finalRollback }) {
  if (!canonical.rollbackRehearsalSha256) return undefined;
  const candidates = [
    artifacts.acceptedRollbackRehearsalPath,
    artifacts.rollbackRehearsalPath
  ].filter(Boolean);
  for (const candidate of candidates) {
    const path = resolveArtifact(root, candidate, 'acceptedRollbackRehearsalPath');
    if (!(await pathExists(path))) continue;
    const artifact = await readJsonArtifact(path, 'accepted rollback rehearsal');
    if (artifact.sha256 === canonical.rollbackRehearsalSha256) return artifact;
  }
  if (finalRollback.sha256 === canonical.rollbackRehearsalSha256) return finalRollback;
  throw new Error('Missing accepted rollback rehearsal matching the canonical candidate');
}

export async function createReleaseEvidence({
  root = process.cwd(),
  artifacts = {},
  readHead = () => readHeadCommit(resolve(root)),
  isAncestor = (ancestor, descendant) => gitIsAncestor(resolve(root), ancestor, descendant),
  now = new Date()
} = {}) {
  const projectRoot = resolve(root);
  for (const key of baseArtifactKeys) {
    if (!artifacts[key]) throw new Error(`Missing release evidence artifact path: ${key}`);
  }

  const paths = Object.fromEntries(
    baseArtifactKeys.map((key) => [key, resolveArtifact(projectRoot, artifacts[key], key)])
  );
  const [migration, preCandidate, canonical, acceptance, rollback] = await Promise.all([
    readJsonArtifact(paths.migrationReportPath, 'migration report'),
    readJsonArtifact(paths.preCutoverCandidatePath, 'pre-cutover candidate'),
    readJsonArtifact(paths.canonicalCandidatePath, 'canonical candidate'),
    readJsonArtifact(paths.acceptancePath, 'release acceptance'),
    readJsonArtifact(paths.rollbackRehearsalPath, 'rollback rehearsal')
  ]);

  const currentCommit = await readHead();
  assertCommit(currentCommit, 'Current HEAD');
  assertSuccessfulMigration(migration.value);
  assertCandidateManifest(preCandidate.value, 'Pre-cutover candidate');
  if (preCandidate.value.migrationReportSha256 !== migration.sha256) {
    throw new Error('Pre-cutover candidate migration report hash does not match its file');
  }
  assertCanonicalCandidate(
    canonical.value,
    migration.value,
    preCandidate.value,
    preCandidate.sha256
  );
  assertAcceptance(acceptance.value, canonical.value.commit, canonical.sha256);
  assertRollbackRehearsal(rollback.value, currentCommit);

  if (!(await isAncestor(preCandidate.value.commit, canonical.value.commit))) {
    throw new Error('Pre-cutover candidate is not an ancestor of the canonical candidate');
  }
  if (!(await isAncestor(canonical.value.commit, currentCommit))) {
    throw new Error('Canonical candidate is not an ancestor of the release commit');
  }

  const derivedPaths = {
    finalMigrationReportPath:
      artifacts.finalMigrationReportPath ??
      join(rollback.value.workDir ?? '', 'migration-report.json'),
    cutoverJournalPath: artifacts.cutoverJournalPath ?? rollback.value.journalPath,
    finalCandidateManifestPath:
      artifacts.finalCandidateManifestPath ??
      join(rollback.value.workDir ?? '', 'candidate-manifest.json'),
    finalVerificationPath:
      artifacts.finalVerificationPath ?? join(rollback.value.workDir ?? '', 'verification.json')
  };
  for (const [key, value] of Object.entries(derivedPaths)) {
    paths[key] = resolveArtifact(projectRoot, value, key);
  }

  const [finalMigration, journal, finalCandidate, verification] = await Promise.all([
    readJsonArtifact(paths.finalMigrationReportPath, 'final migration report'),
    readJsonArtifact(paths.cutoverJournalPath, 'cutover journal'),
    readJsonArtifact(paths.finalCandidateManifestPath, 'final candidate manifest'),
    readJsonArtifact(paths.finalVerificationPath, 'final verification')
  ]);
  const acceptedRollback = await resolveCanonicalRollbackArtifact({
    root: projectRoot,
    artifacts,
    canonical: canonical.value,
    finalRollback: rollback
  });
  if (acceptedRollback) {
    assertRollbackRehearsal(
      acceptedRollback.value,
      canonical.value.commit,
      'Accepted rollback rehearsal'
    );
  }

  assertCutoverJournal(journal.value);
  if (journal.value.state !== 'rolled-back') {
    throw new Error('Cutover journal is not in the rolled-back state');
  }
  if (
    journal.value.sourceManifestSha256 !== rollback.value.sourceManifestSha256 ||
    journal.value.candidateManifestSha256 !== rollback.value.candidateManifestSha256
  ) {
    throw new Error('Cutover journal hashes do not match rollback rehearsal evidence');
  }
  assertSuccessfulMigration(finalMigration.value);
  if (
    finalMigration.value.candidate.storageManifestSha256 !== rollback.value.candidateManifestSha256
  ) {
    throw new Error('Final migration report does not match rollback candidate storage');
  }
  assertCandidateManifest(finalCandidate.value, 'Final candidate manifest', currentCommit);
  if (finalCandidate.value.migrationReportSha256 !== finalMigration.sha256) {
    throw new Error('Final candidate migration report hash does not match its file');
  }
  assertVerification(verification.value, currentCommit);

  const version = await readReleaseVersion(projectRoot);
  if (version !== '3.0.0')
    throw new Error(`Release evidence requires version 3.0.0, found ${version}`);
  const generatedAt = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  assertTimestamp(generatedAt, 'Release evidence generatedAt');

  const artifactEntries = {
    migrationReport: migration,
    finalMigrationReport: finalMigration,
    preCutoverCandidate: preCandidate,
    canonicalCandidate: canonical,
    releaseAcceptance: acceptance,
    finalCandidateManifest: finalCandidate,
    finalVerification: verification,
    cutoverJournal: journal,
    rollbackRehearsal: rollback,
    ...(acceptedRollback && acceptedRollback.path !== rollback.path
      ? { acceptedRollbackRehearsal: acceptedRollback }
      : {})
  };

  return {
    formatVersion: 1,
    version,
    commit: currentCommit,
    generatedAt,
    passed: true,
    lineage: {
      preCutoverCandidateCommit: preCandidate.value.commit,
      canonicalCandidateCommit: canonical.value.commit,
      acceptanceCommit: acceptance.value.commit,
      currentCommit,
      preCutoverToCanonical: true,
      canonicalToRelease: true
    },
    artifactPaths: Object.fromEntries(
      Object.entries(artifactEntries).map(([name, artifact]) => [
        name,
        artifactPath(projectRoot, artifact.path)
      ])
    ),
    artifactSha256: Object.fromEntries(
      Object.entries(artifactEntries).map(([name, artifact]) => [name, artifact.sha256])
    ),
    timestamps: {
      migrationCompletedAt: migration.value.completedAt,
      canonicalCompletedAt: canonical.value.completedAt,
      acceptanceApprovedAt: acceptance.value.approvedAt,
      verificationCompletedAt: verification.value.completedAt,
      rollbackCompletedAt: rollback.value.completedAt
    },
    checks: {
      migrationValidationPassed: true,
      canonicalCandidatePassed: true,
      legacyRemovalApproved: true,
      finalVerificationPassed: true,
      rollbackTriggered: true,
      sourceManifestRestored: true,
      cutoverJournalRolledBack: true
    },
    counts: {
      migrationRecordTypes: Object.keys(migration.value.validation.recordCounts).length,
      canonicalCommands: canonical.value.commands.length,
      finalVerificationSteps: verification.value.steps.length,
      rollbackSteps: rollback.value.steps.length,
      artifactFiles: Object.keys(artifactEntries).length
    }
  };
}

export async function writeReleaseEvidenceAtomic(path, evidence) {
  const target = resolve(path);
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
  await mkdir(dirname(target), { recursive: true });
  try {
    await writeFile(temporary, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
}

function option(args, name, fallback) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a path`);
  return value;
}

function printHelp() {
  console.log(`Usage: node scripts/v3/release-evidence.mjs [options]

Options:
  --migration-report <path>       Production-copy migration report
  --precutover-candidate <path>   Pre-cutover candidate manifest
  --canonical-candidate <path>    Accepted canonical candidate
  --acceptance <path>             Legacy-removal acceptance record
  --accepted-rollback <path>      Rollback artifact hashed by canonical acceptance
  --rollback-rehearsal <path>     Fresh rollback rehearsal for current HEAD
  --journal <path>                Fresh cutover journal (derived by default)
  --candidate-manifest <path>     Fresh candidate manifest (derived by default)
  --verification <path>           Fresh verification report (derived by default)
  --output <path>                 Release evidence output`);
}

const isMain =
  process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    printHelp();
  } else {
    const artifactRoot = join('.artifacts', 'v3');
    const outputPath = option(args, '--output', join(artifactRoot, 'release-evidence.json'));
    createReleaseEvidence({
      artifacts: {
        migrationReportPath: option(
          args,
          '--migration-report',
          join(artifactRoot, 'migration-production.json')
        ),
        preCutoverCandidatePath: option(
          args,
          '--precutover-candidate',
          join(artifactRoot, 'precutover-candidate-manifest.json')
        ),
        canonicalCandidatePath: option(
          args,
          '--canonical-candidate',
          join(artifactRoot, 'canonical-candidate.json')
        ),
        acceptancePath: option(args, '--acceptance', join(artifactRoot, 'release-acceptance.json')),
        acceptedRollbackRehearsalPath: option(
          args,
          '--accepted-rollback',
          join(artifactRoot, 'accepted-rollback-rehearsal.json')
        ),
        rollbackRehearsalPath: option(
          args,
          '--rollback-rehearsal',
          join(artifactRoot, 'rollback-rehearsal.json')
        ),
        cutoverJournalPath: option(args, '--journal'),
        finalCandidateManifestPath: option(args, '--candidate-manifest'),
        finalVerificationPath: option(args, '--verification')
      }
    })
      .then(async (evidence) => {
        await writeReleaseEvidenceAtomic(outputPath, evidence);
        process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
      })
      .catch((error) => {
        console.error(error instanceof Error ? (error.stack ?? error.message) : error);
        process.exitCode = 1;
      });
  }
}
