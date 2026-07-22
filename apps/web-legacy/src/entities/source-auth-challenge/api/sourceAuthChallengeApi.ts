import type {
  SourceReaderAuthChallenge,
  SourceReaderAuthChallengeResponse,
  SourceReaderAuthenticationResult
} from '@novel-tool/shared';
import { useQuery } from '@tanstack/react-query';
import { http, httpVoid } from '@/shared/api/http';
import { queryKeys } from '@/shared/api/queryKeys';
export const listSourceAuthChallenges = (signal?: AbortSignal) =>
  http<SourceReaderAuthChallenge[]>('/api/source-reader/auth/challenges', { signal });
export const getSourceAuthChallenge = (id: string, signal?: AbortSignal) =>
  http<SourceReaderAuthChallenge>(`/api/source-reader/auth/challenges/${encodeURIComponent(id)}`, {
    signal
  });
export const respondSourceAuthChallenge = (
  id: string,
  response: SourceReaderAuthChallengeResponse
) =>
  http<SourceReaderAuthenticationResult>(
    `/api/source-reader/auth/challenges/${encodeURIComponent(id)}/respond`,
    { method: 'POST', body: JSON.stringify({ response }) }
  );
export const cancelSourceAuthChallenge = (id: string) =>
  httpVoid(`/api/source-reader/auth/challenges/${encodeURIComponent(id)}/cancel`, {
    method: 'POST'
  });
export function useSourceAuthChallengesQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.sourceReader.challenges(),
    queryFn: ({ signal }) => listSourceAuthChallenges(signal),
    enabled,
    refetchInterval: enabled ? 5000 : false
  });
}
export function useSourceAuthChallengeQuery(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.sourceReader.challenge(id ?? ''),
    queryFn: ({ signal }) => getSourceAuthChallenge(id!, signal),
    enabled: Boolean(id)
  });
}
