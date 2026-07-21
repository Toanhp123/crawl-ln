import { useQuery } from '@tanstack/react-query';
import { listSourceNetworkProfiles } from './source-network-profile-api';
import { sourceNetworkProfileKeys } from './source-network-profile-keys';

export type SourceNetworkProfileQueryOptions = {
  enabled?: boolean;
  staleTime?: number;
  refetchOnWindowFocus?: boolean;
};

export function useSourceNetworkProfiles(options: SourceNetworkProfileQueryOptions = {}) {
  return useQuery({
    queryKey: sourceNetworkProfileKeys.list(),
    queryFn: ({ signal }) => listSourceNetworkProfiles(signal),
    enabled: options.enabled ?? true,
    staleTime: options.staleTime ?? 30_000,
    refetchOnWindowFocus: options.refetchOnWindowFocus ?? false
  });
}
