import { useQuery } from '@tanstack/react-query';
import { getTaskSummary } from '../api/taskApi';
import { queryKeys } from '@/shared/api/queryKeys';
import { getRealtimePollingInterval, useRealtimeStatus } from '@/shared/realtime';

export function useTaskSummary() {
  const realtimeStatus = useRealtimeStatus();
  return useQuery({
    queryKey: queryKeys.taskSummary,
    queryFn: ({ signal }) => getTaskSummary(signal),
    staleTime: 10_000,
    refetchInterval: () => getRealtimePollingInterval(realtimeStatus, true, 15_000),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false
  });
}
