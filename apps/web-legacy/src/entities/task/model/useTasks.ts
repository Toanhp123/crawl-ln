import { useQuery } from '@tanstack/react-query';
import { listTasks } from '../api/taskApi';
import { queryKeys } from '@/shared/api/queryKeys';
import { getRealtimePollingInterval, useRealtimeStatus } from '@/shared/realtime';

export function useTasks(options: { enabled?: boolean; refetchOnWindowFocus?: boolean } = {}) {
  const realtimeStatus = useRealtimeStatus();
  const enabled = options.enabled ?? true;
  return useQuery({
    queryKey: queryKeys.tasks,
    queryFn: ({ signal }) => listTasks(signal),
    enabled,
    refetchInterval: () => getRealtimePollingInterval(realtimeStatus, enabled, 15_000),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: options.refetchOnWindowFocus ?? false
  });
}
