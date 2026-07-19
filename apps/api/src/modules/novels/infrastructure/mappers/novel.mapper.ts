import type { SQLInputValue } from 'node:sqlite';
import { z } from 'zod';
import type { Novel } from '@novel-tool/shared';

export type NovelRow = Record<string, unknown>;
const isoDate = z.string().datetime({ offset: true });
const novelRowSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  source_url: z.string().url(),
  source_name: z.string().min(1),
  author: z.string().nullable().optional(),
  cover_url: z.string().url().nullable().optional(),
  status: z.enum(['analyzed', 'crawling', 'completed', 'failed']),
  created_at: isoDate,
  updated_at: isoDate,
  auto_update_enabled: z.coerce.number().int().min(0).max(1).optional(),
  update_interval_minutes: z.coerce
    .number()
    .int()
    .refine((v) => [0, 360, 720, 1440, 10080].includes(v))
    .optional(),
  last_update_check_at: isoDate.nullable().optional(),
  next_update_check_at: isoDate.nullable().optional(),
  last_update_result: z
    .enum(['idle', 'up_to_date', 'queued', 'skipped_active_task', 'failed'])
    .optional(),
  consecutive_update_failures: z.coerce.number().int().nonnegative().optional(),
  chapter_count: z.coerce.number().int().nonnegative().optional(),
  fetched_chapter_count: z.coerce.number().int().nonnegative().optional(),
  failed_chapter_count: z.coerce.number().int().nonnegative().optional(),
  first_chapter_index: z.coerce.number().int().nonnegative().nullable().optional()
});
export function mapNovelRow(input: NovelRow): Novel {
  const row = novelRowSchema.parse(input);
  return {
    id: row.id,
    title: row.title,
    sourceUrl: row.source_url,
    sourceName: row.source_name,
    author: row.author ?? undefined,
    coverUrl: row.cover_url ?? undefined,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    autoUpdateEnabled: (row.auto_update_enabled ?? 0) === 1,
    updateIntervalMinutes: (row.update_interval_minutes ?? 1440) as Novel['updateIntervalMinutes'],
    lastUpdateCheckAt: row.last_update_check_at ?? undefined,
    nextUpdateCheckAt: row.next_update_check_at ?? undefined,
    lastUpdateResult: row.last_update_result ?? 'idle',
    consecutiveUpdateFailures: row.consecutive_update_failures ?? 0,
    chapterCount: row.chapter_count,
    fetchedChapterCount: row.fetched_chapter_count,
    failedChapterCount: row.failed_chapter_count,
    firstChapterIndex: row.first_chapter_index ?? undefined
  };
}
export function toNovelInsertValues(novel: Novel): readonly SQLInputValue[] {
  return [
    novel.id,
    novel.title,
    novel.sourceUrl,
    novel.sourceName,
    novel.author ?? null,
    novel.coverUrl ?? null,
    novel.status,
    novel.createdAt,
    novel.updatedAt
  ];
}
