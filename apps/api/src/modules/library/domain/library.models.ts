export type LibraryNovelStatus = 'analyzed' | 'crawling' | 'completed' | 'failed';
export type LibraryChapterStatus = 'pending' | 'fetched' | 'failed';

export interface LibraryNovel {
  id: string;
  title: string;
  sourceUrl: string;
  sourceName: string;
  author?: string;
  coverUrl?: string;
  status: LibraryNovelStatus;
  createdAt: string;
  updatedAt: string;
  chapterCount?: number;
  fetchedChapterCount?: number;
  failedChapterCount?: number;
  firstChapterIndex?: number;
}

export interface LibraryChapter {
  id: string;
  novelId: string;
  index: number;
  title: string;
  sourceUrl: string;
  rawText?: string;
  cleanText?: string;
  status: LibraryChapterStatus;
  errorMessage?: string;
  sourceAvailable: boolean;
  contentVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface LibraryNovelDetail {
  novel: LibraryNovel;
  chapters: LibraryChapter[];
}

export interface PaginatedLibraryNovels {
  items: LibraryNovel[];
  total: number;
  limit: number;
  offset: number;
}

export interface LibraryStats {
  novels: number;
  analyzed: number;
  crawling: number;
  completed: number;
  failed: number;
}
