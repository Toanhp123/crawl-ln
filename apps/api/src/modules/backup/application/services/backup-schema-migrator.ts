import type { MigrationRegistry } from '../../../../platform/database/migration-registry.js';
import { runRegisteredMigrations } from '../../../../platform/database/migration-runner.js';
import { SqliteDatabase } from '../../../../platform/database/sqlite-database.js';
import {
  CURRENT_BACKUP_SCHEMA_VERSION,
  MIN_SUPPORTED_BACKUP_SCHEMA_VERSION
} from '../../domain/backup.models.js';
import { BackupOperationError } from '../errors/backup.error.js';

export interface BackupSchemaMigrationResult {
  sourceSchemaVersion: number;
  targetSchemaVersion: number;
  upgradedFrom: number | null;
}

export class BackupSchemaMigrator {
  constructor(private readonly migrations: MigrationRegistry) {}

  migrate(databasePath: string, sourceSchemaVersion: number): BackupSchemaMigrationResult {
    if (
      !Number.isInteger(sourceSchemaVersion) ||
      sourceSchemaVersion < MIN_SUPPORTED_BACKUP_SCHEMA_VERSION
    ) {
      throw new BackupOperationError(
        'BACKUP_SCHEMA_UNSUPPORTED',
        422,
        'Backup schema is no longer supported',
        false,
        {
          sourceSchemaVersion,
          minimumSupportedSchemaVersion: MIN_SUPPORTED_BACKUP_SCHEMA_VERSION
        }
      );
    }
    if (sourceSchemaVersion > CURRENT_BACKUP_SCHEMA_VERSION) {
      throw new BackupOperationError(
        'BACKUP_SCHEMA_NEWER_THAN_APP',
        422,
        'Backup schema is newer than this application',
        false,
        {
          sourceSchemaVersion,
          targetSchemaVersion: CURRENT_BACKUP_SCHEMA_VERSION
        }
      );
    }

    if (sourceSchemaVersion === CURRENT_BACKUP_SCHEMA_VERSION) {
      return {
        sourceSchemaVersion,
        targetSchemaVersion: CURRENT_BACKUP_SCHEMA_VERSION,
        upgradedFrom: null
      };
    }

    const database = new SqliteDatabase(databasePath, { open: false });
    try {
      database.open();
      runRegisteredMigrations(database, this.migrations);
    } catch (error) {
      throw new BackupOperationError(
        'BACKUP_STAGING_INVALID',
        422,
        'Backup staging database migration failed',
        false,
        { sourceSchemaVersion }
      );
    } finally {
      database.close();
    }

    return {
      sourceSchemaVersion,
      targetSchemaVersion: CURRENT_BACKUP_SCHEMA_VERSION,
      upgradedFrom: sourceSchemaVersion
    };
  }
}
