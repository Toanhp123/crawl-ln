import type { CrawlEvent, CrawlTask, TaskSummary } from '../model/types';
import { http } from '@/shared/api/http';

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

export function pauseTask(id: string) {
  return http<CrawlTask>(`/api/crawl/jobs/${encodeURIComponent(id)}/pause`, { method: 'POST' });
}

export function resumeTask(id: string) {
  return http<CrawlTask>(`/api/crawl/jobs/${encodeURIComponent(id)}/resume`, { method: 'POST' });
}

export function cancelTask(id: string) {
  return http<CrawlTask>(`/api/crawl/jobs/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
