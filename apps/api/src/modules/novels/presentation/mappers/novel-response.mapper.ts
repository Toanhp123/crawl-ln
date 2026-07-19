import type {
  Chapter as ChapterResponse,
  CrawlTask as CrawlTaskResponse,
  Novel as NovelResponse,
  NovelDetail as NovelDetailResponse,
  NovelStats as NovelStatsResponse,
  PaginatedNovels as PaginatedNovelsResponse,
  UpdateNovelResult as UpdateNovelResponse
} from '@novel-tool/shared';
import type {
  Chapter,
  CrawlTask,
  NovelDetail
} from '../../application/models/novel-application.js';
import type { UpdateNovelResult } from '../../application/models/novel-application.js';
import type { Novel, PaginatedNovels } from '../../domain/models/novel.js';

export function toNovelResponse(novel: Novel): NovelResponse {
  return {
    id: novel.id,
    title: novel.title,
    sourceUrl: novel.sourceUrl,
    sourceName: novel.sourceName,
    author: novel.author,
    coverUrl: novel.coverUrl,
    status: novel.status,
    createdAt: novel.createdAt,
    updatedAt: novel.updatedAt,
    autoUpdateEnabled: novel.autoUpdateEnabled,
    updateIntervalMinutes: novel.updateIntervalMinutes,
    lastUpdateCheckAt: novel.lastUpdateCheckAt,
    nextUpdateCheckAt: novel.nextUpdateCheckAt,
    lastUpdateResult: novel.lastUpdateResult,
    consecutiveUpdateFailures: novel.consecutiveUpdateFailures,
    chapterCount: novel.chapterCount,
    fetchedChapterCount: novel.fetchedChapterCount,
    failedChapterCount: novel.failedChapterCount,
    firstChapterIndex: novel.firstChapterIndex
  };
}

function toChapterResponse(chapter: Chapter): ChapterResponse {
  return {
    id: chapter.id,
    novelId: chapter.novelId,
    index: chapter.index,
    title: chapter.title,
    sourceUrl: chapter.sourceUrl,
    rawText: chapter.rawText,
    cleanText: chapter.cleanText,
    status: chapter.status,
    errorMessage: chapter.errorMessage,
    contentVersion: chapter.contentVersion
  };
}

export function toNovelDetailResponse(detail: NovelDetail): NovelDetailResponse {
  return {
    novel: toNovelResponse(detail.novel),
    chapters: detail.chapters.map(toChapterResponse)
  };
}

export function toPaginatedNovelsResponse(page: PaginatedNovels): PaginatedNovelsResponse {
  return { ...page, items: page.items.map(toNovelResponse) };
}

export function toCrawlTaskResponse(task: CrawlTask | null): CrawlTaskResponse | null {
  if (!task) return null;
  return { ...task };
}

export function toAnalyzeNovelResponse(
  result: Novel & { chapters: Chapter[] }
): NovelResponse & { chapters: ChapterResponse[] } {
  const { chapters, ...novel } = result;
  return { ...toNovelResponse(novel), chapters: chapters.map(toChapterResponse) };
}

export function toUpdateNovelResponse(result: UpdateNovelResult): UpdateNovelResponse {
  return {
    novel: toNovelDetailResponse(result.novel),
    newChapterCount: result.newChapterCount,
    pendingChapterCount: result.pendingChapterCount,
    task: toCrawlTaskResponse(result.task)
  };
}

export function toNovelStatsResponse(result: NovelStatsResponse): NovelStatsResponse {
  return { ...result };
}
