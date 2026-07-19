import type { SQLInputValue } from 'node:sqlite';
import { z } from 'zod';
import type { CrawlTask } from '../../domain/entities/task.entity.js';
export type TaskRow = Record<string, unknown>;
const isoDate = z.string().datetime({ offset: true });
const taskRowSchema = z
  .object({
    id: z.string().min(1),
    novel_id: z.string().min(1),
    status: z.enum([
      'queued',
      'running',
      'pausing',
      'paused',
      'resuming',
      'completed',
      'failed',
      'cancelled'
    ]),
    outcome: z.enum(['success', 'partial', 'failure']).nullable().optional(),
    total_chapters: z.coerce.number().int().nonnegative(),
    fetched_chapters: z.coerce.number().int().nonnegative(),
    failed_chapters: z.coerce.number().int().nonnegative(),
    error_message: z.string().nullable().optional(),
    started_at: isoDate.nullable().optional(),
    finished_at: isoDate.nullable().optional(),
    paused_at: isoDate.nullable().optional(),
    total_paused_ms: z.coerce.number().int().nonnegative().optional(),
    current_speed: z.coerce.number().nonnegative().optional(),
    average_speed: z.coerce.number().nonnegative().optional(),
    eta_seconds: z.coerce.number().int().nonnegative().nullable().optional(),
    created_at: isoDate,
    updated_at: isoDate
  })
  .superRefine((row, ctx) => {
    if (row.fetched_chapters + row.failed_chapters > row.total_chapters)
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'task chapter counters exceed total' });
    const terminal = ['completed', 'failed'].includes(row.status);
    if (!terminal && row.outcome != null)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'non-terminal task cannot have outcome'
      });
    if (row.status === 'completed' && !['success', 'partial'].includes(row.outcome ?? ''))
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'completed task requires success or partial outcome'
      });
    if (row.status === 'failed' && row.outcome !== 'failure')
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'failed task requires failure outcome'
      });
  });
export function mapTaskRow(input: TaskRow): CrawlTask {
  const row = taskRowSchema.parse(input);
  return {
    id: row.id,
    novelId: row.novel_id,
    status: row.status,
    outcome: row.outcome ?? undefined,
    totalChapters: row.total_chapters,
    fetchedChapters: row.fetched_chapters,
    failedChapters: row.failed_chapters,
    errorMessage: row.error_message ?? undefined,
    startedAt: row.started_at ?? undefined,
    finishedAt: row.finished_at ?? undefined,
    pausedAt: row.paused_at ?? undefined,
    totalPausedMs: row.total_paused_ms ?? 0,
    currentSpeed: row.current_speed ?? 0,
    averageSpeed: row.average_speed ?? 0,
    etaSeconds: row.eta_seconds ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
export function toTaskInsertValues(task: CrawlTask): readonly SQLInputValue[] {
  return [
    task.id,
    task.novelId,
    task.status,
    task.outcome ?? null,
    task.totalChapters,
    task.fetchedChapters,
    task.failedChapters,
    task.errorMessage ?? null,
    task.startedAt ?? null,
    task.finishedAt ?? null,
    task.pausedAt ?? null,
    task.totalPausedMs,
    task.currentSpeed,
    task.averageSpeed,
    task.etaSeconds ?? null,
    task.createdAt,
    task.updatedAt
  ];
}
export function toTaskUpdateValues(task: CrawlTask): readonly SQLInputValue[] {
  return [
    task.status,
    task.outcome ?? null,
    task.totalChapters,
    task.fetchedChapters,
    task.failedChapters,
    task.errorMessage ?? null,
    task.startedAt ?? null,
    task.finishedAt ?? null,
    task.pausedAt ?? null,
    task.totalPausedMs,
    task.currentSpeed,
    task.averageSpeed,
    task.etaSeconds ?? null,
    task.updatedAt,
    task.id
  ];
}
