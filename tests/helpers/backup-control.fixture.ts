import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import { backupControlMigrations } from '../../apps/api/src/modules/backup/infrastructure/control/backup-control.migrations.ts';
import { SqliteBackupControlRepository } from '../../apps/api/src/modules/backup/infrastructure/control/sqlite-backup-control.repository.ts';
import { MigrationRegistry } from '../../apps/api/src/platform/database/migration-registry.ts';
import { runRegisteredMigrations } from '../../apps/api/src/platform/database/migration-runner.ts';
import { SqliteDatabase } from '../../apps/api/src/platform/database/sqlite-database.ts';

export async function createBackupControlFixture(context: TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'novel-tool-backup-control-'));
  const path = join(root, 'backup-control.sqlite');
  const database = new SqliteDatabase(path);
  const migrations = new MigrationRegistry();
  migrations.register('backup-control', backupControlMigrations);
  runRegisteredMigrations(database, migrations);
  const repository = new SqliteBackupControlRepository(database);

  context.after(async () => {
    database.close();
    await rm(root, { recursive: true, force: true });
  });

  return { root, path, database, repository };
}
