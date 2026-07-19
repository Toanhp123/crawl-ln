import type { Chapter, Novel } from '../models/novel-application.js';

export interface NovelAnalysisPersistencePort {
  persist(novel: Novel, chapters: Chapter[]): Promise<void>;
}
