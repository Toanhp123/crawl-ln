import type {
  CrawlEvent as CrawlEventTransport,
  CrawlTask as CrawlTaskTransport,
  TaskStatus as TaskStatusTransport,
  TaskSummary as TaskSummaryTransport
} from '@novel-tool/shared';
import { http } from '../../../shared/api';

export type CrawlEvent = CrawlEventTransport;
export type CrawlTask = CrawlTaskTransport;
export type TaskStatus = TaskStatusTransport;
export type TaskSummary = TaskSummaryTransport;

export function listTasks(signal?: AbortSignal) {
  return http<CrawlTask[]>('/api/tasks', { signal });
}

export function getTaskSummary(signal?: AbortSignal) {
  return http<TaskSummary>('/api/tasks/summary', { signal });
}

export function getTask(id: string, signal?: AbortSignal) {
  return http<CrawlTask>(`/api/tasks/${encodeURIComponent(id)}`, { signal });
}

export function getNovelTask(novelId: string, signal?: AbortSignal) {
  return http<CrawlTask | null>(`/api/novels/${encodeURIComponent(novelId)}/task`, { signal });
}

export function getTaskEvents(id: string, signal?: AbortSignal) {
  return http<CrawlEvent[]>(`/api/crawl/jobs/${encodeURIComponent(id)}/events?limit=100`, {
    signal
  });
}
