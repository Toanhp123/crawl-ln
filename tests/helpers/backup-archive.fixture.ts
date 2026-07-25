import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { BackupSnapshot } from '../../apps/api/src/modules/backup/domain/backup.models.ts';
import { JsZipBackupArchive } from '../../apps/api/src/modules/backup/infrastructure/archive/jszip-backup.archive.ts';
import { MigrationRegistry } from '../../apps/api/src/platform/database/migration-registry.ts';
import { ingestionMigrations } from '../../apps/api/src/modules/ingestion/index.ts';
import { libraryMigrations } from '../../apps/api/src/modules/library/index.ts';
import { schedulerMigrations } from '../../apps/api/src/modules/scheduler/index.ts';
import { searchMigrations } from '../../apps/api/src/modules/search/index.ts';
import { sourceReaderMigrations } from '../../apps/api/src/modules/source-reader/index.ts';
import { createCurrentDatabaseFixture } from './current-database.fixture.ts';

export function createPrimaryMigrationRegistry(): MigrationRegistry {
  const migrations = new MigrationRegistry();
  migrations.register('library', libraryMigrations);
  migrations.register('ingestion', ingestionMigrations);
  migrations.register('scheduler', schedulerMigrations);
  migrations.register('search', searchMigrations);
  migrations.register('source-reader', sourceReaderMigrations);
  return migrations;
}

export async function createInspectionArchiveFixture(
  root: string,
  options: { password?: string; schemaVersion?: number } = {}
) {
  const current = await createCurrentDatabaseFixture(root);
  const snapshot: BackupSnapshot = {
    database: await readFile(current.databasePath),
    contributors: {
      library: { marker: 'library' },
      'source-reader': { marker: 'source-reader' },
      ingestion: { marker: 'ingestion' },
      scheduler: { marker: 'scheduler' },
      search: { marker: 'search' }
    },
    settings: {
      'novel-tool.theme': 'dark',
      'novel-tool.language': 'vi',
      'novel-tool.reader.fontSize': 18,
      secretUnrecognizedValue: 'must-not-enter-inventory'
    }
  };
  const creator = new JsZipBackupArchive({
    appVersion: '3.0.0-test',
    schemaVersion: options.schemaVersion ?? 2
  });
  const artifact = await creator.create(snapshot, options.password);
  return { ...artifact, current, snapshot };
}

export function restorePartialFingerprint(content: Buffer): `sha256-partial-v1:${string}` {
  const size = Buffer.alloc(8);
  size.writeBigUInt64BE(BigInt(content.length));
  const range = 1024 * 1024;
  const first = content.subarray(0, Math.min(range, content.length));
  const last = content.subarray(Math.max(0, content.length - Math.min(range, content.length)));
  const digest = createHash('sha256')
    .update(Buffer.from('sha256-partial-v1\0', 'utf8'))
    .update(size)
    .update(first)
    .update(last)
    .digest('hex');
  return `sha256-partial-v1:${digest}`;
}
