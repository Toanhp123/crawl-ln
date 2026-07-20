import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { env } from '../config/env.js';

type Migration = { version: number; up(database: DatabaseSync): void };

function parsedChapterNumber(title: string): number | null {
  const match = title.match(/\bChapter\s*[-#:]*\s*(\d+(?:\.\d+)?)/i);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function reindexNovelCoolChapters(db: DatabaseSync): void {
  const novels = db
    .prepare("SELECT id FROM novels WHERE lower(source_name) = 'novelcool'")
    .all() as Array<{ id: string }>;
  const list = db.prepare(
    'SELECT id, title, chapter_index FROM chapters WHERE novel_id = ? AND source_available = 1'
  );
  const shift = db.prepare(
    'UPDATE chapters SET chapter_index = chapter_index + 1000000 WHERE novel_id = ?'
  );
  const update = db.prepare('UPDATE chapters SET chapter_index = ? WHERE id = ?');

  for (const novel of novels) {
    const chapters = list.all(novel.id) as Array<{
      id: string;
      title: string;
      chapter_index: number;
    }>;
    if (chapters.length < 2) continue;
    const parsed = chapters.map((chapter) => ({
      ...chapter,
      ordinal: parsedChapterNumber(chapter.title)
    }));
    const numericCount = parsed.filter((chapter) => chapter.ordinal !== null).length;
    if (numericCount < Math.ceil(chapters.length * 0.8)) continue;

    parsed.sort((a, b) => {
      if (a.ordinal !== null && b.ordinal !== null && a.ordinal !== b.ordinal)
        return a.ordinal - b.ordinal;
      if (a.ordinal !== null) return -1;
      if (b.ordinal !== null) return 1;
      return a.chapter_index - b.chapter_index || a.id.localeCompare(b.id);
    });
    shift.run(novel.id);
    parsed.forEach((chapter, index) => update.run(index + 1, chapter.id));
  }
}

const migrations: Migration[] = [
  {
    version: 1,
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS novels (
          id TEXT PRIMARY KEY, title TEXT NOT NULL, source_url TEXT NOT NULL UNIQUE,
          source_name TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS chapters (
          id TEXT PRIMARY KEY, novel_id TEXT NOT NULL, chapter_index INTEGER NOT NULL,
          title TEXT NOT NULL, source_url TEXT NOT NULL, raw_text TEXT, clean_text TEXT,
          status TEXT NOT NULL, error_message TEXT,
          FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_chapters_novel_index ON chapters(novel_id, chapter_index);
        CREATE INDEX IF NOT EXISTS idx_chapters_status ON chapters(status);
        CREATE TABLE IF NOT EXISTS crawl_tasks (
          id TEXT PRIMARY KEY, novel_id TEXT NOT NULL, status TEXT NOT NULL,
          total_chapters INTEGER NOT NULL DEFAULT 0, fetched_chapters INTEGER NOT NULL DEFAULT 0,
          failed_chapters INTEGER NOT NULL DEFAULT 0, error_message TEXT,
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
          FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_crawl_tasks_novel_created ON crawl_tasks(novel_id, created_at DESC);
        CREATE TABLE IF NOT EXISTS crawl_events (
          id TEXT PRIMARY KEY, task_id TEXT NOT NULL, type TEXT NOT NULL, level TEXT NOT NULL,
          message TEXT NOT NULL, chapter_id TEXT, chapter_index INTEGER, chapter_title TEXT,
          attempt INTEGER, created_at TEXT NOT NULL,
          FOREIGN KEY (task_id) REFERENCES crawl_tasks(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_crawl_events_task_created ON crawl_events(task_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_crawl_events_type ON crawl_events(type);
      `);
    }
  },
  {
    version: 2,
    up(db) {
      addColumns(db, 'novels', [
        ['auto_update_enabled', 'INTEGER NOT NULL DEFAULT 0'],
        ['update_interval_minutes', 'INTEGER NOT NULL DEFAULT 1440'],
        ['last_update_check_at', 'TEXT'],
        ['next_update_check_at', 'TEXT'],
        ['last_update_result', "TEXT NOT NULL DEFAULT 'idle'"],
        ['consecutive_update_failures', 'INTEGER NOT NULL DEFAULT 0']
      ]);
      db.exec(`
        CREATE TABLE IF NOT EXISTS novel_update_diagnostics (
          id TEXT PRIMARY KEY, novel_id TEXT NOT NULL, source_name TEXT NOT NULL,
          result TEXT NOT NULL, message TEXT NOT NULL, new_chapter_count INTEGER NOT NULL DEFAULT 0,
          pending_chapter_count INTEGER NOT NULL DEFAULT 0, duration_ms INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL, FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_novel_update_diagnostics_novel_created ON novel_update_diagnostics(novel_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_novels_next_update ON novels(auto_update_enabled, next_update_check_at);
      `);
    }
  },
  {
    version: 3,
    up(db) {
      addColumns(db, 'crawl_tasks', [
        ['started_at', 'TEXT'],
        ['finished_at', 'TEXT'],
        ['paused_at', 'TEXT'],
        ['total_paused_ms', 'INTEGER NOT NULL DEFAULT 0'],
        ['current_speed', 'REAL NOT NULL DEFAULT 0'],
        ['average_speed', 'REAL NOT NULL DEFAULT 0'],
        ['eta_seconds', 'INTEGER'],
        ['chapter_ids_json', "TEXT NOT NULL DEFAULT '[]'"]
      ]);
    }
  },
  {
    version: 4,
    up(db) {
      const duplicates = db
        .prepare(
          `SELECT novel_id FROM crawl_tasks WHERE status IN ('queued','running','pausing','paused','resuming') GROUP BY novel_id HAVING COUNT(*) > 1`
        )
        .all() as Array<{ novel_id: string }>;
      for (const duplicate of duplicates) {
        const rows = db
          .prepare(
            `SELECT id FROM crawl_tasks WHERE novel_id = ? AND status IN ('queued','running','pausing','paused','resuming') ORDER BY updated_at DESC, created_at DESC, id DESC`
          )
          .all(duplicate.novel_id) as Array<{ id: string }>;
        for (const stale of rows.slice(1))
          db.prepare(
            `UPDATE crawl_tasks SET status='failed', error_message='Superseded during active-task constraint migration' WHERE id=?`
          ).run(stale.id);
      }
      db.exec(
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_crawl_tasks_one_active_per_novel ON crawl_tasks(novel_id) WHERE status IN ('queued','running','pausing','paused','resuming');`
      );
    }
  },
  { version: 5, up() {} },
  { version: 6, up() {} },
  {
    version: 7,
    up(db) {
      addColumns(db, 'crawl_tasks', [['outcome', 'TEXT']]);
      db.exec(
        `UPDATE crawl_tasks SET outcome = CASE WHEN status = 'completed' AND failed_chapters = 0 THEN 'success' WHEN status = 'completed' AND failed_chapters > 0 THEN 'partial' WHEN status = 'failed' THEN 'failure' ELSE NULL END WHERE outcome IS NULL;`
      );
    }
  },
  {
    version: 8,
    up(db) {
      db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS search_documents USING fts5(
          document_type UNINDEXED, document_id UNINDEXED, novel_id UNINDEXED, chapter_index UNINDEXED,
          title, subtitle, content, tokenize = 'unicode61 remove_diacritics 2'
        );
        CREATE TRIGGER IF NOT EXISTS search_novels_insert AFTER INSERT ON novels BEGIN
          INSERT INTO search_documents(document_type,document_id,novel_id,chapter_index,title,subtitle,content)
          VALUES('novel',new.id,new.id,NULL,new.title,new.source_name,'');
        END;
        CREATE TRIGGER IF NOT EXISTS search_novels_delete AFTER DELETE ON novels BEGIN DELETE FROM search_documents WHERE novel_id=old.id; END;
        CREATE TRIGGER IF NOT EXISTS search_novels_update AFTER UPDATE OF title, source_name ON novels BEGIN
          DELETE FROM search_documents WHERE document_type='novel' AND document_id=old.id;
          INSERT INTO search_documents(document_type,document_id,novel_id,chapter_index,title,subtitle,content)
          VALUES('novel',new.id,new.id,NULL,new.title,new.source_name,'');
          UPDATE search_documents SET subtitle=new.title WHERE document_type='chapter' AND novel_id=new.id;
        END;
        CREATE TRIGGER IF NOT EXISTS search_chapters_insert AFTER INSERT ON chapters BEGIN
          INSERT INTO search_documents(document_type,document_id,novel_id,chapter_index,title,subtitle,content)
          SELECT 'chapter',new.id,new.novel_id,new.chapter_index,new.title,novels.title,
            CASE WHEN new.status='fetched' THEN COALESCE(new.clean_text,new.raw_text,'') ELSE '' END FROM novels WHERE novels.id=new.novel_id;
        END;
        CREATE TRIGGER IF NOT EXISTS search_chapters_delete AFTER DELETE ON chapters BEGIN DELETE FROM search_documents WHERE document_type='chapter' AND document_id=old.id; END;
        CREATE TRIGGER IF NOT EXISTS search_chapters_update AFTER UPDATE OF title, clean_text, raw_text, status, chapter_index, novel_id ON chapters BEGIN
          DELETE FROM search_documents WHERE document_type='chapter' AND document_id=old.id;
          INSERT INTO search_documents(document_type,document_id,novel_id,chapter_index,title,subtitle,content)
          SELECT 'chapter',new.id,new.novel_id,new.chapter_index,new.title,novels.title,
            CASE WHEN new.status='fetched' THEN COALESCE(new.clean_text,new.raw_text,'') ELSE '' END FROM novels WHERE novels.id=new.novel_id;
        END;
        DELETE FROM search_documents;
        INSERT INTO search_documents(document_type,document_id,novel_id,chapter_index,title,subtitle,content)
          SELECT 'novel',id,id,NULL,title,source_name,'' FROM novels;
        INSERT INTO search_documents(document_type,document_id,novel_id,chapter_index,title,subtitle,content)
          SELECT 'chapter',chapters.id,chapters.novel_id,chapters.chapter_index,chapters.title,novels.title,
            CASE WHEN chapters.status='fetched' THEN COALESCE(chapters.clean_text,chapters.raw_text,'') ELSE '' END
          FROM chapters JOIN novels ON novels.id=chapters.novel_id;
      `);
    }
  },
  {
    version: 9,
    up(db) {
      db.exec(`
        CREATE TRIGGER IF NOT EXISTS validate_novels_insert BEFORE INSERT ON novels BEGIN
          SELECT CASE WHEN NEW.status NOT IN ('analyzed','crawling','completed','failed') THEN RAISE(ABORT,'invalid novel status') END;
          SELECT CASE WHEN NEW.update_interval_minutes NOT IN (0,360,720,1440,10080) THEN RAISE(ABORT,'invalid update interval') END;
          SELECT CASE WHEN NEW.consecutive_update_failures < 0 THEN RAISE(ABORT,'invalid update failure count') END;
        END;
        CREATE TRIGGER IF NOT EXISTS validate_novels_update BEFORE UPDATE ON novels BEGIN
          SELECT CASE WHEN NEW.status NOT IN ('analyzed','crawling','completed','failed') THEN RAISE(ABORT,'invalid novel status') END;
          SELECT CASE WHEN NEW.update_interval_minutes NOT IN (0,360,720,1440,10080) THEN RAISE(ABORT,'invalid update interval') END;
          SELECT CASE WHEN NEW.consecutive_update_failures < 0 THEN RAISE(ABORT,'invalid update failure count') END;
        END;
        CREATE TRIGGER IF NOT EXISTS validate_chapters_insert BEFORE INSERT ON chapters BEGIN
          SELECT CASE WHEN NEW.status NOT IN ('pending','fetched','failed') THEN RAISE(ABORT,'invalid chapter status') END;
          SELECT CASE WHEN NEW.chapter_index < 0 THEN RAISE(ABORT,'invalid chapter index') END;
        END;
        CREATE TRIGGER IF NOT EXISTS validate_chapters_update BEFORE UPDATE ON chapters BEGIN
          SELECT CASE WHEN NEW.status NOT IN ('pending','fetched','failed') THEN RAISE(ABORT,'invalid chapter status') END;
          SELECT CASE WHEN NEW.chapter_index < 0 THEN RAISE(ABORT,'invalid chapter index') END;
        END;
        CREATE TRIGGER IF NOT EXISTS validate_tasks_insert BEFORE INSERT ON crawl_tasks BEGIN
          SELECT CASE WHEN NEW.status NOT IN ('queued','running','pausing','paused','resuming','completed','failed','cancelled') THEN RAISE(ABORT,'invalid task status') END;
          SELECT CASE WHEN NEW.outcome IS NOT NULL AND NEW.outcome NOT IN ('success','partial','failure') THEN RAISE(ABORT,'invalid task outcome') END;
          SELECT CASE WHEN NEW.total_chapters < 0 OR NEW.fetched_chapters < 0 OR NEW.failed_chapters < 0 OR NEW.fetched_chapters + NEW.failed_chapters > NEW.total_chapters THEN RAISE(ABORT,'invalid task counters') END;
          SELECT CASE WHEN NEW.status NOT IN ('completed','failed') AND NEW.outcome IS NOT NULL THEN RAISE(ABORT,'invalid task outcome state') END;
        END;
        CREATE TRIGGER IF NOT EXISTS validate_tasks_update BEFORE UPDATE ON crawl_tasks BEGIN
          SELECT CASE WHEN NEW.status NOT IN ('queued','running','pausing','paused','resuming','completed','failed','cancelled') THEN RAISE(ABORT,'invalid task status') END;
          SELECT CASE WHEN NEW.outcome IS NOT NULL AND NEW.outcome NOT IN ('success','partial','failure') THEN RAISE(ABORT,'invalid task outcome') END;
          SELECT CASE WHEN NEW.total_chapters < 0 OR NEW.fetched_chapters < 0 OR NEW.failed_chapters < 0 OR NEW.fetched_chapters + NEW.failed_chapters > NEW.total_chapters THEN RAISE(ABORT,'invalid task counters') END;
          SELECT CASE WHEN NEW.status NOT IN ('completed','failed') AND NEW.outcome IS NOT NULL THEN RAISE(ABORT,'invalid task outcome state') END;
        END;
        CREATE TRIGGER IF NOT EXISTS validate_crawl_events_insert BEFORE INSERT ON crawl_events BEGIN
          SELECT CASE WHEN NEW.type NOT IN ('task_created','started','chapter_started','chapter_succeeded','chapter_failed','chapter_retry','pause_requested','paused','resume_requested','resumed','cancelled','completed','failed','recovered_paused') THEN RAISE(ABORT,'invalid crawl event type') END;
          SELECT CASE WHEN NEW.level NOT IN ('info','success','warning','error') THEN RAISE(ABORT,'invalid crawl event level') END;
          SELECT CASE WHEN NEW.chapter_index IS NOT NULL AND NEW.chapter_index < 0 THEN RAISE(ABORT,'invalid crawl event chapter index') END;
          SELECT CASE WHEN NEW.attempt IS NOT NULL AND NEW.attempt < 0 THEN RAISE(ABORT,'invalid crawl event attempt') END;
        END;
        CREATE TRIGGER IF NOT EXISTS validate_diagnostics_insert BEFORE INSERT ON novel_update_diagnostics BEGIN
          SELECT CASE WHEN NEW.result NOT IN ('idle','up_to_date','queued','skipped_active_task','failed') THEN RAISE(ABORT,'invalid diagnostic result') END;
          SELECT CASE WHEN NEW.new_chapter_count < 0 OR NEW.pending_chapter_count < 0 OR NEW.duration_ms < 0 THEN RAISE(ABORT,'invalid diagnostic counters') END;
        END;
      `);
    }
  },
  {
    version: 10,
    up(db) {
      db.exec(`
        CREATE TRIGGER IF NOT EXISTS validate_tasks_outcome_insert BEFORE INSERT ON crawl_tasks BEGIN
          SELECT CASE
            WHEN NEW.status = 'completed' AND NEW.outcome NOT IN ('success','partial') THEN RAISE(ABORT,'completed task requires success or partial outcome')
            WHEN NEW.status = 'failed' AND NEW.outcome != 'failure' THEN RAISE(ABORT,'failed task requires failure outcome')
            WHEN NEW.status NOT IN ('completed','failed') AND NEW.outcome IS NOT NULL THEN RAISE(ABORT,'non-terminal task cannot have outcome')
          END;
        END;
        CREATE TRIGGER IF NOT EXISTS validate_tasks_outcome_update BEFORE UPDATE ON crawl_tasks BEGIN
          SELECT CASE
            WHEN NEW.status = 'completed' AND NEW.outcome NOT IN ('success','partial') THEN RAISE(ABORT,'completed task requires success or partial outcome')
            WHEN NEW.status = 'failed' AND NEW.outcome != 'failure' THEN RAISE(ABORT,'failed task requires failure outcome')
            WHEN NEW.status NOT IN ('completed','failed') AND NEW.outcome IS NOT NULL THEN RAISE(ABORT,'non-terminal task cannot have outcome')
          END;
        END;
      `);
    }
  },
  {
    version: 11,
    up(db) {
      addColumns(db, 'chapters', [['source_available', 'INTEGER NOT NULL DEFAULT 1']]);
      db.exec(`
        DELETE FROM chapters
        WHERE rowid NOT IN (
          SELECT MIN(rowid) FROM chapters GROUP BY novel_id, source_url
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_chapters_novel_source_url ON chapters(novel_id, source_url);
        DROP TRIGGER IF EXISTS search_chapters_insert;
        DROP TRIGGER IF EXISTS search_chapters_update;
        CREATE TRIGGER search_chapters_insert AFTER INSERT ON chapters WHEN new.source_available = 1 BEGIN
          INSERT INTO search_documents(document_type,document_id,novel_id,chapter_index,title,subtitle,content)
          SELECT 'chapter',new.id,new.novel_id,new.chapter_index,new.title,novels.title,
            CASE WHEN new.status='fetched' THEN COALESCE(new.clean_text,new.raw_text,'') ELSE '' END FROM novels WHERE novels.id=new.novel_id;
        END;
        CREATE TRIGGER search_chapters_update AFTER UPDATE OF title, clean_text, raw_text, status, chapter_index, novel_id, source_available ON chapters BEGIN
          DELETE FROM search_documents WHERE document_type='chapter' AND document_id=old.id;
          INSERT INTO search_documents(document_type,document_id,novel_id,chapter_index,title,subtitle,content)
          SELECT 'chapter',new.id,new.novel_id,new.chapter_index,new.title,novels.title,
            CASE WHEN new.status='fetched' THEN COALESCE(new.clean_text,new.raw_text,'') ELSE '' END
          FROM novels WHERE novels.id=new.novel_id AND new.source_available = 1;
        END;
        DELETE FROM search_documents WHERE document_type='chapter' AND document_id IN (SELECT id FROM chapters WHERE source_available = 0);
      `);
    }
  },
  {
    version: 12,
    up(db) {
      addColumns(db, 'chapters', [['content_version', 'INTEGER NOT NULL DEFAULT 1']]);
    }
  },
  {
    version: 13,
    up(db) {
      addColumns(db, 'novels', [
        ['author', 'TEXT'],
        ['cover_url', 'TEXT']
      ]);
    }
  },
  {
    version: 14,
    up(db) {
      reindexNovelCoolChapters(db);
    }
  },
  {
    version: 15,
    up(db) {
      db.exec(`
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
        CREATE INDEX idx_source_reader_plugins_status
          ON source_reader_plugins(enabled, status);
      `);
    }
  },
  {
    version: 16,
    up(db) {
      db.exec(`
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
        CREATE INDEX idx_source_reader_credentials_resolution
          ON source_reader_credentials(owner_type, owner_id, plugin_id, domain, enabled);

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
        CREATE INDEX idx_source_reader_network_resolution
          ON source_reader_network_profiles(owner_type, owner_id, enabled, health_status);

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
        CREATE INDEX idx_source_reader_sessions_resolution
          ON source_reader_sessions(plugin_id, credential_profile_id, owner_id, network_profile_id, status);

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
        CREATE INDEX idx_source_reader_challenges_pending
          ON source_reader_auth_challenges(status, expires_at);
      `);
    }
  },
  {
    version: 17,
    up(db) {
      db.exec(`
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
          last_accessed_at TEXT NOT NULL
        );
        CREATE INDEX idx_source_reader_cache_expiry
          ON source_reader_cache_entries(expires_at, stale_until);
        CREATE INDEX idx_source_reader_cache_plugin
          ON source_reader_cache_entries(plugin_id, plugin_version, capability);

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
        CREATE INDEX idx_source_reader_health_plugin_checked
          ON source_reader_health_checks(plugin_id, checked_at DESC);
      `);
    }
  },
  {
    version: 18,
    up(db) {
      addColumns(db, 'source_reader_plugin_versions', [
        ['trust_level', "TEXT NOT NULL DEFAULT 'local-unverified'"],
        ['status', "TEXT NOT NULL DEFAULT 'installed'"],
        ['quarantine_reason', 'TEXT']
      ]);
      db.exec(`
        CREATE INDEX idx_source_reader_plugin_versions_status
          ON source_reader_plugin_versions(plugin_id, status);
      `);
    }
  },
  {
    version: 19,
    up(db) {
      db.exec(`
        CREATE INDEX idx_source_reader_health_capability_window
          ON source_reader_health_checks(plugin_id, plugin_version, capability, checked_at DESC);
      `);
    }
  },
  {
    version: 20,
    up(db) {
      addColumns(db, 'source_reader_plugin_versions', [
        ['compatibility_issues_json', "TEXT NOT NULL DEFAULT '[]'"],
        ['activated_extensions_json', "TEXT NOT NULL DEFAULT '{}'"],
        ['sandbox_protocol_version', 'INTEGER']
      ]);
    }
  }
];

export const CURRENT_SCHEMA_VERSION = migrations.at(-1)?.version ?? 0;

function addColumns(db: DatabaseSync, table: string, additions: Array<[string, string]>): void {
  const columns = new Set(
    (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(
      (column) => column.name
    )
  );
  for (const [name, definition] of additions)
    if (!columns.has(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition};`);
}

export class SqliteDatabase {
  readonly connection: DatabaseSync;
  private migrated = false;
  private closed = false;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.connection = new DatabaseSync(path);
    this.connection.exec('PRAGMA journal_mode = WAL;');
    this.connection.exec('PRAGMA foreign_keys = ON;');
  }

  migrate(): void {
    if (this.migrated) return;
    this.connection.exec(
      `CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);`
    );
    const applied = new Set(
      (
        this.connection.prepare('SELECT version FROM schema_migrations').all() as Array<{
          version: number;
        }>
      ).map((row) => Number(row.version))
    );
    for (const migration of migrations) {
      if (applied.has(migration.version)) continue;
      this.transactionSync(() => {
        migration.up(this.connection);
        this.connection
          .prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)')
          .run(migration.version, new Date().toISOString());
      });
    }
    this.migrated = true;
  }

  transactionSync<T>(work: () => T): T {
    this.connection.exec('BEGIN IMMEDIATE;');
    try {
      const result = work();
      this.connection.exec('COMMIT;');
      return result;
    } catch (error) {
      this.connection.exec('ROLLBACK;');
      throw error;
    }
  }

  close(): void {
    if (this.closed) return;
    this.connection.close();
    this.closed = true;
  }
}

export function createSqliteDatabase(
  path = resolve(env.storageDir, 'novel-tool.sqlite')
): SqliteDatabase {
  const database = new SqliteDatabase(path);
  database.migrate();
  return database;
}
