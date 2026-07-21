import type { Chapter, CrawlTask, Novel, NovelDetail, PaginatedNovels } from '@novel-tool/shared';
import type {
  LibraryChapter,
  LibraryNovel,
  LibraryNovelDetail,
  PaginatedLibraryNovels
} from '../public/library.api.js';
import type { IngestionJob } from '../../ingestion/public/ingestion.api.js';
import type { SchedulerPolicy } from '../../scheduler/public/scheduler.api.js';

function schedulerFields(
  policy: SchedulerPolicy | null
): Pick<
  Novel,
  | 'autoUpdateEnabled'
  | 'updateIntervalMinutes'
  | 'lastUpdateCheckAt'
  | 'nextUpdateCheckAt'
  | 'lastUpdateResult'
  | 'consecutiveUpdateFailures'
> {
  return {
    autoUpdateEnabled: policy?.enabled ?? false,
    updateIntervalMinutes: policy?.intervalMinutes ?? 1440,
    ...(policy?.lastCheckAt ? { lastUpdateCheckAt: policy.lastCheckAt } : {}),
    ...(policy?.nextCheckAt ? { nextUpdateCheckAt: policy.nextCheckAt } : {}),
    lastUpdateResult: policy?.lastResult ?? 'idle',
    consecutiveUpdateFailures: policy?.consecutiveFailures ?? 0
  };
}

export function toNovelResponse(
  novel: LibraryNovel,
  policy: SchedulerPolicy | null,
  includeAggregates: boolean
): Novel {
  return {
    id: novel.id,
    title: novel.title,
    sourceUrl: novel.sourceUrl,
    sourceName: novel.sourceName,
    ...(novel.author ? { author: novel.author } : {}),
    ...(novel.coverUrl ? { coverUrl: novel.coverUrl } : {}),
    status: novel.status,
    createdAt: novel.createdAt,
    updatedAt: novel.updatedAt,
    ...schedulerFields(policy),
    ...(includeAggregates && novel.chapterCount !== undefined
      ? { chapterCount: novel.chapterCount }
      : {}),
    ...(includeAggregates && novel.fetchedChapterCount !== undefined
      ? { fetchedChapterCount: novel.fetchedChapterCount }
      : {}),
    ...(includeAggregates && novel.failedChapterCount !== undefined
      ? { failedChapterCount: novel.failedChapterCount }
      : {}),
    ...(includeAggregates && novel.firstChapterIndex !== undefined
      ? { firstChapterIndex: novel.firstChapterIndex }
      : {})
  };
}

export function toChapterResponse(chapter: LibraryChapter): Chapter {
  return {
    id: chapter.id,
    novelId: chapter.novelId,
    index: chapter.index,
    title: chapter.title,
    sourceUrl: chapter.sourceUrl,
    ...(chapter.rawText !== undefined ? { rawText: chapter.rawText } : {}),
    ...(chapter.cleanText !== undefined ? { cleanText: chapter.cleanText } : {}),
    status: chapter.status,
    ...(chapter.errorMessage !== undefined ? { errorMessage: chapter.errorMessage } : {}),
    contentVersion: chapter.contentVersion
  };
}

export function toNovelDetailResponse(
  detail: LibraryNovelDetail,
  policy: SchedulerPolicy | null
): NovelDetail {
  return {
    novel: toNovelResponse(detail.novel, policy, false),
    chapters: detail.chapters.map(toChapterResponse)
  };
}

export function toPaginatedNovelsResponse(
  page: PaginatedLibraryNovels,
  policies: ReadonlyMap<string, SchedulerPolicy | null>
): PaginatedNovels {
  return {
    ...page,
    items: page.items.map((novel) => toNovelResponse(novel, policies.get(novel.id) ?? null, true))
  };
}

export function toCrawlTaskResponse(job: IngestionJob | null): CrawlTask | null {
  return job ? { ...job } : null;
}
