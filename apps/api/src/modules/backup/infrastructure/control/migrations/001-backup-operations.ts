import type { ModuleMigration } from '../../../../../platform/database/module-migration.js';

export const backupOperationsMigration: ModuleMigration = {
  module: 'backup-control',
  version: 1,
  up(database) {
    database.exec(`
      CREATE TABLE backup_operations (
        id TEXT PRIMARY KEY,
        idempotency_key TEXT NOT NULL UNIQUE,
        request_fingerprint TEXT NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('backup','restore')),
        mode TEXT CHECK(mode IS NULL OR mode IN ('merge','replace')),
        state TEXT NOT NULL CHECK(
          state IN ('queued','running','succeeded','failed','interrupted','cancelled')
        ),
        stage TEXT NOT NULL,
        cancellable INTEGER NOT NULL CHECK(cancellable IN (0,1)),
        cancel_requested_at TEXT,
        progress_current INTEGER NOT NULL CHECK(progress_current >= 0),
        progress_total INTEGER NOT NULL CHECK(progress_total >= 0),
        error_code TEXT,
        error_details_json TEXT,
        result_artifact_id TEXT,
        safety_artifact_id TEXT,
        result_json TEXT,
        started_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        finished_at TEXT,
        metadata_expires_at TEXT NOT NULL
      );

      CREATE UNIQUE INDEX backup_operations_one_active
        ON backup_operations((1))
        WHERE state IN ('queued','running');

      CREATE INDEX backup_operations_latest
        ON backup_operations(updated_at DESC);

      CREATE INDEX backup_operations_expiry
        ON backup_operations(metadata_expires_at);

      CREATE TABLE backup_artifacts (
        id TEXT PRIMARY KEY,
        operation_id TEXT NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('user-backup','safety-backup')),
        path TEXT NOT NULL UNIQUE,
        filename TEXT NOT NULL,
        size_bytes INTEGER NOT NULL CHECK(size_bytes >= 0),
        sha256 TEXT NOT NULL CHECK(length(sha256) = 64),
        encrypted INTEGER NOT NULL CHECK(encrypted IN (0,1)),
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        download_token_hash TEXT UNIQUE,
        download_token_expires_at TEXT,
        download_token_consumed_at TEXT,
        FOREIGN KEY(operation_id) REFERENCES backup_operations(id) ON DELETE CASCADE
      );

      CREATE INDEX backup_artifacts_expiry ON backup_artifacts(expires_at);
    `);
  }
};
