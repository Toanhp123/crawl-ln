import { useMemo } from 'react';
import { useTasks, type CrawlTask } from '@/entities/task';
import { useConnectionStatus } from '@/shared/realtime';

export function groupActivityTasks(tasks: readonly CrawlTask[]) {
  const sorted = [...tasks].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  return {
    running: sorted.filter((task) =>
      ['running', 'pausing', 'paused', 'resuming'].includes(task.status)
    ),
    queued: sorted.filter((task) => task.status === 'queued'),
    recent: sorted.filter((task) => ['completed', 'failed', 'cancelled'].includes(task.status))
  };
}

export function useActivityPage() {
  const connectionState = useConnectionStatus();
  const tasks = useTasks({ connectionState, pollingIntervalMs: 15_000 });
  const groups = useMemo(() => groupActivityTasks(tasks.data ?? []), [tasks.data]);
  return { tasks, connectionState, ...groups };
}
