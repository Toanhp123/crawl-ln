import type { ModuleMigration } from '../../../../platform/database/module-migration.js';

const searchSchemaMigration: ModuleMigration = {
  module: 'search',
  version: 1,
  up(database) {
    database.exec(`
      CREATE VIRTUAL TABLE search_documents USING fts5(
        document_type UNINDEXED,
        document_id UNINDEXED,
        novel_id UNINDEXED,
        chapter_index UNINDEXED,
        title,
        subtitle,
        content,
        tokenize = 'unicode61 remove_diacritics 2'
      );

      CREATE TABLE search_projection_checkpoints (
        event_id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        projected_at TEXT NOT NULL
      );
    `);
  }
};

export const searchMigrations: ModuleMigration[] = [searchSchemaMigration];
