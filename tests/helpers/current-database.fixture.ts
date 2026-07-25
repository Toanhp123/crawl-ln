import { join } from 'node:path';
import { ingestionMigrations } from '../../apps/api/src/modules/ingestion/index.ts';
import { libraryMigrations } from '../../apps/api/src/modules/library/index.ts';
import { schedulerMigrations } from '../../apps/api/src/modules/scheduler/index.ts';
import { searchMigrations } from '../../apps/api/src/modules/search/index.ts';
import { sourceReaderMigrations } from '../../apps/api/src/modules/source-reader/index.ts';
import { MigrationRegistry } from '../../apps/api/src/platform/database/migration-registry.ts';
import { runRegisteredMigrations } from '../../apps/api/src/platform/database/migration-runner.ts';
import { SqliteDatabase } from '../../apps/api/src/platform/database/sqlite-database.ts';

const ids = {
  novelId: 'fixture-novel',
  chapterId: 'fixture-chapter',
  taskId: 'fixture-task',
  pluginId: 'fixture-plugin'
} as const;
const createdAt = '2026-07-23T00:00:00.000Z';
const completedAt = '2026-07-23T00:05:00.000Z';

export async function createCurrentDatabaseFixture(root: string) {
  const databasePath = join(root, 'current-fixture.sqlite');
  const database = new SqliteDatabase(databasePath);
  try {
    const registry = new MigrationRegistry();
    registry.register('library', libraryMigrations);
    registry.register('ingestion', ingestionMigrations);
    registry.register('scheduler', schedulerMigrations);
    registry.register('search', searchMigrations);
    registry.register('source-reader', sourceReaderMigrations);
    runRegisteredMigrations(database, registry);

    const manifest = {
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

    database.transactionSync(() => {
      database.connection
        .prepare(
          `INSERT INTO library_novels(
        id,title,source_url,source_name,author,cover_url,status,created_at,updated_at
      ) VALUES(?,?,?,?,?,?,?,?,?)`
        )
        .run(
          ids.novelId,
          'Fixture Novel',
          'https://fixture.test/novels/fixture-novel',
          'fixture',
          'Fixture Author',
          'https://fixture.test/cover.jpg',
          'completed',
          createdAt,
          completedAt
        );
      database.connection
        .prepare(
          `INSERT INTO library_chapters(
        id,novel_id,chapter_index,title,source_url,raw_text,clean_text,status,
        error_message,source_available,content_version,created_at,updated_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`
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
          1,
          createdAt,
          completedAt
        );
      database.connection
        .prepare(
          `INSERT INTO ingestion_jobs(
        id,novel_id,status,outcome,total_chapters,fetched_chapters,failed_chapters,
        error_message,started_at,finished_at,paused_at,total_paused_ms,current_speed,
        average_speed,eta_seconds,created_at,updated_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
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
          createdAt,
          completedAt,
          null,
          0,
          0,
          0,
          0,
          createdAt,
          completedAt
        );
      database.connection
        .prepare(
          `INSERT INTO ingestion_job_chapters(
        job_id,chapter_id,position,status,attempt_count,error_message,updated_at
      ) VALUES(?,?,?,?,?,?,?)`
        )
        .run(ids.taskId, ids.chapterId, 0, 'fetched', 1, null, completedAt);
      database.connection
        .prepare(
          `INSERT INTO ingestion_events(
        id,job_id,type,level,message,chapter_id,chapter_index,chapter_title,attempt,created_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?)`
        )
        .run(
          'fixture-event',
          ids.taskId,
          'chapter-fetched',
          'success',
          'Fetched fixture chapter',
          ids.chapterId,
          1,
          'Fixture Chapter 1',
          1,
          completedAt
        );
      database.connection
        .prepare(
          `INSERT INTO scheduler_policies(
        novel_id,enabled,interval_minutes,last_check_at,next_check_at,last_result,
        consecutive_failures,created_at,updated_at
      ) VALUES(?,?,?,?,?,?,?,?,?)`
        )
        .run(
          ids.novelId,
          1,
          1440,
          completedAt,
          '2026-07-24T00:05:00.000Z',
          'up_to_date',
          0,
          createdAt,
          completedAt
        );
      database.connection
        .prepare(
          `INSERT INTO source_reader_plugins(
        id,name,trust_level,status,active_version,enabled,installed_at,updated_at
      ) VALUES(?,?,?,?,?,?,?,?)`
        )
        .run(
          ids.pluginId,
          'Fixture Plugin',
          'built-in',
          'active',
          '1.0.0',
          1,
          createdAt,
          completedAt
        );
      database.connection
        .prepare(
          `INSERT INTO source_reader_plugin_versions(
        plugin_id,version,package_path,checksum,signature_status,manifest_json,sdk_range,
        installed_at,activated_at,trust_level,status,quarantine_reason,
        compatibility_issues_json,activated_extensions_json,sandbox_protocol_version
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
        )
        .run(
          ids.pluginId,
          '1.0.0',
          null,
          'fixture-checksum',
          'trusted',
          JSON.stringify(manifest),
          '>=1.0.0 <2.0.0',
          createdAt,
          completedAt,
          'built-in',
          'active',
          null,
          '[]',
          '{}',
          1
        );
      const search = database.connection.prepare(`INSERT INTO search_documents(
        document_type,document_id,novel_id,chapter_index,title,subtitle,content
      ) VALUES(?,?,?,?,?,?,?)`);
      search.run('novel', ids.novelId, ids.novelId, null, 'Fixture Novel', 'fixture', '');
      search.run(
        'chapter',
        ids.chapterId,
        ids.novelId,
        1,
        'Fixture Chapter 1',
        'Fixture Novel',
        'Fixture chapter content.'
      );
      database.connection
        .prepare(
          `INSERT INTO search_index_metadata(
             id, last_rebuilt_at, last_indexed_documents
           ) VALUES (1, ?, ?)`
        )
        .run(completedAt, 2);
    });

    return {
      databasePath,
      ids,
      counts: { novels: 1, chapters: 1, tasks: 1, plugins: 1 }
    };
  } finally {
    database.close();
  }
}
