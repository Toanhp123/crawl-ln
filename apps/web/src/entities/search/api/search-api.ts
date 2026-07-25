import type {
  SearchDocumentType as SearchDocumentTypeTransport,
  SearchResultItem as SearchResultItemTransport,
  SearchResultPage as SearchResultPageTransport
} from '@novel-tool/shared';
import { http } from '../../../shared/api';

export type SearchDocumentType = SearchDocumentTypeTransport;
export type SearchResultItem = SearchResultItemTransport;
export type SearchResultPage = SearchResultPageTransport;

export type LibrarySearchInput = {
  q: string;
  type: SearchDocumentType;
  novelId?: string;
  limit?: number;
  offset?: number;
};

export interface SearchIndexStatus {
  rebuildRunning: boolean;
  indexedDocuments: number;
  lastRebuiltAt: string | null;
  lastIndexedDocuments: number | null;
}

export function searchLibrary(input: LibrarySearchInput, signal?: AbortSignal) {
  const query = new URLSearchParams({
    q: input.q,
    type: input.type,
    limit: String(input.limit ?? 20),
    offset: String(input.offset ?? 0)
  });
  if (input.novelId) query.set('novelId', input.novelId);
  return http<SearchResultPage>(`/api/search?${query.toString()}`, { signal });
}

export function getSearchIndexStatus(signal?: AbortSignal) {
  return http<SearchIndexStatus>('/api/search/status', { signal });
}
