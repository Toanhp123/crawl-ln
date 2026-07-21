import { z } from 'zod';
import { IngestionJobEntity } from '../../domain/entities/ingestion-job.entity.js';
import type {
  IngestionEvent,
  IngestionJob,
  IngestionJobChapter
} from '../../domain/ingestion.models.js';
import type { ApplicationEvent } from '../../../../platform/events/application-event.js';

const isoTimestamp = z.string().datetime({ offset: true });
const jobStatus = z.enum([
  'queued',
  'running',
  'pausing',
  'paused',
  'resuming',
  'completed',
  'failed',
  'cancelled'
]);
const jobOutcome = z.enum(['success', 'partial', 'failure']);

const ingestionJobModelSchema = z
  .object({
    id: z.string().min(1),
    novelId: z.string().min(1),
    status: jobStatus,
    outcome: jobOutcome.optional(),
    totalChapters: z.number().int().nonnegative(),
    fetchedChapters: z.number().int().nonnegative(),
    failedChapters: z.number().int().nonnegative(),
    errorMessage: z.string().optional(),
    startedAt: isoTimestamp.optional(),
    finishedAt: isoTimestamp.optional(),
    pausedAt: isoTimestamp.optional(),
    totalPausedMs: z.number().int().nonnegative(),
    currentSpeed: z.number().nonnegative(),
    averageSpeed: z.number().nonnegative(),
    etaSeconds: z.number().int().nonnegative().optional(),
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp
  })
  .strict();

const ingestionJobRowSchema = z
  .object({
    id: z.string().min(1),
    novel_id: z.string().min(1),
    status: jobStatus,
    outcome: jobOutcome.nullable(),
    total_chapters: z.coerce.number().int().nonnegative(),
    fetched_chapters: z.coerce.number().int().nonnegative(),
    failed_chapters: z.coerce.number().int().nonnegative(),
    error_message: z.string().nullable(),
    started_at: isoTimestamp.nullable(),
    finished_at: isoTimestamp.nullable(),
    paused_at: isoTimestamp.nullable(),
    total_paused_ms: z.coerce.number().int().nonnegative(),
    current_speed: z.coerce.number().nonnegative(),
    average_speed: z.coerce.number().nonnegative(),
    eta_seconds: z.coerce.number().int().nonnegative().nullable(),
    created_at: isoTimestamp,
    updated_at: isoTimestamp
  })
  .strict();

export const ingestionCommandReceiptRowSchema = z
  .object({
    command_id: z.string().min(1),
    command_type: z.string().min(1),
    result_json: z.string().nullable(),
    created_at: isoTimestamp
  })
  .strict();

const ingestionOutboxRowSchema = z
  .object({
    id: z.string().min(1),
    type: z.string().min(1),
    occurred_at: isoTimestamp,
    payload_json: z.string(),
    claimed_at: isoTimestamp.nullable(),
    delivered_at: isoTimestamp.nullable(),
    delivery_attempts: z.coerce.number().int().nonnegative()
  })
  .strict();

export const ingestionJobChapterRowSchema = z
  .object({
    job_id: z.string().min(1),
    chapter_id: z.string().min(1),
    position: z.coerce.number().int().nonnegative(),
    status: z.enum(['pending', 'fetched', 'failed']),
    attempt_count: z.coerce.number().int().nonnegative(),
    error_message: z.string().nullable(),
    updated_at: isoTimestamp
  })
  .strict();

const ingestionEventRowSchema = z
  .object({
    id: z.string().min(1),
    job_id: z.string().min(1),
    type: z.enum([
      'job_created',
      'started',
      'chapter_started',
      'chapter_succeeded',
      'chapter_failed',
      'chapter_retry',
      'pause_requested',
      'paused',
      'resume_requested',
      'resumed',
      'cancelled',
      'completed',
      'failed',
      'recovered_paused'
    ]),
    level: z.enum(['info', 'success', 'warning', 'error']),
    message: z.string(),
    chapter_id: z.string().nullable(),
    chapter_index: z.coerce.number().int().nonnegative().nullable(),
    chapter_title: z.string().nullable(),
    attempt: z.coerce.number().int().nonnegative().nullable(),
    created_at: isoTimestamp
  })
  .strict();

export function mapIngestionJobRow(input: unknown): IngestionJob {
  const row = ingestionJobRowSchema.parse(input);
  return IngestionJobEntity.fromPrimitives({
    id: row.id,
    novelId: row.novel_id,
    status: row.status,
    ...(row.outcome === null ? {} : { outcome: row.outcome }),
    totalChapters: row.total_chapters,
    fetchedChapters: row.fetched_chapters,
    failedChapters: row.failed_chapters,
    ...(row.error_message === null ? {} : { errorMessage: row.error_message }),
    ...(row.started_at === null ? {} : { startedAt: row.started_at }),
    ...(row.finished_at === null ? {} : { finishedAt: row.finished_at }),
    ...(row.paused_at === null ? {} : { pausedAt: row.paused_at }),
    totalPausedMs: row.total_paused_ms,
    currentSpeed: row.current_speed,
    averageSpeed: row.average_speed,
    ...(row.eta_seconds === null ? {} : { etaSeconds: row.eta_seconds }),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }).toPrimitives();
}

export function parseIngestionJob(input: unknown): IngestionJob {
  return IngestionJobEntity.fromPrimitives(ingestionJobModelSchema.parse(input)).toPrimitives();
}

export function mapIngestionJobChapterRow(input: unknown): IngestionJobChapter {
  const row = ingestionJobChapterRowSchema.parse(input);
  return {
    jobId: row.job_id,
    chapterId: row.chapter_id,
    position: row.position,
    status: row.status,
    attemptCount: row.attempt_count,
    ...(row.error_message === null ? {} : { errorMessage: row.error_message }),
    updatedAt: row.updated_at
  };
}

export function mapIngestionEventRow(input: unknown): IngestionEvent {
  const row = ingestionEventRowSchema.parse(input);
  return {
    id: row.id,
    jobId: row.job_id,
    type: row.type,
    level: row.level,
    message: row.message,
    ...(row.chapter_id === null ? {} : { chapterId: row.chapter_id }),
    ...(row.chapter_index === null ? {} : { chapterIndex: row.chapter_index }),
    ...(row.chapter_title === null ? {} : { chapterTitle: row.chapter_title }),
    ...(row.attempt === null ? {} : { attempt: row.attempt }),
    createdAt: row.created_at
  };
}

export function mapIngestionOutboxRow(input: unknown): ApplicationEvent {
  const row = ingestionOutboxRowSchema.parse(input);
  return {
    id: row.id,
    type: row.type,
    occurredAt: row.occurred_at,
    payload: JSON.parse(row.payload_json) as unknown
  };
}
