import type { CrawlTask } from '../../../entities/task';
import { http } from '../../../shared/api';

export function pauseTask(taskId: string): Promise<CrawlTask> {
  return http<CrawlTask>(`/api/crawl/jobs/${encodeURIComponent(taskId)}/pause`, {
    method: 'POST'
  });
}
