import { useMemo } from 'react';
import { useTasks } from '@/entities/task/model/useTasks';

export function useActivityPage() {
  const tasks = useTasks();
  const groups = useMemo(() => {
    const sorted = [...(tasks.data ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return {
      running: sorted.filter((task) =>
        ['running', 'pausing', 'paused', 'resuming'].includes(task.status)
      ),
      queued: sorted.filter((task) => task.status === 'queued'),
      recent: sorted.filter((task) => ['completed', 'failed', 'cancelled'].includes(task.status))
    };
  }, [tasks.data]);
  return { tasks, ...groups };
}
