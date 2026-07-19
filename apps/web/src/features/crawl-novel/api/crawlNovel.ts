import type { CrawlTask } from '@/entities/task/model/types';
import { http } from '@/shared/api/http';

export function crawlNovel(novelId: string) {
  return http<CrawlTask>('/api/crawl/jobs', { method: 'POST', body: JSON.stringify({ novelId }) });
}
