import type { QueryClient } from '@tanstack/react-query';
import { novelKeys } from './novel-keys';

export interface NovelInvalidationApi {
  invalidateAll(client: QueryClient): Promise<unknown>;
  invalidateList(client: QueryClient): Promise<unknown>;
  invalidateDetail(client: QueryClient, novelId: string): Promise<unknown>;
  invalidateStats(client: QueryClient): Promise<unknown>;
}

export const novelInvalidation: NovelInvalidationApi = {
  invalidateAll: (client) => client.invalidateQueries({ queryKey: novelKeys.all }),
  invalidateList: (client) => client.invalidateQueries({ queryKey: novelKeys.lists() }),
  invalidateDetail: (client, id) => client.invalidateQueries({ queryKey: novelKeys.detail(id) }),
  invalidateStats: (client) => client.invalidateQueries({ queryKey: novelKeys.stats() })
};
