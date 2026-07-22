import type { Chapter, Novel, NovelDetail } from '../models/crawler-contracts.js';
export interface CrawlerNovelPort {
  findById(id: string): Promise<NovelDetail | null>;
  markCrawling(novel: Novel, now: string): Novel;
  markCompleted(novel: Novel, now: string): Novel;
  markFailed(novel: Novel, now: string): Novel;
}
