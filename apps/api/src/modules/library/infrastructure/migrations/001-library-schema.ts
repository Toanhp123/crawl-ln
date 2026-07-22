import type { ModuleMigration } from '../../../../platform/database/module-migration.js';

const librarySchemaMigration: ModuleMigration = {
  module: 'library',
  version: 1,
  up(database) {
    database.exec(`
      CREATE TABLE library_novels (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        source_url TEXT NOT NULL UNIQUE,
        source_name TEXT NOT NULL,
        author TEXT,
        cover_url TEXT,
        status TEXT NOT NULL CHECK(status IN ('analyzed','crawling','completed','failed')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE library_chapters (
        id TEXT PRIMARY KEY,
        novel_id TEXT NOT NULL,
        chapter_index INTEGER NOT NULL CHECK(chapter_index >= 0),
        title TEXT NOT NULL,
        source_url TEXT NOT NULL,
        raw_text TEXT,
        clean_text TEXT,
        status TEXT NOT NULL CHECK(status IN ('pending','fetched','failed')),
        error_message TEXT,
        source_available INTEGER NOT NULL DEFAULT 1 CHECK(source_available IN (0,1)),
        content_version INTEGER NOT NULL DEFAULT 1 CHECK(content_version >= 1),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(novel_id, chapter_index),
        UNIQUE(novel_id, source_url),
        FOREIGN KEY(novel_id) REFERENCES library_novels(id) ON DELETE CASCADE
      );

      CREATE TABLE library_command_receipts (
        command_id TEXT PRIMARY KEY,
        command_type TEXT NOT NULL,
        result_json TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE library_outbox (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        claimed_at TEXT,
        delivered_at TEXT,
        delivery_attempts INTEGER NOT NULL DEFAULT 0 CHECK(delivery_attempts >= 0)
      );

      CREATE INDEX library_chapters_novel_index
        ON library_chapters(novel_id, chapter_index);
      CREATE INDEX library_chapters_status
        ON library_chapters(status, source_available);
      CREATE INDEX library_outbox_pending
        ON library_outbox(delivered_at, occurred_at);
    `);
  }
};

export const libraryMigrations: ModuleMigration[] = [librarySchemaMigration];
