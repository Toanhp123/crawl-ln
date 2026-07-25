import type { ModuleMigration } from '../../../../platform/database/module-migration.js';
import { backupOperationsMigration } from './migrations/001-backup-operations.js';
import { restoreSessionsMigration } from './migrations/002-restore-sessions.js';

export const backupControlMigrations: ModuleMigration[] = [
  backupOperationsMigration,
  restoreSessionsMigration
];
