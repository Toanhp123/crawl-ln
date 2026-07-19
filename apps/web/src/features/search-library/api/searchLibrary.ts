import type { SearchDocumentType, SearchResultPage } from '@novel-tool/shared';
import { http } from '@/shared/api/http';

export function searchLibrary(
  input: {
    q: string;
    type: SearchDocumentType;
    novelId?: string;
    limit?: number;
    offset?: number;
  },
  signal?: AbortSignal
) {
  const query = new URLSearchParams({
    q: input.q,
    type: input.type,
    limit: String(input.limit ?? 20),
    offset: String(input.offset ?? 0)
  });
  if (input.novelId) query.set('novelId', input.novelId);
  return http<SearchResultPage>(`/api/search?${query.toString()}`, { signal });
}

export function rebuildSearchIndex() {
  return http<{ indexedDocuments: number }>('/api/search/rebuild', { method: 'POST' });
}
