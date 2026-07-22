import type { SQLInputValue } from 'node:sqlite';
import type {
  IngestionEvent,
  IngestionJob,
  IngestionJobChapter,
  IngestionJobStatus
} from '../../domain/ingestion.models.js';
import { IngestionJobEntity } from '../../domain/entities/ingestion-job.entity.js';
import { IngestionError } from '../../domain/errors/ingestion.error.js';
import type { IngestionRepository } from '../../domain/repositories/ingestion.repository.js';
import type { SqliteDatabase } from '../../../../platform/database/sqlite-database.js';
import {
  ingestionCommandReceiptRowSchema,
  ingestionJobChapterRowSchema,
  mapIngestionEventRow,
  mapIngestionJobChapterRow,
  mapIngestionJobRow,
  parseIngestionJob
} from './ingestion-row.schemas.js';

const activeStatuses = "'queued','running','pausing','paused','resuming'";
const interruptedStatuses = "'queued','running','pausing','resuming'";

export class IngestionSqliteRepository implements IngestionRepository {
  constructor(private readonly database: SqliteDatabase) {}

  async create(job: IngestionJob, chapterIds: readonly string[] = []): Promise<void> {
    const value = IngestionJobEntity.fromPrimitives(job).toPrimitives();
    try {
      this.database.transactionSync(() => this.insertJob(value, chapterIds));
    } catch (error) {
      this.throwCreateError(error, value.novelId);
    }
  }

  async createForCommand(
    commandId: string,
    job: IngestionJob,
    chapterIds: readonly string[] = []
  ): Promise<{ job: IngestionJob; created: boolean }> {
    if (typeof commandId !== 'string' || commandId.trim().length === 0) {
      throw IngestionError.validation('commandId must not be blank');
    }
    const value = IngestionJobEntity.fromPrimitives(job).toPrimitives();
    try {
      return this.database.transactionSync(() => {
        const receiptInput = this.database.connection
          .prepare('SELECT * FROM ingestion_command_receipts WHERE command_id = ?')
          .get(commandId);
        if (receiptInput) {
          const receipt = ingestionCommandReceiptRowSchema.parse(receiptInput);
          if (receipt.command_type !== 'create-ingestion-job' || receipt.result_json === null) {
            throw new IngestionError(
              'INGESTION_CONFLICT',
              `Command ID ${commandId} belongs to another Ingestion operation`
            );
          }
          return { job: parseIngestionJob(JSON.parse(receipt.result_json)), created: false };
        }

        this.insertJob(value, chapterIds);
        const resultJson = JSON.stringify(value);
        const stored = parseIngestionJob(JSON.parse(resultJson));
        this.database.connection
          .prepare(
            `INSERT INTO ingestion_events
              (id, job_id, type, level, message, chapter_id, chapter_index, chapter_title,
               attempt, created_at)
             VALUES (?, ?, 'job_created', 'info', ?, NULL, NULL, NULL, NULL, ?)`
          )
          .run(
            `ingestion.event:${commandId}`,
            stored.id,
            'Ingestion job created and added to the queue',
            stored.createdAt
          );
        this.database.connection
          .prepare(
            `INSERT INTO ingestion_outbox(id, type, occurred_at, payload_json)
             VALUES (?, 'ingestion.job-created', ?, ?)`
          )
          .run(
            `ingestion.job-created:${commandId}`,
            value.createdAt,
            JSON.stringify({ commandId, job: stored, chapterIds })
          );
        this.database.connection
          .prepare(
            `INSERT INTO ingestion_command_receipts(command_id, command_type, result_json, created_at)
             VALUES (?, 'create-ingestion-job', ?, ?)`
          )
          .run(commandId, resultJson, value.createdAt);
        return { job: stored, created: true };
      });
    } catch (error) {
      this.throwCreateError(error, value.novelId);
    }
  }

  async hasCommandReceipt(commandId: string, commandType: string): Promise<boolean> {
    const input = this.database.connection
      .prepare('SELECT * FROM ingestion_command_receipts WHERE command_id = ?')
      .get(commandId);
    if (!input) return false;
    const receipt = ingestionCommandReceiptRowSchema.parse(input);
    if (receipt.command_type !== commandType || receipt.result_json !== null) {
      throw new IngestionError(
        'INGESTION_CONFLICT',
        `Command ID ${commandId} belongs to another Ingestion operation`
      );
    }
    return true;
  }

