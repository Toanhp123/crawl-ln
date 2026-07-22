import { rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  assertCutoverPaths,
  assertDirectory,
  assertMissing,
  assertStorageQuiescent,
  pathExists,
  validateCutoverEvidence,
  withOperationLock,
  writeCutoverJournal
} from './storage-safety.mjs';
import { storageManifest } from './storage-manifest.mjs';

function timestamp(now) {
  const value = now();
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

async function restoreAfterFailedSwap({ livePath, candidatePath, backupPath, renamePath }) {
  if (await pathExists(livePath)) await renamePath(livePath, candidatePath);
  if (await pathExists(backupPath)) await renamePath(backupPath, livePath);
}

export async function cutoverStorage({
  livePath,
  candidatePath,
  backupPath,
  failedCandidatePath,
  journalPath,
  candidateManifestPath,
  migrationReportPath,
  renamePath = rename,
  now = () => new Date(),
  readHead
}) {
  const paths = assertCutoverPaths({ livePath, candidatePath, backupPath, failedCandidatePath });
  const outputPath = resolve(journalPath);
  return withOperationLock(outputPath, async () => {
    await assertMissing(outputPath, 'Cutover journal');
    await assertDirectory(paths.livePath, 'Live storage');
    await assertDirectory(paths.candidatePath, 'Candidate storage');
    await assertMissing(paths.backupPath, 'Backup storage');
    await assertMissing(paths.failedCandidatePath, 'Failed candidate storage');
    const hashes = await validateCutoverEvidence({
      livePath: paths.livePath,
      candidatePath: paths.candidatePath,
      candidateManifestPath,
      migrationReportPath,
      readHead
    });
    await assertStorageQuiescent(paths.livePath);
    await assertStorageQuiescent(paths.candidatePath);

    const createdAt = timestamp(now);
    let journal = {
      formatVersion: 1,
      state: 'prepared',
      ...paths,
      ...hashes,
      createdAt,
      updatedAt: createdAt
    };
    await writeCutoverJournal(outputPath, journal);
    await renamePath(paths.livePath, paths.backupPath);
    try {
      await renamePath(paths.candidatePath, paths.livePath);
    } catch (error) {
      await renamePath(paths.backupPath, paths.livePath);
      throw error;
    }

    try {
      const liveManifest = await storageManifest(paths.livePath);
      const backupManifest = await storageManifest(paths.backupPath);
      if (liveManifest.sha256 !== hashes.candidateManifestSha256) {
        throw new Error('Live storage does not match the candidate after cutover');
      }
      if (backupManifest.sha256 !== hashes.sourceManifestSha256) {
        throw new Error('Backup storage does not match the source after cutover');
      }
      journal = { ...journal, state: 'live-swapped', updatedAt: timestamp(now) };
      await writeCutoverJournal(outputPath, journal);
    } catch (error) {
      try {
        await restoreAfterFailedSwap({ ...paths, renamePath });
      } catch (recoveryError) {
        throw new AggregateError(
          [error, recoveryError],
          'Storage cutover failed and automatic recovery also failed'
        );
      }
      throw error;
    }
    return { ...journal, path: outputPath };
  });
}

function option(args, name) {
  const index = args.indexOf(name);
  const value = index < 0 ? undefined : args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return value;
}

function printHelp() {
  console.log(`Usage: node --experimental-sqlite scripts/v3/cutover-storage.mjs \\
  --live <path> --candidate <path> --backup <path> --failed-candidate <path> \\
  --journal <path> --manifest <candidate-manifest.json> --migration-report <report.json>`);
}

const isMain =
  process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    printHelp();
  } else {
    cutoverStorage({
      livePath: option(args, '--live'),
      candidatePath: option(args, '--candidate'),
      backupPath: option(args, '--backup'),
      failedCandidatePath: option(args, '--failed-candidate'),
      journalPath: option(args, '--journal'),
      candidateManifestPath: option(args, '--manifest'),
      migrationReportPath: option(args, '--migration-report')
    })
      .then((journal) => process.stdout.write(`${JSON.stringify(journal, null, 2)}\n`))
      .catch((error) => {
        console.error(error instanceof Error ? (error.stack ?? error.message) : error);
        process.exitCode = 1;
      });
  }
}
