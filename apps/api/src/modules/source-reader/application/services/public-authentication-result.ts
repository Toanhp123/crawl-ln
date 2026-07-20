import type { AuthExecutionResult } from '../../domain/auth/authentication.js';
import type { SourceReaderAuthenticationResult } from '../../public/source-reader.api.js';

/** Removes session material before an authentication result crosses the HTTP boundary. */
export function toPublicAuthenticationResult(
  result: AuthExecutionResult
): SourceReaderAuthenticationResult {
  if (result.status === 'authenticated') return { status: 'authenticated' };

  return {
    status: 'challenge-required',
    challenge: {
      id: result.challenge.id,
      type: result.challenge.type,
      expiresAt: result.challenge.expiresAt,
      ...(result.challenge.userInstructions
        ? { userInstructions: result.challenge.userInstructions }
        : {})
    }
  };
}
