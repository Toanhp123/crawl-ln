import type { CrawlTask } from '../models/novel-application.js';

export interface CrawlJobCreatorPort {
  execute(novelId: string): Promise<CrawlTask>;
}
