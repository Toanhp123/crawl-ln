import { rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  assertCutoverPaths,
  assertDirectory,
  assertMissing,
  assertStorageQuiescent,
  readCutoverJournal,
  withOperationLock,
  writeCutoverJournal
} from './storage-safety.mjs';
import { storageManifest } from './storage-manifest.mjs';

function timestamp(now) {
  const value = now();
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

export async function rollbackStorage({
  journalPath,
  renamePath = rename,
  now = () => new Date()
}) {
  const outputPath = resolve(journalPath);
  return withOperationLock(outputPath, async () => {
    let journal = await readCutoverJournal(outputPath);
    if (journal.state !== 'live-swapped') {
      throw new Error(`Storage rollback requires a live-swapped journal, found ${journal.state}`);
    }
    if (!journal.failedCandidatePath) {
      throw new Error('Storage rollback requires failedCandidatePath in the journal');
    }
    const paths = assertCutoverPaths(journal);
    await assertDirectory(paths.livePath, 'Live candidate storage');
    await assertDirectory(paths.backupPath, 'Backup source storage');
    await assertMissing(paths.candidatePath, 'Original candidate storage path');
    await assertMissing(paths.failedCandidatePath, 'Failed candidate storage');

    const liveManifest = await storageManifest(paths.livePath);
    const backupManifest = await storageManifest(paths.backupPath);
    if (liveManifest.sha256 !== journal.candidateManifestSha256) {
      throw new Error('Live candidate storage manifest hash mismatch');
    }
    if (backupManifest.sha256 !== journal.sourceManifestSha256) {
      throw new Error('Backup source storage manifest hash mismatch');
    }
    await assertStorageQuiescent(paths.livePath);
    await assertStorageQuiescent(paths.backupPath);

    await renamePath(paths.livePath, paths.failedCandidatePath);
    try {
      await renamePath(paths.backupPath, paths.livePath);
    } catch (error) {
      await renamePath(paths.failedCandidatePath, paths.livePath);
      throw error;
    }

    try {
      const restoredManifest = await storageManifest(paths.livePath);
      if (restoredManifest.sha256 !== journal.sourceManifestSha256) {
        throw new Error('Rollback did not restore the source storage bytes');
      }
      journal = { ...journal, state: 'rolled-back', updatedAt: timestamp(now) };
      await writeCutoverJournal(outputPath, journal);
    } catch (error) {
      try {
        await renamePath(paths.livePath, paths.backupPath);
        await renamePath(paths.failedCandidatePath, paths.livePath);
      } catch (recoveryError) {
        throw new AggregateError(
          [error, recoveryError],
          'Storage rollback failed and automatic recovery also failed'
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

const isMain =
  process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log(
      'Usage: node --experimental-sqlite scripts/v3/rollback-storage.mjs --journal <cutover-journal.json>'
    );
  } else {
    rollbackStorage({ journalPath: option(args, '--journal') })
      .then((journal) => process.stdout.write(`${JSON.stringify(journal, null, 2)}\n`))
      .catch((error) => {
        console.error(error instanceof Error ? (error.stack ?? error.message) : error);
        process.exitCode = 1;
      });
  }
}
