import type { Chapter as ChapterResponse } from '@novel-tool/shared';
import type { Chapter } from '../../domain/models/chapter.js';

export function toChapterResponse(chapter: Chapter): ChapterResponse {
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

export function toChapterListResponse(chapters: Chapter[]): ChapterResponse[] {
  return chapters.map(toChapterResponse);
}
