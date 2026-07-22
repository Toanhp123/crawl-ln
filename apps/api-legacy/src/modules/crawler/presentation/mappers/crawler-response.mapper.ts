import type {
  AnalyzeNovelResult as AnalyzeNovelResponse,
  CrawlEvent as CrawlEventResponse
} from '@novel-tool/shared';
import type { AnalyzeNovelResult } from '../../application/models/crawler-contracts.js';
import type { CrawlEvent } from '../../domain/events/crawl-event.entity.js';

export function toAnalyzeSourceResponse(result: AnalyzeNovelResult): AnalyzeNovelResponse {
  return {
    ...result,
    chapters: result.chapters.map((chapter) => ({ ...chapter })),
    diagnostics: result.diagnostics
      ? { ...result.diagnostics, firstChapterUrls: [...result.diagnostics.firstChapterUrls] }
      : undefined
  };
}

export function toCrawlEventResponse(event: CrawlEvent): CrawlEventResponse {
  return { ...event };
}

export function toCrawlEventListResponse(events: CrawlEvent[]): CrawlEventResponse[] {
  return events.map(toCrawlEventResponse);
}

import type { CrawlTask as CrawlTaskResponse } from '@novel-tool/shared';
import type { CrawlTask } from '../../application/models/crawler-contracts.js';
export function toCrawlTaskResponse(task: CrawlTask): CrawlTaskResponse {
  return { ...task };
}

export function toCrawlTaskListResponse(tasks: CrawlTask[]): CrawlTaskResponse[] {
  return tasks.map(toCrawlTaskResponse);
}
