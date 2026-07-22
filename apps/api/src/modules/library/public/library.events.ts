import type { LibraryChapter, LibraryNovel } from '../domain/library.models.js';

export const LIBRARY_ANALYSIS_RECONCILED = 'library.analysis-reconciled' as const;
export const LIBRARY_CHAPTER_CONTENT_SAVED = 'library.chapter-content-saved' as const;
export const LIBRARY_NOVEL_DELETED = 'library.novel-deleted' as const;

export interface LibraryAnalysisReconciledPayload {
  commandId: string;
  novel: LibraryNovel;
  chapters: LibraryChapter[];
}

export interface LibraryChapterContentSavedPayload {
  commandId: string;
  novelTitle: string;
  chapter: LibraryChapter;
}

export interface LibraryNovelDeletedPayload {
  commandId: string;
  novelId: string;
}
