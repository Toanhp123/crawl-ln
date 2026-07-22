import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import { assertMigrationReport, validateMigrationReport } from './migration-report.mjs';

const execFileAsync = promisify(execFile);

const smokeFields = ['apiHealth', 'httpContracts', 'webRoutes', 'reader', 'sourceReaderAdmin'];
const verificationStepNames = [
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
];

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

function migrationReportContent(value) {
  if (Buffer.isBuffer(value) || typeof value === 'string') return value;
  return JSON.stringify(value);
}

function assertPassedMigration(value) {
  const report = assertMigrationReport(
    Buffer.isBuffer(value) || typeof value === 'string' ? JSON.parse(value.toString()) : value
  );
  if (
    report.validation.errors.length > 0 ||
    report.validation.idsPreserved !== true ||
    report.validation.timestampsPreserved !== true ||
    report.validation.searchRebuilt !== true ||
    Object.values(report.validation.recordCounts).some(
      (counts) => counts.source !== counts.candidate
    )
  ) {
    throw new Error('Candidate manifest requires successful migration validation evidence');
  }
}

function assertPassedVerification(verification, commit) {
  if (
    !verification ||
    verification.formatVersion !== 1 ||
    verification.command !== 'npm run verify:v3' ||
    verification.passed !== true
  ) {
    throw new Error('Candidate manifest requires passed V3 verification evidence');
  }
  if (verification.commit !== commit) {
    throw new Error('Candidate verification commit does not match candidate commit');
  }
  const startedAt = Date.parse(verification.startedAt);
  const completedAt = Date.parse(verification.completedAt);
  if (!Number.isFinite(startedAt) || !Number.isFinite(completedAt) || completedAt < startedAt) {
    throw new Error('Candidate verification timestamps are invalid');
  }
  const actualSteps = Array.isArray(verification.steps)
    ? verification.steps.map((step) => step?.name)
    : [];
  if (
    actualSteps.length !== verificationStepNames.length ||
    actualSteps.some((name, index) => name !== verificationStepNames[index]) ||
    verification.steps.some((step) => !Number.isFinite(step.durationMs) || step.durationMs < 0)
  ) {
    throw new Error('Candidate verification graph is incomplete');
  }
}

function assertPassedSmoke(smoke) {
  for (const field of smokeFields) {
    if (smoke?.[field] !== true) throw new Error(`Candidate smoke did not pass: ${field}`);
  }
}

export function createCandidateManifest({ commit, migrationReport, verification, smoke }) {
  if (typeof commit !== 'string' || commit.length === 0) {
    throw new Error('Candidate commit is required');
  }
  assertPassedMigration(migrationReport);
  assertPassedVerification(verification, commit);
  assertPassedSmoke(smoke);
  return {
    formatVersion: 1,
    commit,
    migrationReportSha256: sha256(migrationReportContent(migrationReport)),
    verification: {
      command: 'npm run verify:v3',
      passed: true,
      completedAt: verification.completedAt
    },
    smoke: Object.fromEntries(smokeFields.map((field) => [field, true]))
  };
}

export async function writeCandidateManifestAtomic(path, manifest) {
  const target = resolve(path);
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
  await mkdir(dirname(target), { recursive: true });
  try {
    await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function gitHead() {
  const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8'
  });
  return stdout.trim();
}

export async function writeCandidateManifestFromEvidence({
  migrationReportPath,
  verificationReportPath,
  outputPath,
  smoke,
  readHead = gitHead,
  now = new Date(),
  maxVerificationAgeMs = 6 * 60 * 60 * 1_000
}) {
  const migrationBytes = await readFile(resolve(migrationReportPath));
  const migrationReport = JSON.parse(migrationBytes.toString('utf8'));
  await validateMigrationReport({
    reportPath: migrationReportPath,
    staging: migrationReport.candidate?.storagePath
  });
  const verification = JSON.parse(await readFile(resolve(verificationReportPath), 'utf8'));
  const commit = await readHead();
  const migrationCompletedAt = Date.parse(migrationReport.completedAt);
  const verificationStartedAt = Date.parse(verification.startedAt);
  const verificationCompletedAt = Date.parse(verification.completedAt);
  const currentTime = now.getTime();
  if (
    !Number.isFinite(migrationCompletedAt) ||
    !Number.isFinite(verificationStartedAt) ||
    !Number.isFinite(verificationCompletedAt) ||
    verificationStartedAt < migrationCompletedAt ||
    verificationCompletedAt < verificationStartedAt
  ) {
    throw new Error('Candidate verification is older than migration evidence');
  }
  const verificationAge = currentTime - verificationCompletedAt;
  if (verificationAge < -60_000 || verificationAge > maxVerificationAgeMs) {
    throw new Error('Candidate verification evidence is not fresh');
  }
  const manifest = createCandidateManifest({
    commit,
    migrationReport: migrationBytes,
    verification,
    smoke
  });
  await writeCandidateManifestAtomic(outputPath, manifest);
  return manifest;
}
