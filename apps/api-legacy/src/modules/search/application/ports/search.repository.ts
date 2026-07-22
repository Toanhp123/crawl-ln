import type { SearchQuery, SearchResultPage } from '../../domain/search.js';
export interface SearchRepository {
  search(query: SearchQuery): Promise<SearchResultPage>;
  rebuild(): Promise<number>;
}
