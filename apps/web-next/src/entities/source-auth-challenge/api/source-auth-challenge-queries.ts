import { useQuery } from '@tanstack/react-query';
import type { ConnectionState } from '../../../shared/realtime';
import { getSourceAuthChallenge, listSourceAuthChallenges } from './source-auth-challenge-api';
import { sourceAuthChallengeKeys } from './source-auth-challenge-keys';

export type SourceAuthChallengeQueryOptions = {
  enabled?: boolean;
  staleTime?: number;
  connectionState?: ConnectionState;
  pollingIntervalMs?: number | false;
  refetchOnWindowFocus?: boolean;
};

function fallbackInterval(options: SourceAuthChallengeQueryOptions, enabled: boolean) {
  if (!enabled || options.connectionState === 'connected') return false;
  return options.pollingIntervalMs === undefined ? 5_000 : options.pollingIntervalMs;
}

export function useSourceAuthChallenges(options: SourceAuthChallengeQueryOptions = {}) {
  const enabled = options.enabled ?? true;
  return useQuery({
    queryKey: sourceAuthChallengeKeys.list(),
    queryFn: ({ signal }) => listSourceAuthChallenges(signal),
    enabled,
    staleTime: options.staleTime,
    refetchInterval: fallbackInterval(options, enabled),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: options.refetchOnWindowFocus ?? false
  });
}

export function useSourceAuthChallenge(
  challengeId: string | null | undefined,
  options: SourceAuthChallengeQueryOptions = {}
) {
  const enabled = Boolean(challengeId) && (options.enabled ?? true);
  return useQuery({
    queryKey: sourceAuthChallengeKeys.detail(challengeId ?? ''),
    queryFn: ({ signal }) => getSourceAuthChallenge(challengeId!, signal),
    enabled,
    staleTime: options.staleTime,
    refetchInterval: fallbackInterval(options, enabled),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: options.refetchOnWindowFocus ?? false
  });
}
