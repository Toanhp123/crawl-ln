import type { ModuleMigration } from '../../../../../platform/database/module-migration.js';

export const restoreSessionsMigration: ModuleMigration = {
  module: 'backup-control',
  version: 2,
  up(database) {
    database.exec(`
      CREATE TABLE backup_restore_sessions (
        id TEXT PRIMARY KEY,
        session_token_hash TEXT NOT NULL UNIQUE,
        inspection_token_hash TEXT UNIQUE,
        state TEXT NOT NULL CHECK(state IN (
          'uploading','uploaded','hashing','awaiting-password','inspecting',
          'ready','locked','consumed','cancelled','expired','invalid'
        )),
        stage TEXT NOT NULL,
        original_filename TEXT NOT NULL,
        expected_bytes INTEGER NOT NULL CHECK(expected_bytes > 0 AND expected_bytes <= 536870912),
        received_bytes INTEGER NOT NULL CHECK(received_bytes >= 0 AND received_bytes <= expected_bytes),
        file_fingerprint TEXT NOT NULL,
        archive_checksum TEXT CHECK(archive_checksum IS NULL OR length(archive_checksum) = 64),
        encrypted INTEGER CHECK(encrypted IS NULL OR encrypted IN (0,1)),
        password_failures INTEGER NOT NULL CHECK(password_failures BETWEEN 0 AND 5),
        inventory_json TEXT,
        compatibility_json TEXT,
        merge_plan_json TEXT,
        merge_plan_fingerprint TEXT,
        selected_mode TEXT CHECK(selected_mode IS NULL OR selected_mode IN ('merge','replace')),
        settings_policy TEXT CHECK(
          settings_policy IS NULL OR settings_policy IN ('keep-current','use-backup')
        ),
        temporary_root TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        last_activity_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        absolute_expires_at TEXT NOT NULL,
        locked_operation_id TEXT,
        CHECK(expires_at <= absolute_expires_at),
        FOREIGN KEY(locked_operation_id) REFERENCES backup_operations(id)
      );

      CREATE UNIQUE INDEX backup_restore_sessions_one_current
        ON backup_restore_sessions((1))
        WHERE state NOT IN ('consumed','cancelled','expired','invalid');

      CREATE INDEX backup_restore_sessions_expiry
        ON backup_restore_sessions(expires_at, absolute_expires_at);
    `);
  }
};
