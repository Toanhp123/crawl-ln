import type { RealtimeEvent, RealtimeResource } from '@novel-tool/shared';
import { queryKeys } from '../api/queryKeys';

export type RealtimeStatus = 'connecting' | 'connected' | 'disconnected';

type InvalidateFilters = { queryKey?: readonly unknown[]; type?: 'active' };
type QueryInvalidator = {
  invalidateQueries(filters?: InvalidateFilters): Promise<unknown>;
};

type PendingInvalidations = {
  resources: Set<RealtimeResource>;
  taskIds: Set<string>;
  novelIds: Set<string>;
};

export function getRealtimePollingInterval(
  status: RealtimeStatus,
  shouldPoll: boolean,
  fallbackMs: number
): number | false {
  if (!shouldPoll || status === 'connected') return false;
  return fallbackMs;
}

export function isRealtimeEvent(value: unknown): value is RealtimeEvent {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<RealtimeEvent>;
  return (
    typeof candidate.id === 'string' &&
    candidate.type === 'data.changed' &&
    Array.isArray(candidate.resources) &&
    candidate.resources.every((resource) =>
      ['novels', 'tasks', 'scheduler', 'plugins', 'search', 'all'].includes(resource)
    ) &&
    typeof candidate.reason === 'string' &&
    typeof candidate.occurredAt === 'string'
  );
}

export function createRealtimeInvalidationQueue(
  queryClient: QueryInvalidator,
  options: { batchWindowMs?: number } = {}
) {
  const batchWindowMs = options.batchWindowMs ?? 150;
  const pending: PendingInvalidations = {
    resources: new Set(),
    taskIds: new Set(),
    novelIds: new Set()
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;

  const flush = async () => {
    timer = undefined;
    if (disposed || pending.resources.size === 0) return;
    const resources = new Set(pending.resources);
    const taskIds = [...pending.taskIds];
    const novelIds = [...pending.novelIds];
    pending.resources.clear();
    pending.taskIds.clear();
    pending.novelIds.clear();

    if (resources.has('all')) {
      await queryClient.invalidateQueries();
      return;
    }

    const keys: Array<readonly unknown[]> = [];
    const add = (key: readonly unknown[]) => {
      const serialized = JSON.stringify(key);
      if (!keys.some((current) => JSON.stringify(current) === serialized)) keys.push(key);
    };

    if (resources.has('tasks')) {
      add(queryKeys.tasks);
      add(queryKeys.taskSummary);
      for (const taskId of taskIds) {
        add(queryKeys.task(taskId));
        add(queryKeys.taskEvents(taskId));
      }
      for (const novelId of novelIds) add(queryKeys.novelTask(novelId));
    }

    if (resources.has('novels')) {
      add(['novels', 'list']);
      add(queryKeys.novelStats);
      if (novelIds.length) {
        for (const novelId of novelIds) add(queryKeys.novel(novelId));
      } else {
        add(queryKeys.novelsRoot);
      }
    }

    if (resources.has('scheduler')) {
      add(queryKeys.schedulerStatus);
      for (const novelId of novelIds) add(queryKeys.novelUpdateDiagnostics(novelId));
    }

    if (resources.has('plugins')) add(queryKeys.sourceReader.plugins());
    if (resources.has('search')) add(['search']);

    await Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
  };

  const enqueue = (event: RealtimeEvent) => {
    if (disposed) return;
    for (const resource of event.resources) pending.resources.add(resource);
    if (event.taskId) pending.taskIds.add(event.taskId);
    if (event.novelId) pending.novelIds.add(event.novelId);
    if (timer) return;
    timer = setTimeout(() => void flush(), batchWindowMs);
  };

  const dispose = () => {
    disposed = true;
    if (timer) clearTimeout(timer);
    timer = undefined;
    pending.resources.clear();
    pending.taskIds.clear();
    pending.novelIds.clear();
  };

  return { enqueue, flush, dispose };
}
