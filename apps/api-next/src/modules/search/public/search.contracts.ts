import type { SearchQuery, SearchResultPage } from '../domain/search.models.js';

export interface SearchCommands {
  rebuild(): Promise<{ indexedDocuments: number }>;
}

export interface SearchQueries {
  search(query: SearchQuery): Promise<SearchResultPage>;
}
