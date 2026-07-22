import type { Chapter, Novel } from '../models/crawler-contracts.js';
import type { CrawlTask } from '../models/crawler-contracts.js';

export interface CrawlPersistencePort {
  persistStart(task: CrawlTask, novel: Novel): Promise<void>;
  persistChapterResult(chapter: Chapter, task: CrawlTask): Promise<void>;
  persistFinal(task: CrawlTask, novel: Novel): Promise<void>;
}
