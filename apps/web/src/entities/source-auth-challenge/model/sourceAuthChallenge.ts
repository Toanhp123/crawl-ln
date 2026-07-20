import type { SourceReaderAuthChallenge } from '@novel-tool/shared';
export function sourceChallengeExpired(challenge: SourceReaderAuthChallenge, now = Date.now()) {
  return new Date(challenge.expiresAt).getTime() <= now;
}
