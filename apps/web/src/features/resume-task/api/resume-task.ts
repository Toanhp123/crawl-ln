import type { CrawlTask } from '../../../entities/task';
import { http } from '../../../shared/api';

export function resumeTask(taskId: string): Promise<CrawlTask> {
  return http<CrawlTask>(`/api/crawl/jobs/${encodeURIComponent(taskId)}/resume`, {
    method: 'POST'
  });
}
