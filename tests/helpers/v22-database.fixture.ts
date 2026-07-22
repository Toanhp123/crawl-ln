import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export interface V22Fixture {
  databasePath: string;
  schemaVersion: 22;
  ids: {
    novelId: 'fixture-novel';
    chapterId: 'fixture-chapter';
    taskId: 'fixture-task';
    pluginId: 'fixture-plugin';
  };
  counts: { novels: 1; chapters: 1; tasks: 1; plugins: 1 };
}

const schemaVersion = 22;
const ids = {
  novelId: 'fixture-novel',
  chapterId: 'fixture-chapter',
  taskId: 'fixture-task',
  pluginId: 'fixture-plugin'
} as const;
const installedAt = '2026-07-21T00:00:00.000Z';
const completedAt = '2026-07-21T00:05:00.000Z';

const pluginManifest = {
  id: ids.pluginId,
  name: 'Fixture Plugin',
  version: '1.0.0',
  engines: { sourceReader: '>=1.0.0 <2.0.0' },
  capabilities: ['metadata'],
  contracts: { metadata: 1 },
  matchers: [{ hosts: ['fixture.test'], priority: 100 }],
  runtime: { preferredMode: 'in-process' },
  permissions: { network: { hosts: ['fixture.test'] } }
};

function transaction<T>(database: DatabaseSync, work: () => T): T {
  database.exec('BEGIN IMMEDIATE;');
  try {
    const result = work();
    database.exec('COMMIT;');
    return result;
  } catch (error) {
    database.exec('ROLLBACK;');
    throw error;
  }
}

