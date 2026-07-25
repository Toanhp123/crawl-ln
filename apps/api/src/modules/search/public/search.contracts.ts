import type {
  SearchIndexRebuildResult,
  SearchIndexStatus,
  SearchQuery,
  SearchResultPage
} from '../domain/search.models.js';

export interface SearchCommands {
  rebuild(): Promise<SearchIndexRebuildResult>;
}

export interface SearchQueries {
  search(query: SearchQuery): Promise<SearchResultPage>;
  status(): Promise<SearchIndexStatus>;
}
