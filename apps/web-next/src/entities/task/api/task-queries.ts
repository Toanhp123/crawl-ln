import { useQuery } from '@tanstack/react-query';
import type { ConnectionState } from '../../../shared/realtime';
import { isTaskPolling } from '../model/status';
import { getNovelTask, getTask, getTaskEvents, getTaskSummary, listTasks } from './task-api';
import { taskKeys } from './task-keys';

export type TaskQueryOptions = {
  enabled?: boolean;
  staleTime?: number;
  connectionState?: ConnectionState;
  pollingIntervalMs?: number | false;
  refetchOnWindowFocus?: boolean;
};

function fallbackInterval(options: TaskQueryOptions, shouldPoll: boolean, defaultMs: number) {
  if (!shouldPoll || options.connectionState === 'connected') return false;
  return options.pollingIntervalMs === undefined ? defaultMs : options.pollingIntervalMs;
}

export function useTasks(options: TaskQueryOptions = {}) {
  const enabled = options.enabled ?? true;
  return useQuery({
    queryKey: taskKeys.list(),
    queryFn: ({ signal }) => listTasks(signal),
    enabled,
    staleTime: options.staleTime,
    refetchInterval: fallbackInterval(options, enabled, 15_000),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: options.refetchOnWindowFocus ?? false
  });
}

export function useTask(taskId: string | null | undefined, options: TaskQueryOptions = {}) {
  const enabled = Boolean(taskId) && (options.enabled ?? true);
  return useQuery({
    queryKey: taskKeys.detail(taskId ?? ''),
    queryFn: ({ signal }) => getTask(taskId!, signal),
    enabled,
    staleTime: options.staleTime,
    refetchInterval: (query) =>
      fallbackInterval(options, enabled && isTaskPolling(query.state.data?.status), 10_000),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: options.refetchOnWindowFocus ?? false
  });
}

export function useTaskEvents(taskId: string | null | undefined, options: TaskQueryOptions = {}) {
  const enabled = Boolean(taskId) && (options.enabled ?? true);
  return useQuery({
    queryKey: taskKeys.events(taskId ?? ''),
    queryFn: ({ signal }) => getTaskEvents(taskId!, signal),
    enabled,
    staleTime: options.staleTime,
    refetchInterval: fallbackInterval(options, enabled, 10_000),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: options.refetchOnWindowFocus ?? false
  });
}

export function useTaskSummary(options: TaskQueryOptions = {}) {
  const enabled = options.enabled ?? true;
  return useQuery({
    queryKey: taskKeys.summary(),
    queryFn: ({ signal }) => getTaskSummary(signal),
    enabled,
    staleTime: options.staleTime ?? 10_000,
    refetchInterval: fallbackInterval(options, enabled, 15_000),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: options.refetchOnWindowFocus ?? false
  });
}

export function useNovelTask(novelId: string | null | undefined, options: TaskQueryOptions = {}) {
  const enabled = Boolean(novelId) && (options.enabled ?? true);
  return useQuery({
    queryKey: taskKeys.novel(novelId ?? ''),
    queryFn: ({ signal }) => getNovelTask(novelId!, signal),
    enabled,
    staleTime: options.staleTime,
    refetchInterval: (query) =>
      fallbackInterval(options, enabled && isTaskPolling(query.state.data?.status), 10_000),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: options.refetchOnWindowFocus ?? false
  });
}
