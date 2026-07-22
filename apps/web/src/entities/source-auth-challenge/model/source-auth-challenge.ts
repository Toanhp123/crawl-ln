import type { SourceAuthChallenge } from './types';

export function sourceChallengeExpired(challenge: SourceAuthChallenge, now = Date.now()): boolean {
  return new Date(challenge.expiresAt).getTime() <= now;
}
