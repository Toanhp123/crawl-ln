import type { Chapter } from '../models/novel-application.js';

export interface NovelChapterPort {
  listByNovelId(novelId: string): Promise<Chapter[]>;
}
