import type { Chapter } from '../domain/models/chapter.js';

export interface ChapterCatalogApi {
  findByNovelAndIndex(novelId: string, chapterIndex: number): Promise<Chapter | null>;
  listByNovelId(novelId: string): Promise<Chapter[]>;
}

export interface ChaptersApi {
  readonly catalog: ChapterCatalogApi;
}
