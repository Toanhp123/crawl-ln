import type { ModuleMigration } from '../../../../platform/database/module-migration.js';

export const searchIndexMetadataMigration: ModuleMigration = {
  module: 'search',
  version: 2,
  up(database) {
    database.exec(`
      CREATE TABLE search_index_metadata (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        last_rebuilt_at TEXT NOT NULL,
        last_indexed_documents INTEGER NOT NULL
          CHECK (last_indexed_documents >= 0)
      );
    `);
  }
};
