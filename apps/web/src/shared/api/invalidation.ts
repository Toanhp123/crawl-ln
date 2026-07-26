import type { InvalidateOptions, QueryClient } from '@tanstack/react-query';

export type QueryInvalidationOptions = InvalidateOptions;

export interface CollectionInvalidationApi {
  invalidateAll(client: QueryClient, options?: QueryInvalidationOptions): Promise<unknown>;
}