function createV22Schema(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
    CREATE TABLE novels (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      source_url TEXT NOT NULL UNIQUE,
      source_name TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      auto_update_enabled INTEGER NOT NULL DEFAULT 0,
      update_interval_minutes INTEGER NOT NULL DEFAULT 1440,
      last_update_check_at TEXT,
      next_update_check_at TEXT,
      last_update_result TEXT NOT NULL DEFAULT 'idle',
      consecutive_update_failures INTEGER NOT NULL DEFAULT 0,
      author TEXT,
      cover_url TEXT
    );
    CREATE TABLE chapters (
      id TEXT PRIMARY KEY,
      novel_id TEXT NOT NULL,
      chapter_index INTEGER NOT NULL,
      title TEXT NOT NULL,
      source_url TEXT NOT NULL,
      raw_text TEXT,
      clean_text TEXT,
      status TEXT NOT NULL,
      error_message TEXT,
      source_available INTEGER NOT NULL DEFAULT 1,
      content_version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX idx_chapters_novel_index ON chapters(novel_id, chapter_index);
    CREATE UNIQUE INDEX idx_chapters_novel_source_url ON chapters(novel_id, source_url);
    CREATE TABLE crawl_tasks (
      id TEXT PRIMARY KEY,
      novel_id TEXT NOT NULL,
      status TEXT NOT NULL,
      total_chapters INTEGER NOT NULL DEFAULT 0,
      fetched_chapters INTEGER NOT NULL DEFAULT 0,
      failed_chapters INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      started_at TEXT,
      finished_at TEXT,
      paused_at TEXT,
      total_paused_ms INTEGER NOT NULL DEFAULT 0,
      current_speed REAL NOT NULL DEFAULT 0,
      average_speed REAL NOT NULL DEFAULT 0,
      eta_seconds INTEGER,
      chapter_ids_json TEXT NOT NULL DEFAULT '[]',
      outcome TEXT,
      FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE
    );
    CREATE TABLE crawl_events (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      type TEXT NOT NULL,
      level TEXT NOT NULL,
      message TEXT NOT NULL,
      chapter_id TEXT,
      chapter_index INTEGER,
      chapter_title TEXT,
      attempt INTEGER,
      created_at TEXT NOT NULL,
      FOREIGN KEY (task_id) REFERENCES crawl_tasks(id) ON DELETE CASCADE
    );
    CREATE TABLE novel_update_diagnostics (
      id TEXT PRIMARY KEY,
      novel_id TEXT NOT NULL,
      source_name TEXT NOT NULL,
      result TEXT NOT NULL,
      message TEXT NOT NULL,
      new_chapter_count INTEGER NOT NULL DEFAULT 0,
      pending_chapter_count INTEGER NOT NULL DEFAULT 0,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE
    );
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
    CREATE TRIGGER search_novels_insert AFTER INSERT ON novels BEGIN
      INSERT INTO search_documents(document_type, document_id, novel_id, chapter_index, title, subtitle, content)
      VALUES('novel', new.id, new.id, NULL, new.title, new.source_name, '');
    END;
    CREATE TRIGGER search_chapters_insert AFTER INSERT ON chapters WHEN new.source_available = 1 BEGIN
      INSERT INTO search_documents(document_type, document_id, novel_id, chapter_index, title, subtitle, content)
      SELECT 'chapter', new.id, new.novel_id, new.chapter_index, new.title, novels.title,
        CASE WHEN new.status = 'fetched' THEN COALESCE(new.clean_text, new.raw_text, '') ELSE '' END
      FROM novels WHERE novels.id = new.novel_id;
    END;
    CREATE TABLE source_reader_plugins (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      trust_level TEXT NOT NULL,
      status TEXT NOT NULL,
      active_version TEXT,
      enabled INTEGER NOT NULL DEFAULT 0,
      installed_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE source_reader_plugin_versions (
      plugin_id TEXT NOT NULL,
      version TEXT NOT NULL,
      package_path TEXT,
      checksum TEXT NOT NULL,
      signature_status TEXT NOT NULL,
      manifest_json TEXT NOT NULL,
      sdk_range TEXT NOT NULL,
      installed_at TEXT NOT NULL,
      activated_at TEXT,
      trust_level TEXT NOT NULL DEFAULT 'local-unverified',
      status TEXT NOT NULL DEFAULT 'installed',
      quarantine_reason TEXT,
      compatibility_issues_json TEXT NOT NULL DEFAULT '[]',
      activated_extensions_json TEXT NOT NULL DEFAULT '{}',
      sandbox_protocol_version INTEGER,
      PRIMARY KEY(plugin_id, version),
      FOREIGN KEY(plugin_id) REFERENCES source_reader_plugins(id) ON DELETE CASCADE
    );
    CREATE TABLE source_reader_plugin_permissions (
      plugin_id TEXT NOT NULL,
      plugin_version TEXT NOT NULL,
      permission TEXT NOT NULL,
      scope_json TEXT NOT NULL,
      status TEXT NOT NULL,
      approved_by TEXT,
      approved_at TEXT,
      PRIMARY KEY(plugin_id, plugin_version, permission, scope_json),
      FOREIGN KEY(plugin_id, plugin_version)
        REFERENCES source_reader_plugin_versions(plugin_id, version) ON DELETE CASCADE
    );
    CREATE TABLE source_reader_credentials (
      id TEXT PRIMARY KEY,
      owner_type TEXT NOT NULL,
      owner_id TEXT,
      plugin_id TEXT,
      domain TEXT,
      name TEXT NOT NULL,
      strategy TEXT NOT NULL,
      encrypted_payload BLOB NOT NULL,
      encryption_metadata_json TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE source_reader_network_profiles (
      id TEXT PRIMARY KEY,
      owner_type TEXT NOT NULL,
      owner_id TEXT,
      name TEXT NOT NULL,
      route_type TEXT NOT NULL,
      regions_json TEXT NOT NULL,
      tags_json TEXT NOT NULL,
      encrypted_config BLOB,
      encryption_metadata_json TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      health_status TEXT NOT NULL DEFAULT 'unknown',
      last_health_check_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE source_reader_sessions (
      id TEXT PRIMARY KEY,
      plugin_id TEXT NOT NULL,
      plugin_version TEXT NOT NULL,
      credential_profile_id TEXT NOT NULL,
      owner_type TEXT NOT NULL,
      owner_id TEXT,
      network_profile_id TEXT,
      network_binding TEXT NOT NULL,
      encrypted_session BLOB NOT NULL,
      encryption_metadata_json TEXT NOT NULL,
      status TEXT NOT NULL,
      expires_at TEXT,
      last_used_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(credential_profile_id) REFERENCES source_reader_credentials(id) ON DELETE CASCADE,
      FOREIGN KEY(network_profile_id) REFERENCES source_reader_network_profiles(id) ON DELETE SET NULL
    );
    CREATE TABLE source_reader_auth_challenges (
      id TEXT PRIMARY KEY,
      plugin_id TEXT NOT NULL,
      credential_profile_id TEXT,
      network_profile_id TEXT,
      owner_id TEXT,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      encrypted_state BLOB,
      encryption_metadata_json TEXT,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      completed_at TEXT,
      FOREIGN KEY(credential_profile_id) REFERENCES source_reader_credentials(id) ON DELETE CASCADE,
      FOREIGN KEY(network_profile_id) REFERENCES source_reader_network_profiles(id) ON DELETE SET NULL
    );
    CREATE TABLE source_reader_cache_entries (
      cache_key TEXT PRIMARY KEY,
      capability TEXT NOT NULL,
      plugin_id TEXT NOT NULL,
      plugin_version TEXT NOT NULL,
      contract_version INTEGER NOT NULL,
      normalized_url TEXT,
      request_fingerprint TEXT NOT NULL,
      scope TEXT NOT NULL,
      scope_identity_hash TEXT NOT NULL,
      network_scope_hash TEXT NOT NULL,
      payload BLOB NOT NULL,
      encoding TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      stale_until TEXT,
      tags_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_accessed_at TEXT NOT NULL,
      extension_contract_versions_json TEXT NOT NULL DEFAULT '{}',
      network_identity_hash TEXT
    );
    CREATE TABLE source_reader_cache_tags (
      cache_key TEXT NOT NULL,
      tag TEXT NOT NULL,
      PRIMARY KEY(cache_key, tag),
      FOREIGN KEY(cache_key) REFERENCES source_reader_cache_entries(cache_key) ON DELETE CASCADE
    );
    CREATE TABLE source_reader_installations (
      id TEXT PRIMARY KEY,
      plugin_id TEXT,
      plugin_version TEXT,
      original_package_path TEXT NOT NULL,
      staging_path TEXT,
      status TEXT NOT NULL,
      error_code TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT
    );
    CREATE TABLE source_reader_health_checks (
      id TEXT PRIMARY KEY,
      plugin_id TEXT NOT NULL,
      plugin_version TEXT NOT NULL,
      capability TEXT,
      status TEXT NOT NULL,
      duration_ms INTEGER NOT NULL,
      failure_code TEXT,
      checked_at TEXT NOT NULL
    );
  `);

  const migration = database.prepare(
    'INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)'
  );
  transaction(database, () => {
    for (let version = 1; version <= schemaVersion; version += 1) {
      migration.run(version, installedAt);
    }
  });
}

function count(database: DatabaseSync, table: string): number {
  const row = database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as {
    count: number;
  };
  return Number(row.count);
}

export async function createV22Fixture(root: string): Promise<V22Fixture> {
  await mkdir(root, { recursive: true });
  const databasePath = join(root, 'novel-tool-v22.sqlite');
  const database = new DatabaseSync(databasePath);
  database.exec('PRAGMA journal_mode = WAL;');
  database.exec('PRAGMA foreign_keys = ON;');

  try {
    createV22Schema(database);
    transaction(database, () => {
      database
        .prepare(
          `INSERT INTO novels(
            id, title, source_url, source_name, author, cover_url, status,
            created_at, updated_at, auto_update_enabled, update_interval_minutes,
            last_update_check_at, next_update_check_at, last_update_result,
            consecutive_update_failures
          ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
        )
        .run(
          ids.novelId,
          'Fixture Novel',
          'https://fixture.test/novels/fixture-novel',
          'fixture',
          'Fixture Author',
          'https://fixture.test/covers/fixture-novel.jpg',
          'completed',
          installedAt,
          completedAt,
          1,
          1440,
          completedAt,
          '2026-07-22T00:05:00.000Z',
          'up_to_date',
          0
        );

      database
        .prepare(
          `INSERT INTO chapters(
            id, novel_id, chapter_index, title, source_url, raw_text, clean_text,
            status, error_message, source_available, content_version
          ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`
        )
        .run(
          ids.chapterId,
          ids.novelId,
          1,
          'Fixture Chapter 1',
          'https://fixture.test/novels/fixture-novel/chapters/1',
          '<p>Fixture chapter content.</p>',
          'Fixture chapter content.',
          'fetched',
          null,
          1,
          1
        );

      database
        .prepare(
          `INSERT INTO crawl_tasks(
            id, novel_id, status, outcome, total_chapters, fetched_chapters,
            failed_chapters, error_message, started_at, finished_at, paused_at,
            total_paused_ms, current_speed, average_speed, eta_seconds,
            created_at, updated_at, chapter_ids_json
          ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
        )
        .run(
          ids.taskId,
          ids.novelId,
          'completed',
          'success',
          1,
          1,
          0,
          null,
          installedAt,
          completedAt,
          null,
          0,
          0,
          0,
          0,
          installedAt,
          completedAt,
          JSON.stringify([ids.chapterId])
        );

      database
        .prepare(
          `INSERT INTO crawl_events(
            id, task_id, type, level, message, chapter_id, chapter_index,
            chapter_title, attempt, created_at
          ) VALUES(?,?,?,?,?,?,?,?,?,?)`
        )
        .run(
          'fixture-event',
          ids.taskId,
          'chapter-fetched',
          'success',
          'Fixture chapter fetched.',
          ids.chapterId,
          1,
          'Fixture Chapter 1',
          1,
          completedAt
        );

      database
        .prepare(
          `INSERT INTO novel_update_diagnostics(
            id, novel_id, source_name, result, message, new_chapter_count,
            pending_chapter_count, duration_ms, created_at
          ) VALUES(?,?,?,?,?,?,?,?,?)`
        )
        .run(
          'fixture-diagnostic',
          ids.novelId,
          'fixture',
          'up_to_date',
          'Fixture scheduler check completed.',
          0,
          0,
          125,
          completedAt
        );

      database
        .prepare(
          `INSERT INTO source_reader_plugins(
            id, name, trust_level, status, active_version, enabled, installed_at, updated_at
          ) VALUES(?,?,?,?,?,?,?,?)`
        )
        .run(
          ids.pluginId,
          pluginManifest.name,
          'built-in',
          'active',
          pluginManifest.version,
          1,
          installedAt,
          installedAt
        );

      database
        .prepare(
          `INSERT INTO source_reader_plugin_versions(
            plugin_id, version, package_path, checksum, signature_status,
            manifest_json, sdk_range, installed_at, activated_at, trust_level,
            status, quarantine_reason, compatibility_issues_json,
            activated_extensions_json, sandbox_protocol_version
          ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
        )
        .run(
          ids.pluginId,
          pluginManifest.version,
          'fixture-plugin',
          '0'.repeat(64),
          'built-in',
          JSON.stringify(pluginManifest),
          pluginManifest.engines.sourceReader,
          installedAt,
          installedAt,
          'built-in',
          'active',
          null,
          '[]',
          '{}',
          1
        );

      database
        .prepare(
          `INSERT INTO source_reader_plugin_permissions(
            plugin_id, plugin_version, permission, scope_json, status,
            approved_by, approved_at
          ) VALUES(?,?,?,?,?,?,?)`
        )
        .run(
          ids.pluginId,
          pluginManifest.version,
          'network',
          JSON.stringify({ hosts: ['fixture.test'] }),
          'approved',
          'local-user',
          installedAt
        );
    });

    const actualSchemaVersion = Number(
      (
        database.prepare('SELECT MAX(version) AS version FROM schema_migrations').get() as {
          version: number;
        }
      ).version
    );
    const counts = {
      novels: count(database, 'novels'),
      chapters: count(database, 'chapters'),
      tasks: count(database, 'crawl_tasks'),
      plugins: count(database, 'source_reader_plugins')
    };

    if (actualSchemaVersion !== schemaVersion) {
      throw new Error(`Fixture schema version is ${actualSchemaVersion}`);
    }
    if (Object.values(counts).some((value) => value !== 1)) {
      throw new Error(`Fixture counts are invalid: ${JSON.stringify(counts)}`);
    }
    database.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    return {
      databasePath,
      schemaVersion,
      ids,
      counts: { novels: 1, chapters: 1, tasks: 1, plugins: 1 }
    };
  } finally {
    database.close();
  }
}
