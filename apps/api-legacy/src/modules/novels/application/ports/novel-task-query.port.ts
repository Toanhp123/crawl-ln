import type { CrawlTask } from '../models/novel-application.js';

export interface NovelTaskQueryPort {
  execute(novelId: string): Promise<CrawlTask | null>;
}
