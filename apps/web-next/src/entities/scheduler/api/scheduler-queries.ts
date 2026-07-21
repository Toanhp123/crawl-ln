import { useQuery } from '@tanstack/react-query';
import type { ConnectionState } from '../../../shared/realtime';
import { getNovelUpdateDiagnostics, getSchedulerStatus } from './scheduler-api';
import { schedulerKeys } from './scheduler-keys';

export type SchedulerQueryOptions = {
  enabled?: boolean;
  staleTime?: number;
  connectionState?: ConnectionState;
  pollingIntervalMs?: number | false;
  refetchOnWindowFocus?: boolean;
};

function fallbackInterval(options: SchedulerQueryOptions, enabled: boolean) {
  if (!enabled || options.connectionState === 'connected') return false;
  return options.pollingIntervalMs === undefined ? 15_000 : options.pollingIntervalMs;
}

export function useSchedulerStatus(options: SchedulerQueryOptions = {}) {
  const enabled = options.enabled ?? true;
  return useQuery({
    queryKey: schedulerKeys.status(),
    queryFn: ({ signal }) => getSchedulerStatus(signal),
    enabled,
    staleTime: options.staleTime,
    refetchInterval: fallbackInterval(options, enabled),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: options.refetchOnWindowFocus ?? false
  });
}

export function useNovelUpdateDiagnostics(
  novelId: string | null | undefined,
  options: SchedulerQueryOptions = {}
) {
  const enabled = Boolean(novelId) && (options.enabled ?? true);
  return useQuery({
    queryKey: schedulerKeys.diagnostics(novelId ?? ''),
    queryFn: ({ signal }) => getNovelUpdateDiagnostics(novelId!, signal),
    enabled,
    staleTime: options.staleTime,
    refetchInterval: fallbackInterval(options, enabled),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: options.refetchOnWindowFocus ?? false
  });
}
