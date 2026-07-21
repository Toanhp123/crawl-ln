import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { searchLibrary, type LibrarySearchInput } from './search-api';
import { searchKeys } from './search-keys';

export type SearchQueryOptions = {
  enabled?: boolean;
  staleTime?: number;
  refetchOnWindowFocus?: boolean;
};

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
