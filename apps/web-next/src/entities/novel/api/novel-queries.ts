import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ConnectionState } from '../../../shared/realtime';
import { getNovel, getNovelStats, listNovels, type ListNovelsOptions } from './novel-api';
import { novelKeys } from './novel-keys';

export type NovelQueryOptions = {
  enabled?: boolean;
  staleTime?: number;
  connectionState?: ConnectionState;
  pollingIntervalMs?: number | false;
  refetchOnWindowFocus?: boolean;
};

function fallbackInterval(options: NovelQueryOptions, enabled: boolean, defaultMs: number) {
  if (!enabled || options.connectionState === 'connected') return false;
  return options.pollingIntervalMs === undefined ? defaultMs : options.pollingIntervalMs;
}

export function useNovels(input: ListNovelsOptions = {}, options: NovelQueryOptions = {}) {
  const enabled = options.enabled ?? true;
  return useQuery({
    queryKey: novelKeys.list(input),
    queryFn: ({ signal }) => listNovels(input, signal),
    enabled,
    staleTime: options.staleTime ?? 30_000,
    placeholderData: keepPreviousData,
    refetchInterval: fallbackInterval(options, enabled, 15_000),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: options.refetchOnWindowFocus ?? false
  });
}

export function useNovel(novelId: string | null | undefined, options: NovelQueryOptions = {}) {
  const enabled = Boolean(novelId) && (options.enabled ?? true);
  return useQuery({
    queryKey: novelKeys.detail(novelId ?? ''),
    queryFn: ({ signal }) => getNovel(novelId!, signal),
    enabled,
    staleTime: options.staleTime ?? 15_000,
    refetchInterval: fallbackInterval(options, enabled, 15_000),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: options.refetchOnWindowFocus ?? false
  });
}

export function useNovelStats(options: NovelQueryOptions = {}) {
  const enabled = options.enabled ?? true;
  return useQuery({
    queryKey: novelKeys.stats(),
    queryFn: ({ signal }) => getNovelStats(signal),
    enabled,
    staleTime: options.staleTime ?? 15_000,
    refetchInterval: fallbackInterval(options, enabled, 15_000),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: options.refetchOnWindowFocus ?? false
  });
}
