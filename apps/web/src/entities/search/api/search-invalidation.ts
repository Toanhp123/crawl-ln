import type { QueryClient } from '@tanstack/react-query';
import { searchKeys } from './search-keys';

export interface SearchInvalidationApi {
  invalidateAll(client: QueryClient): Promise<unknown>;
  invalidateResults(client: QueryClient): Promise<unknown>;
}

export const searchInvalidation: SearchInvalidationApi = {
  invalidateAll: (client) => client.invalidateQueries({ queryKey: searchKeys.all }),
  invalidateResults: (client) => client.invalidateQueries({ queryKey: searchKeys.resultsRoot() })
};
