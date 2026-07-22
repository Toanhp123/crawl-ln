import type { LibraryNovelStatus } from './library.models.js';

export interface ReconcileAnalysisCommand {
  commandId: string;
  analyzedAt: string;
  novel: {
    id: string;
    title: string;
    sourceUrl: string;
    sourceName: string;
    author?: string;
    coverUrl?: string;
  };
  chapters: Array<{ id: string; index: number; title: string; sourceUrl: string }>;
}

export interface SaveChapterContentCommand {
  commandId: string;
  novelId: string;
  chapterId: string;
  title: string;
  rawText: string;
  cleanText: string;
  savedAt: string;
}

export interface SetLibraryIngestionStateCommand {
  commandId: string;
  novelId: string;
  status: LibraryNovelStatus;
  updatedAt: string;
  errorMessage?: string;
}

export interface DeleteLibraryNovelCommand {
  commandId: string;
  novelId: string;
  deletedAt: string;
}

export interface ListLibraryNovelsQuery {
  q?: string;
  status?: 'all' | 'active' | LibraryNovelStatus;
  sort?: 'recent' | 'created' | 'title' | 'chapters';
  limit: number;
  offset: number;
  ids?: string[];
  excludeIds?: string[];
  readingOrder?: string[];
}
