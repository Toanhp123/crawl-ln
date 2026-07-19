import type { SQLInputValue } from 'node:sqlite';
import { z } from 'zod';
import type { Chapter } from '@novel-tool/shared';

export type ChapterRow = Record<string, unknown>;

const chapterRowSchema = z.object({
  id: z.string().min(1),
  novel_id: z.string().min(1),
  chapter_index: z.coerce.number().int().nonnegative(),
  title: z.string(),
  source_url: z.string().url(),
  raw_text: z.string().nullable().optional(),
  clean_text: z.string().nullable().optional(),
  status: z.enum(['pending', 'fetched', 'failed']),
  error_message: z.string().nullable().optional(),
  content_version: z.coerce.number().int().positive().default(1)
});

export function mapChapterRow(input: ChapterRow): Chapter {
  const row = chapterRowSchema.parse(input);
  return {
    id: row.id,
    novelId: row.novel_id,
    index: row.chapter_index,
    title: row.title,
    sourceUrl: row.source_url,
    rawText: row.raw_text ?? undefined,
    cleanText: row.clean_text ?? undefined,
    status: row.status,
    errorMessage: row.error_message ?? undefined,
    contentVersion: row.content_version
  };
}

export function toChapterInsertValues(
  chapter: Chapter,
  novelId = chapter.novelId
): readonly SQLInputValue[] {
  return [
    chapter.id,
    novelId,
    chapter.index,
    chapter.title,
    chapter.sourceUrl,
    chapter.rawText ?? null,
    chapter.cleanText ?? null,
    chapter.status,
    chapter.errorMessage ?? null,
    chapter.contentVersion
  ];
}
export function toChapterUpdateValues(chapter: Chapter): readonly SQLInputValue[] {
  return [
    chapter.title,
    chapter.rawText ?? null,
    chapter.cleanText ?? null,
    chapter.status,
    chapter.errorMessage ?? null,
    chapter.id
  ];
}
