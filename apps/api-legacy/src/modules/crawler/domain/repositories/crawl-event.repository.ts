import type { CrawlEvent } from '../events/crawl-event.entity.js';
export interface CrawlEventRepository {
  create(event: CrawlEvent): Promise<void>;
  findByTaskId(taskId: string, limit?: number): Promise<CrawlEvent[]>;
}
