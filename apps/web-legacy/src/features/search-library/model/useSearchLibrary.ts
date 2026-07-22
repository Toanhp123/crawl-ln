import { useQuery } from '@tanstack/react-query';
import type { SearchDocumentType } from '@novel-tool/shared';
import { searchLibrary } from '../api/searchLibrary';
import { queryKeys } from '@/shared/api/queryKeys';
export function useSearchLibrary(query: string, type: SearchDocumentType, offset: number) {
  const q = query.trim();
  return useQuery({
    queryKey: queryKeys.search(q, type, offset),
    queryFn: ({ signal }) => searchLibrary({ q, type, offset, limit: 20 }, signal),
    enabled: q.length > 0,
    placeholderData: (p) => p
  });
}
