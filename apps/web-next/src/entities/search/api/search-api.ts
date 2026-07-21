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
