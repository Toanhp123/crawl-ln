import type { SQLInputValue } from 'node:sqlite';
import type { IngestionJob, IngestionJobStatus } from '../../domain/ingestion.models.js';
import { IngestionJobEntity } from '../../domain/entities/ingestion-job.entity.js';
import { IngestionError } from '../../domain/errors/ingestion.error.js';
import type { IngestionRepository } from '../../domain/repositories/ingestion.repository.js';
import type { SqliteDatabase } from '../../../../platform/database/sqlite-database.js';
import { ingestionJobChapterRowSchema, mapIngestionJobRow } from './ingestion-row.schemas.js';

const activeStatuses = "'queued','running','pausing','paused','resuming'";
const interruptedStatuses = "'queued','running','pausing','resuming'";

export class IngestionSqliteRepository implements IngestionRepository {
  constructor(private readonly database: SqliteDatabase) {}

  async create(job: IngestionJob, chapterIds: readonly string[] = []): Promise<void> {
    const value = IngestionJobEntity.fromPrimitives(job).toPrimitives();
    try {
      this.database.transactionSync(() => {
        this.database.connection
          .prepare(
            `INSERT INTO ingestion_jobs
              (id, novel_id, status, outcome, total_chapters, fetched_chapters, failed_chapters,
               error_message, started_at, finished_at, paused_at, total_paused_ms, current_speed,
               average_speed, eta_seconds, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(...this.toJobValues(value));
        const insertChapter = this.database.connection.prepare(
          `INSERT INTO ingestion_job_chapters
            (job_id, chapter_id, position, status, attempt_count, error_message, updated_at)
           VALUES (?, ?, ?, 'pending', 0, NULL, ?)`
        );
        chapterIds.forEach((chapterId, position) => {
          insertChapter.run(value.id, chapterId, position, value.createdAt);
        });
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('UNIQUE constraint failed: ingestion_jobs.novel_id')) {
        throw new IngestionError(
          'INGESTION_ACTIVE_JOB_CONFLICT',
          'Novel already has an active ingestion job',
          { novelId: value.novelId }
        );
      }
      throw error;
    }
  }

  async update(job: IngestionJob): Promise<void> {
    const value = IngestionJobEntity.fromPrimitives(job).toPrimitives();
    this.database.connection
      .prepare(
        `UPDATE ingestion_jobs
            SET status = ?, outcome = ?, total_chapters = ?, fetched_chapters = ?,
                failed_chapters = ?, error_message = ?, started_at = ?, finished_at = ?,
                paused_at = ?, total_paused_ms = ?, current_speed = ?, average_speed = ?,
                eta_seconds = ?, updated_at = ?
          WHERE id = ?`
      )
      .run(
        value.status,
        value.outcome ?? null,
        value.totalChapters,
        value.fetchedChapters,
        value.failedChapters,
        value.errorMessage ?? null,
        value.startedAt ?? null,
        value.finishedAt ?? null,
        value.pausedAt ?? null,
        value.totalPausedMs,
        value.currentSpeed,
        value.averageSpeed,
        value.etaSeconds ?? null,
        value.updatedAt,
        value.id
      );
  }

  async findById(id: string): Promise<IngestionJob | null> {
    const row = this.database.connection
      .prepare('SELECT * FROM ingestion_jobs WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined;
    return row ? mapIngestionJobRow(row) : null;
  }

  async findChapterIds(jobId: string): Promise<string[]> {
    const rows = this.database.connection
      .prepare(
        `SELECT *
           FROM ingestion_job_chapters
          WHERE job_id = ?
          ORDER BY position ASC`
      )
      .all(jobId) as Record<string, unknown>[];
    return rows.map((input) => ingestionJobChapterRowSchema.parse(input).chapter_id);
  }

  async findByNovelId(novelId: string): Promise<IngestionJob | null> {
    const row = this.database.connection
      .prepare(
        `SELECT *
           FROM ingestion_jobs
          WHERE novel_id = ?
          ORDER BY created_at DESC, id DESC
          LIMIT 1`
      )
      .get(novelId) as Record<string, unknown> | undefined;
    return row ? mapIngestionJobRow(row) : null;
  }

  async findAll(limit = 50, status?: IngestionJobStatus): Promise<IngestionJob[]> {
    const rows = status
      ? (this.database.connection
          .prepare(
            `SELECT * FROM ingestion_jobs WHERE status = ? ORDER BY created_at DESC, id DESC LIMIT ?`
          )
          .all(status, limit) as Record<string, unknown>[])
      : (this.database.connection
          .prepare('SELECT * FROM ingestion_jobs ORDER BY created_at DESC, id DESC LIMIT ?')
          .all(limit) as Record<string, unknown>[]);
    return rows.map(mapIngestionJobRow);
  }

  async countActive(): Promise<number> {
    const row = this.database.connection
      .prepare(
        `SELECT COUNT(*) AS count
           FROM ingestion_jobs
          WHERE status IN ('queued','running','pausing','resuming')`
      )
      .get() as { count: number };
    return Number(row.count);
  }

  async findRecoverable(limit = 50): Promise<IngestionJob[]> {
    const rows = this.database.connection
      .prepare(
        `SELECT *
           FROM ingestion_jobs
          WHERE status IN (${activeStatuses})
          ORDER BY updated_at DESC, id DESC
          LIMIT ?`
      )
      .all(limit) as Record<string, unknown>[];
    return rows.map(mapIngestionJobRow);
  }

  async findInterrupted(limit = 50): Promise<IngestionJob[]> {
    const rows = this.database.connection
      .prepare(
        `SELECT *
           FROM ingestion_jobs
          WHERE status IN (${interruptedStatuses})
          ORDER BY updated_at DESC, id DESC
          LIMIT ?`
      )
      .all(limit) as Record<string, unknown>[];
    return rows.map(mapIngestionJobRow);
  }

  async hasActiveForNovel(novelId: string): Promise<boolean> {
    return Boolean(
      this.database.connection
        .prepare(
          `SELECT 1 AS found
             FROM ingestion_jobs
            WHERE novel_id = ? AND status IN (${activeStatuses})
            LIMIT 1`
        )
        .get(novelId)
    );
  }

  private toJobValues(job: IngestionJob): readonly SQLInputValue[] {
    return [
      job.id,
      job.novelId,
      job.status,
      job.outcome ?? null,
      job.totalChapters,
      job.fetchedChapters,
      job.failedChapters,
      job.errorMessage ?? null,
      job.startedAt ?? null,
      job.finishedAt ?? null,
      job.pausedAt ?? null,
      job.totalPausedMs,
      job.currentSpeed,
      job.averageSpeed,
      job.etaSeconds ?? null,
      job.createdAt,
      job.updatedAt
    ];
  }
}
