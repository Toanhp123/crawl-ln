import type { CrawlTask, TaskStatus } from './types';

const ACTIVE_TASK_STATUSES: ReadonlySet<TaskStatus> = new Set([
  'queued',
  'running',
  'pausing',
  'paused',
  'resuming'
]);

const POLLING_TASK_STATUSES: ReadonlySet<TaskStatus> = new Set([
  'queued',
  'running',
  'pausing',
  'resuming'
]);

export type TaskIndicator = 'queued' | 'loading' | 'paused' | 'completed' | 'failed' | 'cancelled';

const TASK_INDICATORS: Record<TaskStatus, TaskIndicator> = {
  queued: 'queued',
  running: 'loading',
  pausing: 'loading',
  paused: 'paused',
  resuming: 'loading',
  completed: 'completed',
  failed: 'failed',
  cancelled: 'cancelled'
};

export function isTaskActive(status: TaskStatus): boolean {
  return ACTIVE_TASK_STATUSES.has(status);
}

export function isTaskPolling(status: TaskStatus | undefined): boolean {
  return status ? POLLING_TASK_STATUSES.has(status) : false;
}

export function taskIndicator(status: TaskStatus): TaskIndicator {
  return TASK_INDICATORS[status];
}

export function selectLatestActiveTask(tasks: readonly CrawlTask[]): CrawlTask | undefined {
  return tasks
    .filter((task) => isTaskActive(task.status))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
}
