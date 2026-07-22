import type { Chapter } from '../models/chapter.js';

export interface ChapterRepository {
  findByNovelAndIndex(novelId: string, chapterIndex: number): Promise<Chapter | null>;
  listByNovelId(novelId: string): Promise<Chapter[]>;
  update(chapter: Chapter): Promise<void>;
}
