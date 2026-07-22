import { z } from 'zod';
import { LibraryChapterEntity } from '../../domain/entities/library-chapter.entity.js';
import { LibraryNovelEntity } from '../../domain/entities/library-novel.entity.js';
import type {
  LibraryChapter,
  LibraryNovel,
  LibraryNovelDetail
} from '../../domain/library.models.js';
import type { ApplicationEvent } from '../../../../platform/events/application-event.js';

const isoTimestamp = z.string().datetime({ offset: true });
const novelStatus = z.enum(['analyzed', 'crawling', 'completed', 'failed']);
const chapterStatus = z.enum(['pending', 'fetched', 'failed']);

const libraryNovelModelSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    sourceUrl: z.string().url(),
    sourceName: z.string().min(1),
    author: z.string().optional(),
    coverUrl: z.string().url().optional(),
    status: novelStatus,
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp,
    chapterCount: z.number().int().nonnegative().optional(),
    fetchedChapterCount: z.number().int().nonnegative().optional(),
    failedChapterCount: z.number().int().nonnegative().optional(),
    firstChapterIndex: z.number().int().nonnegative().optional()
  })
  .strict();

const libraryChapterModelSchema = z
  .object({
    id: z.string().min(1),
    novelId: z.string().min(1),
    index: z.number().int().nonnegative(),
    title: z.string().min(1),
    sourceUrl: z.string().url(),
    rawText: z.string().optional(),
    cleanText: z.string().optional(),
    status: chapterStatus,
    errorMessage: z.string().optional(),
    sourceAvailable: z.boolean(),
    contentVersion: z.number().int().positive(),
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp
  })
  .strict();

const libraryNovelDetailSchema = z
  .object({
    novel: libraryNovelModelSchema,
    chapters: z.array(libraryChapterModelSchema)
  })
  .strict();

const libraryNovelRowSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    source_url: z.string().url(),
    source_name: z.string().min(1),
    author: z.string().nullable(),
    cover_url: z.string().url().nullable(),
    status: novelStatus,
    created_at: isoTimestamp,
    updated_at: isoTimestamp,
    chapter_count: z.coerce.number().int().nonnegative().optional(),
    fetched_chapter_count: z.coerce.number().int().nonnegative().optional(),
    failed_chapter_count: z.coerce.number().int().nonnegative().optional(),
    first_chapter_index: z.coerce.number().int().nonnegative().nullable().optional()
  })
  .strict();

const libraryChapterRowSchema = z
  .object({
    id: z.string().min(1),
    novel_id: z.string().min(1),
    chapter_index: z.coerce.number().int().nonnegative(),
    title: z.string().min(1),
    source_url: z.string().url(),
    raw_text: z.string().nullable(),
    clean_text: z.string().nullable(),
    status: chapterStatus,
    error_message: z.string().nullable(),
    source_available: z.coerce.number().int().min(0).max(1),
    content_version: z.coerce.number().int().positive(),
    created_at: isoTimestamp,
    updated_at: isoTimestamp
  })
  .strict();

export const libraryCommandReceiptRowSchema = z
  .object({
    command_id: z.string().min(1),
    command_type: z.string().min(1),
    result_json: z.string().nullable(),
    created_at: isoTimestamp
  })
  .strict();

export const libraryOutboxRowSchema = z
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

export function mapLibraryNovelRow(input: unknown): LibraryNovel {
  const row = libraryNovelRowSchema.parse(input);
  return LibraryNovelEntity.create({
    id: row.id,
    title: row.title,
    sourceUrl: row.source_url,
    sourceName: row.source_name,
    ...(row.author === null ? {} : { author: row.author }),
    ...(row.cover_url === null ? {} : { coverUrl: row.cover_url }),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.chapter_count === undefined ? {} : { chapterCount: row.chapter_count }),
    ...(row.fetched_chapter_count === undefined
      ? {}
      : { fetchedChapterCount: row.fetched_chapter_count }),
    ...(row.failed_chapter_count === undefined
      ? {}
      : { failedChapterCount: row.failed_chapter_count }),
    ...(row.first_chapter_index === undefined || row.first_chapter_index === null
      ? {}
      : { firstChapterIndex: row.first_chapter_index })
  }).toPrimitives();
}

export function mapLibraryChapterRow(input: unknown): LibraryChapter {
  const row = libraryChapterRowSchema.parse(input);
  return LibraryChapterEntity.create({
    id: row.id,
    novelId: row.novel_id,
    index: row.chapter_index,
    title: row.title,
    sourceUrl: row.source_url,
    ...(row.raw_text === null ? {} : { rawText: row.raw_text }),
    ...(row.clean_text === null ? {} : { cleanText: row.clean_text }),
    status: row.status,
    ...(row.error_message === null ? {} : { errorMessage: row.error_message }),
    sourceAvailable: row.source_available === 1,
    contentVersion: row.content_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }).toPrimitives();
}

export function parseLibraryNovelDetail(input: unknown): LibraryNovelDetail {
  const detail = libraryNovelDetailSchema.parse(input);
  return {
    novel: LibraryNovelEntity.create(detail.novel).toPrimitives(),
    chapters: detail.chapters.map((chapter) => LibraryChapterEntity.create(chapter).toPrimitives())
  };
}

export function parseLibraryChapter(input: unknown): LibraryChapter {
  const chapter = libraryChapterModelSchema.parse(input);
  return LibraryChapterEntity.create(chapter).toPrimitives();
}

export function mapLibraryOutboxRow(input: unknown): ApplicationEvent {
  const row = libraryOutboxRowSchema.parse(input);
  return {
    id: row.id,
    type: row.type,
    occurredAt: row.occurred_at,
    payload: JSON.parse(row.payload_json) as unknown
  };
}
