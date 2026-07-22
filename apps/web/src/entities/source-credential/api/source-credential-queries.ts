import { useQuery } from '@tanstack/react-query';
import { listSourceCredentials } from './source-credential-api';
import { sourceCredentialKeys } from './source-credential-keys';

export type SourceCredentialQueryOptions = {
  enabled?: boolean;
  staleTime?: number;
  refetchOnWindowFocus?: boolean;
};

export function useSourceCredentials(options: SourceCredentialQueryOptions = {}) {
  return useQuery({
    queryKey: sourceCredentialKeys.list(),
    queryFn: ({ signal }) => listSourceCredentials(signal),
    enabled: options.enabled ?? true,
    staleTime: options.staleTime ?? 30_000,
    refetchOnWindowFocus: options.refetchOnWindowFocus ?? false
  });
}
