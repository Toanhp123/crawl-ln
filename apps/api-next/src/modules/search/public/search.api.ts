import type { SearchCommands, SearchQueries } from './search.contracts.js';

export interface SearchApi {
  commands: SearchCommands;
  queries: SearchQueries;
}

export type { SearchCommands, SearchQueries } from './search.contracts.js';
export type {
  SearchDocumentType,
  SearchQuery,
  SearchResultItem,
  SearchResultPage
} from '../domain/search.models.js';