  async recordCommandReceipt(
    commandId: string,
    commandType: string,
    createdAt: string
  ): Promise<void> {
    try {
      this.database.connection
        .prepare(
          `INSERT INTO ingestion_command_receipts(command_id, command_type, result_json, created_at)
           VALUES (?, ?, NULL, ?)`
        )
        .run(commandId, commandType, createdAt);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('UNIQUE constraint failed: ingestion_command_receipts.command_id')) {
        await this.hasCommandReceipt(commandId, commandType);
        return;
      }
      throw error;
    }
  }

  async update(job: IngestionJob): Promise<void> {
    const value = IngestionJobEntity.fromPrimitives(job).toPrimitives();
    this.updateJob(value);
  }

  async saveJobWithEvent(job: IngestionJob, event: IngestionEvent): Promise<void> {
    const value = IngestionJobEntity.fromPrimitives(job).toPrimitives();
    this.database.transactionSync(() => {
      this.updateJob(value);
      this.insertEvent(event);
    });
  }

  async recordChapterResult(
    job: IngestionJob,
    chapter: IngestionJobChapter,
    event: IngestionEvent
  ): Promise<void> {
    const value = IngestionJobEntity.fromPrimitives(job).toPrimitives();
    this.database.transactionSync(() => {
      this.updateJob(value);
      this.database.connection
        .prepare(
          `UPDATE ingestion_job_chapters
              SET status = ?, attempt_count = ?, error_message = ?, updated_at = ?
            WHERE job_id = ? AND chapter_id = ?`
        )
        .run(
          chapter.status,
          chapter.attemptCount,
          chapter.errorMessage ?? null,
          chapter.updatedAt,
          chapter.jobId,
          chapter.chapterId
        );
      this.insertEvent(event);
    });
  }

  private updateJob(value: IngestionJob): void {
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

  async findJobChapters(jobId: string): Promise<IngestionJobChapter[]> {
    const rows = this.database.connection
      .prepare(
        `SELECT *
           FROM ingestion_job_chapters
          WHERE job_id = ?
          ORDER BY position ASC`
      )
      .all(jobId) as Record<string, unknown>[];
    return rows.map(mapIngestionJobChapterRow);
  }

  async findEvents(jobId: string, limit = 100): Promise<IngestionEvent[]> {
    const rows = this.database.connection
      .prepare(
        `SELECT *
           FROM ingestion_events
          WHERE job_id = ?
          ORDER BY created_at DESC, id DESC
          LIMIT ?`
      )
      .all(jobId, limit) as Record<string, unknown>[];
    return rows.map(mapIngestionEventRow);
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

  private insertJob(job: IngestionJob, chapterIds: readonly string[]): void {
    this.database.connection
      .prepare(
        `INSERT INTO ingestion_jobs
          (id, novel_id, status, outcome, total_chapters, fetched_chapters, failed_chapters,
           error_message, started_at, finished_at, paused_at, total_paused_ms, current_speed,
           average_speed, eta_seconds, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(...this.toJobValues(job));
    const insertChapter = this.database.connection.prepare(
      `INSERT INTO ingestion_job_chapters
        (job_id, chapter_id, position, status, attempt_count, error_message, updated_at)
       VALUES (?, ?, ?, 'pending', 0, NULL, ?)`
    );
    chapterIds.forEach((chapterId, position) => {
      insertChapter.run(job.id, chapterId, position, job.createdAt);
    });
  }

  private insertEvent(event: IngestionEvent): void {
    this.database.connection
      .prepare(
        `INSERT INTO ingestion_events
          (id, job_id, type, level, message, chapter_id, chapter_index, chapter_title,
           attempt, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        event.id,
        event.jobId,
        event.type,
        event.level,
        event.message,
        event.chapterId ?? null,
        event.chapterIndex ?? null,
        event.chapterTitle ?? null,
        event.attempt ?? null,
        event.createdAt
      );
    this.database.connection
      .prepare(
        `INSERT INTO ingestion_outbox(id, type, occurred_at, payload_json)
         VALUES (?, 'ingestion.audit-recorded', ?, ?)`
      )
      .run(`ingestion.audit:${event.id}`, event.createdAt, JSON.stringify(event));
  }

  private throwCreateError(error: unknown, novelId: string): never {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('UNIQUE constraint failed: ingestion_jobs.novel_id')) {
      throw new IngestionError(
        'INGESTION_ACTIVE_JOB_CONFLICT',
        'Novel already has an active ingestion job',
        { novelId }
      );
    }
    throw error;
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
