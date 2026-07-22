import type { SearchProjectionEvent, SearchRepository } from '../ports/search.repository.js';
import { chapterSearchDocument, novelSearchDocument } from './search-document.factory.js';

export interface SearchAnalysisProjectionPayload {
  novel: { id: string; title: string; sourceName: string };
  chapters: Array<{
    id: string;
    novelId: string;
    index: number;
    title: string;
    rawText?: string;
    cleanText?: string;
    status: 'pending' | 'fetched' | 'failed';
    sourceAvailable: boolean;
  }>;
}

export interface SearchChapterProjectionPayload {
  novelTitle: string;
  chapter: SearchAnalysisProjectionPayload['chapters'][number];
}

export interface SearchDeletionProjectionPayload {
  novelId: string;
}

export class LibrarySearchProjectionService {
  constructor(private readonly repository: SearchRepository) {}

  projectAnalysis(
    event: SearchProjectionEvent,
    payload: SearchAnalysisProjectionPayload
  ): Promise<boolean> {
    return this.repository.replaceNovelForEvent(event, payload.novel.id, [
      novelSearchDocument(payload.novel),
      ...payload.chapters
        .filter((chapter) => chapter.sourceAvailable)
        .map((chapter) => chapterSearchDocument(chapter, payload.novel.title))
    ]);
  }

  projectChapter(
    event: SearchProjectionEvent,
    payload: SearchChapterProjectionPayload
  ): Promise<boolean> {
    return this.repository.replaceChapterForEvent(
      event,
      chapterSearchDocument(payload.chapter, payload.novelTitle)
    );
  }

  projectDeletion(
    event: SearchProjectionEvent,
    payload: SearchDeletionProjectionPayload
  ): Promise<boolean> {
    return this.repository.deleteNovelForEvent(event, payload.novelId);
  }
}
