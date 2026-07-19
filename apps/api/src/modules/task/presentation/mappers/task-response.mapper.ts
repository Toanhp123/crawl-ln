import type { CrawlTask as CrawlTaskResponse, TaskSummary } from '@novel-tool/shared';
import type { CrawlTask } from '../../domain/entities/task.entity.js';

export function toTaskResponse(task: CrawlTask): CrawlTaskResponse {
  return { ...task };
}

export function toNullableTaskResponse(task: CrawlTask | null): CrawlTaskResponse | null {
  return task ? toTaskResponse(task) : null;
}

export function toTaskListResponse(tasks: CrawlTask[]): CrawlTaskResponse[] {
  return tasks.map(toTaskResponse);
}

export function toTaskSummaryResponse(summary: TaskSummary): TaskSummary {
  return summary;
}
