import type { QueryClient } from '@tanstack/react-query';

export interface CollectionInvalidationApi {
  invalidateAll(client: QueryClient): Promise<unknown>;
}
