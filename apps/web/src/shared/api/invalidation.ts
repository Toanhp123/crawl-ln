import type { InvalidateOptions, InvalidateQueryFilters, QueryClient } from '@tanstack/react-query';

export interface QueryInvalidationOptions extends InvalidateOptions {
  cancelInFlight?: boolean;
}

export async function invalidateQuery(
  client: QueryClient,
  filters?: InvalidateQueryFilters,
  options?: QueryInvalidationOptions
): Promise<void> {
  const { cancelInFlight = false, ...invalidateOptions } = options ?? {};
  if (cancelInFlight) await client.cancelQueries(filters);
  await client.invalidateQueries(filters, invalidateOptions);
}

export interface CollectionInvalidationApi {
  invalidateAll(client: QueryClient, options?: QueryInvalidationOptions): Promise<unknown>;
}
