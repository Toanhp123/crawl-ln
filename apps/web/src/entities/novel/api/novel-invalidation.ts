import type { QueryClient } from '@tanstack/react-query';
import { invalidateQuery, type QueryInvalidationOptions } from '../../../shared/api';
import { novelKeys } from './novel-keys';

export interface NovelInvalidationApi {
  invalidateAll(client: QueryClient, options?: QueryInvalidationOptions): Promise<unknown>;
  invalidateList(client: QueryClient, options?: QueryInvalidationOptions): Promise<unknown>;
  invalidateDetail(
    client: QueryClient,
    novelId: string,
    options?: QueryInvalidationOptions
  ): Promise<unknown>;
  invalidateStats(client: QueryClient, options?: QueryInvalidationOptions): Promise<unknown>;
}

export const novelInvalidation: NovelInvalidationApi = {
  invalidateAll: (client, options) => invalidateQuery(client, { queryKey: novelKeys.all }, options),
  invalidateList: (client, options) =>
    invalidateQuery(client, { queryKey: novelKeys.lists() }, options),
  invalidateDetail: (client, id, options) =>
    invalidateQuery(client, { queryKey: novelKeys.detail(id) }, options),
  invalidateStats: (client, options) =>
    invalidateQuery(client, { queryKey: novelKeys.stats() }, options)
};
