import type { CrawlTask } from '../../../entities/task';
import { http } from '../../../shared/api';

export function crawlNovel(novelId: string): Promise<CrawlTask> {
  return http<CrawlTask>('/api/crawl/jobs', {
    method: 'POST',
    body: JSON.stringify({ novelId })
  });
}
