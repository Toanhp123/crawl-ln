import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ConnectionState } from '../../../shared/realtime';
import {
  getSearchIndexStatus,
  searchLibrary,
  type LibrarySearchInput,
  type SearchIndexStatus
} from './search-api';
import { searchKeys } from './search-keys';

export type SearchQueryOptions = {
  enabled?: boolean;
  staleTime?: number;
  refetchOnWindowFocus?: boolean;
};

export type SearchIndexStatusQueryOptions = SearchQueryOptions & {
  connectionState?: ConnectionState;
};

export function searchIndexFallbackInterval(
  connectionState: ConnectionState | undefined,
  status: SearchIndexStatus | undefined,
  enabled: boolean
): number | false {
  if (!enabled || connectionState === 'connected') return false;
  return status?.rebuildRunning ? 1_000 : 15_000;
}

export function useLibrarySearch(input: LibrarySearchInput, options: SearchQueryOptions = {}) {
  const normalized = { ...input, q: input.q.trim() };
  const enabled = normalized.q.length > 0 && (options.enabled ?? true);
  return useQuery({
    queryKey: searchKeys.results(normalized),
    queryFn: ({ signal }) => searchLibrary(normalized, signal),
    enabled,
    staleTime: options.staleTime,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: options.refetchOnWindowFocus ?? false
  });
}

export function useSearchIndexStatus(options: SearchIndexStatusQueryOptions = {}) {
  const enabled = options.enabled ?? true;
  return useQuery({
    queryKey: searchKeys.status(),
    queryFn: ({ signal }) => getSearchIndexStatus(signal),
    enabled,
    staleTime: options.staleTime,
    refetchInterval: (query) =>
      searchIndexFallbackInterval(options.connectionState, query.state.data, enabled),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: options.refetchOnWindowFocus ?? false
  });
}
