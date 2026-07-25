import { DatabaseSync } from 'node:sqlite';
import {
  sqliteCountRows,
  sqliteDistinctText,
  sqliteIntegrityStatus,
  sqliteTableExists
} from '../../../../platform/backup/sqlite-staging-inspection.js';
import type { BackupManifest } from '../../domain/backup.models.js';
import type { BackupCompatibility, BackupInventory } from '../../domain/restore-session.models.js';
import { BackupOperationError } from '../errors/backup.error.js';
import type { BackupSchemaMigrationResult } from './backup-schema-migrator.js';
import {
  CURRENT_BACKUP_SCHEMA_VERSION,
  MIN_SUPPORTED_BACKUP_SCHEMA_VERSION
} from '../../domain/backup.models.js';

const REQUIRED_MODULES = ['library', 'source-reader', 'ingestion', 'scheduler', 'search'] as const;

function count(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new BackupOperationError(
      'BACKUP_STAGING_INVALID',
      422,
      'Backup inventory contains an invalid count',
      false
    );
  }
  return value;
}

function recognizedSettings(settings: Record<string, unknown>): {
  groups: string[];
  count: number;
} {
  const groups = new Set<string>();
  let accepted = 0;
  for (const key of Object.keys(settings)) {
    let group: string | null = null;
    if (/^(novel-tool\.)?(theme|appearance|accent[-.]?color)/i.test(key)) group = 'appearance';
    else if (/^(novel-tool\.)?(language|locale)/i.test(key)) group = 'language';
    else if (/^(novel-tool\.)?reader([.-]|$)/i.test(key)) group = 'reader';
    else if (/^(novel-tool\.)?scheduler([.-]|$)/i.test(key)) group = 'scheduler';
    else if (/^(novel-tool\.)?source[-.]?reader([.-]|$)/i.test(key)) group = 'source-reader';
    else if (/^(novel-tool\.)?search([.-]|$)/i.test(key)) group = 'search';
    if (group) {
      accepted += 1;
      groups.add(group);
    }
  }
  return { groups: [...groups].sort(), count: accepted };
}

export class BackupInventoryReader {
  read(input: {
    databasePath: string;
    manifest: BackupManifest;
    archiveSizeBytes: number;
    contributors: Record<string, unknown>;
    settings: Record<string, unknown>;
    migration: BackupSchemaMigrationResult;
  }): { inventory: BackupInventory; compatibility: BackupCompatibility } {
    for (const module of REQUIRED_MODULES) {
      if (!Object.prototype.hasOwnProperty.call(input.contributors, module)) {
        throw new BackupOperationError(
          'BACKUP_STAGING_INVALID',
          422,
          `Backup contributor data is missing for ${module}`,
          false,
          { module }
        );
      }
    }

    let database: DatabaseSync | undefined;
    try {
      database = new DatabaseSync(input.databasePath, { readOnly: true });
      const integrity = sqliteIntegrityStatus(database);
      if (integrity.integrity !== 'ok') {
        throw new BackupOperationError(
          'BACKUP_STAGING_INVALID',
          422,
          'Backup staging database integrity check failed',
          false
        );
      }
      if (integrity.foreignKeyViolations !== 0) {
        throw new BackupOperationError(
          'BACKUP_STAGING_INVALID',
          422,
          'Backup staging database foreign key check failed',
          false
        );
      }

      if (!sqliteTableExists(database, 'platform_module_migrations')) {
        throw new BackupOperationError(
          'BACKUP_STAGING_INVALID',
          422,
          'Backup staging database migration metadata is missing',
          false
        );
      }
      const migratedModules = new Set(
        sqliteDistinctText(database, 'platform_module_migrations', 'module_name')
      );
      for (const module of REQUIRED_MODULES) {
        if (!migratedModules.has(module)) {
          throw new BackupOperationError(
            'BACKUP_STAGING_INVALID',
            422,
            `Backup staging database is missing migrations for ${module}`,
            false,
            { module }
          );
        }
      }

      const settings = recognizedSettings(input.settings);
      const inventory: BackupInventory = {
        createdAt: input.manifest.createdAt,
        appVersion: input.manifest.appVersion,
        schemaVersion: CURRENT_BACKUP_SCHEMA_VERSION,
        archiveSizeBytes: input.archiveSizeBytes,
        encrypted: input.manifest.encrypted,
        library: {
          novels: count(sqliteCountRows(database, 'library_novels')),
          analyzedNovels: count(
            sqliteCountRows(database, 'library_novels', { column: 'status', value: 'analyzed' })
          ),
          chapters: count(sqliteCountRows(database, 'library_chapters')),
          fetchedChapters: count(
            sqliteCountRows(database, 'library_chapters', { column: 'status', value: 'fetched' })
          )
        },
        sources: {
          plugins: count(sqliteCountRows(database, 'source_reader_plugins')),
          credentials: count(sqliteCountRows(database, 'source_reader_credentials')),
          networkProfiles: count(sqliteCountRows(database, 'source_reader_network_profiles'))
        },
        ingestion: {
          tasks: count(sqliteCountRows(database, 'ingestion_jobs')),
          events: count(sqliteCountRows(database, 'ingestion_events'))
        },
        scheduler: {
          policies: count(sqliteCountRows(database, 'scheduler_policies')),
          diagnostics: count(sqliteCountRows(database, 'scheduler_diagnostics'))
        },
        search: {
          indexedDocuments: count(sqliteCountRows(database, 'search_documents'))
        },
        settings
      };
      return {
        inventory,
        compatibility: {
          formatVersion: input.manifest.formatVersion,
          sourceSchemaVersion: input.migration.sourceSchemaVersion,
          targetSchemaVersion: input.migration.targetSchemaVersion,
          minimumSupportedSchemaVersion: MIN_SUPPORTED_BACKUP_SCHEMA_VERSION,
          upgradedFrom: input.migration.upgradedFrom,
          compatible: true
        }
      };
    } catch (error) {
      if (error instanceof BackupOperationError) throw error;
      throw new BackupOperationError(
        'BACKUP_STAGING_INVALID',
        422,
        'Backup staging database is invalid',
        false
      );
    } finally {
      database?.close();
    }
  }
}
