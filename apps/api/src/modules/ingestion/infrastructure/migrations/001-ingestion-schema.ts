import type { ModuleMigration } from '../../../../platform/database/module-migration.js';

const ingestionSchemaMigration: ModuleMigration = {
  module: 'ingestion',
  version: 1,
  up(database) {
    database.exec(`
      CREATE TABLE ingestion_jobs (
        id TEXT PRIMARY KEY,
        novel_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN (
          'queued','running','pausing','paused','resuming','completed','failed','cancelled'
        )),
        outcome TEXT CHECK(outcome IS NULL OR outcome IN ('success','partial','failure')),
        total_chapters INTEGER NOT NULL DEFAULT 0 CHECK(total_chapters >= 0),
        fetched_chapters INTEGER NOT NULL DEFAULT 0 CHECK(fetched_chapters >= 0),
        failed_chapters INTEGER NOT NULL DEFAULT 0 CHECK(failed_chapters >= 0),
        error_message TEXT,
        started_at TEXT,
        finished_at TEXT,
        paused_at TEXT,
        total_paused_ms INTEGER NOT NULL DEFAULT 0 CHECK(total_paused_ms >= 0),
        current_speed REAL NOT NULL DEFAULT 0 CHECK(current_speed >= 0),
        average_speed REAL NOT NULL DEFAULT 0 CHECK(average_speed >= 0),
        eta_seconds INTEGER CHECK(eta_seconds IS NULL OR eta_seconds >= 0),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        CHECK(fetched_chapters + failed_chapters <= total_chapters),
        CHECK(
          (status = 'completed' AND outcome IN ('success','partial')) OR
          (status = 'failed' AND outcome = 'failure') OR
          (status NOT IN ('completed','failed') AND outcome IS NULL)
        )
      );

      CREATE TABLE ingestion_job_chapters (
        job_id TEXT NOT NULL,
        chapter_id TEXT NOT NULL,
        position INTEGER NOT NULL CHECK(position >= 0),
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','fetched','failed')),
        attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count >= 0),
        error_message TEXT,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(job_id, chapter_id),
        UNIQUE(job_id, position),
        FOREIGN KEY(job_id) REFERENCES ingestion_jobs(id) ON DELETE CASCADE
      );

      CREATE TABLE ingestion_events (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        type TEXT NOT NULL,
        level TEXT NOT NULL CHECK(level IN ('info','success','warning','error')),
        message TEXT NOT NULL,
        chapter_id TEXT,
        chapter_index INTEGER CHECK(chapter_index IS NULL OR chapter_index >= 0),
        chapter_title TEXT,
        attempt INTEGER CHECK(attempt IS NULL OR attempt >= 0),
        created_at TEXT NOT NULL,
        FOREIGN KEY(job_id) REFERENCES ingestion_jobs(id) ON DELETE CASCADE
      );

      CREATE TABLE ingestion_command_receipts (
        command_id TEXT PRIMARY KEY,
        command_type TEXT NOT NULL,
        result_json TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE ingestion_outbox (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        claimed_at TEXT,
        delivered_at TEXT,
        delivery_attempts INTEGER NOT NULL DEFAULT 0 CHECK(delivery_attempts >= 0)
      );

      CREATE UNIQUE INDEX ingestion_one_active_job_per_novel
        ON ingestion_jobs(novel_id)
        WHERE status IN ('queued','running','pausing','paused','resuming');
      CREATE INDEX ingestion_jobs_created
        ON ingestion_jobs(created_at DESC);
      CREATE INDEX ingestion_job_chapters_pending
        ON ingestion_job_chapters(job_id, status, position);
      CREATE INDEX ingestion_events_job_created
        ON ingestion_events(job_id, created_at DESC);
      CREATE INDEX ingestion_outbox_pending
        ON ingestion_outbox(delivered_at, occurred_at);
    `);
  }
};

export const ingestionMigrations: ModuleMigration[] = [ingestionSchemaMigration];
