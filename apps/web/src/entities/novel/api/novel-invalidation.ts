import type { QueryClient } from '@tanstack/react-query';
import type { QueryInvalidationOptions } from '../../../shared/api';
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
  invalidateAll: (client, options) =>
    client.invalidateQueries({ queryKey: novelKeys.all }, options),
  invalidateList: (client, options) =>
    client.invalidateQueries({ queryKey: novelKeys.lists() }, options),
  invalidateDetail: (client, id, options) =>
    client.invalidateQueries({ queryKey: novelKeys.detail(id) }, options),
  invalidateStats: (client, options) =>
    client.invalidateQueries({ queryKey: novelKeys.stats() }, options)
};
