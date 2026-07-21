import type { ModuleMigration } from '../../../../platform/database/module-migration.js';

const schedulerSchemaMigration: ModuleMigration = {
  module: 'scheduler',
  version: 1,
  up(database) {
    database.exec(`
      CREATE TABLE scheduler_policies (
        novel_id TEXT PRIMARY KEY,
        enabled INTEGER NOT NULL,
        interval_minutes INTEGER NOT NULL,
        last_check_at TEXT,
        next_check_at TEXT,
        last_result TEXT NOT NULL DEFAULT 'idle',
        consecutive_failures INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE scheduler_diagnostics (
        id TEXT PRIMARY KEY,
        novel_id TEXT NOT NULL,
        source_name TEXT NOT NULL,
        result TEXT NOT NULL,
        message TEXT NOT NULL,
        new_chapter_count INTEGER NOT NULL,
        pending_chapter_count INTEGER NOT NULL,
        duration_ms INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX idx_scheduler_policies_due
        ON scheduler_policies(enabled, next_check_at, novel_id);
      CREATE INDEX idx_scheduler_diagnostics_novel
        ON scheduler_diagnostics(novel_id, created_at DESC, id DESC);
    `);
  }
};

export const schedulerMigrations: ModuleMigration[] = [schedulerSchemaMigration];
