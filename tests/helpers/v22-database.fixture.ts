import { join } from 'node:path';
import {
  CURRENT_SCHEMA_VERSION,
  SqliteDatabase
} from '../../apps/api-legacy/src/shared/database/sqlite.ts';

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

function count(database: SqliteDatabase, table: string): number {
  const row = database.connection.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as {
    count: number;
  };
  return Number(row.count);
}

export async function createV22Fixture(root: string): Promise<V22Fixture> {
  if (CURRENT_SCHEMA_VERSION !== 22) {
    throw new Error(`Expected current schema version 22, received ${CURRENT_SCHEMA_VERSION}`);
  }

  const databasePath = join(root, 'novel-tool-v22.sqlite');
  const database = new SqliteDatabase(databasePath);

  try {
    database.migrate();
    database.transactionSync(() => {
      database.connection
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

      database.connection
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

      database.connection
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

      database.connection
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

      database.connection
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

      database.connection
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

    const schemaVersion = Number(
      (
        database.connection
          .prepare('SELECT MAX(version) AS version FROM schema_migrations')
          .get() as { version: number }
      ).version
    );
    const counts = {
      novels: count(database, 'novels'),
      chapters: count(database, 'chapters'),
      tasks: count(database, 'crawl_tasks'),
      plugins: count(database, 'source_reader_plugins')
    };

    if (schemaVersion !== 22) throw new Error(`Fixture schema version is ${schemaVersion}`);
    if (Object.values(counts).some((value) => value !== 1)) {
      throw new Error(`Fixture counts are invalid: ${JSON.stringify(counts)}`);
    }

    return {
      databasePath,
      schemaVersion: 22,
      ids,
      counts: { novels: 1, chapters: 1, tasks: 1, plugins: 1 }
    };
  } finally {
    database.close();
  }
}
