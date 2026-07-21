import type { SourceReaderAuthChallenge } from '@novel-tool/shared';
import { http } from '../../../shared/api';

export type SourceAuthChallenge = SourceReaderAuthChallenge;

export function listSourceAuthChallenges(signal?: AbortSignal): Promise<SourceAuthChallenge[]> {
  return http<SourceAuthChallenge[]>('/api/source-reader/auth/challenges', { signal });
}

export function getSourceAuthChallenge(
  challengeId: string,
  signal?: AbortSignal
): Promise<SourceAuthChallenge> {
  return http<SourceAuthChallenge>(
    `/api/source-reader/auth/challenges/${encodeURIComponent(challengeId)}`,
    { signal }
  );
}
