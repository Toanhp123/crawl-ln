import type {
  SourceReaderAuthChallengeResponse,
  SourceReaderAuthenticationResult
} from '@novel-tool/shared';
import { http, httpVoid } from '../../../shared/api';
export function respondSourceAuthChallenge(
  challengeId: string,
  response: SourceReaderAuthChallengeResponse
) {
  return http<SourceReaderAuthenticationResult>(
    `/api/source-reader/auth/challenges/${encodeURIComponent(challengeId)}/respond`,
    { method: 'POST', body: JSON.stringify({ response }) }
  );
}
export function cancelSourceAuthChallenge(challengeId: string) {
  return httpVoid(`/api/source-reader/auth/challenges/${encodeURIComponent(challengeId)}/cancel`, {
    method: 'POST'
  });
}
