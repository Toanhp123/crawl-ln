import { z } from 'zod';
import { IngestionJobEntity } from '../../domain/entities/ingestion-job.entity.js';
import type { IngestionJob } from '../../domain/ingestion.models.js';

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

const ingestionJobRowSchema = z
  .object({
    id: z.string().min(1),
    novel_id: z.string().min(1),
    status: jobStatus,
    outcome: z.enum(['success', 'partial', 'failure']).nullable(),
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
