import type { QueryClient } from '@tanstack/react-query';
import { invalidateQuery, type QueryInvalidationOptions } from '../../../shared/api';
import { searchKeys } from './search-keys';

export interface SearchInvalidationApi {
  invalidateAll(client: QueryClient, options?: QueryInvalidationOptions): Promise<unknown>;
  invalidateResults(client: QueryClient, options?: QueryInvalidationOptions): Promise<unknown>;
}

export const searchInvalidation: SearchInvalidationApi = {
  invalidateAll: (client, options) =>
    invalidateQuery(client, { queryKey: searchKeys.all }, options),
  invalidateResults: (client, options) =>
    invalidateQuery(client, { queryKey: searchKeys.resultsRoot() }, options)
};
