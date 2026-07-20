import type {
  AuthChallengeHandle,
  AuthChallengeRepository
} from '../../ports/auth-challenge.repository.js';
import type { SourceReaderActor } from '../../ports/source-reader-actor.port.js';
import type { SourceReaderAuthorizationPolicy } from '../../policies/source-reader-authorization.policy.js';
import type { AuthChallengeService } from '../../services/auth-challenge.service.js';
import { SourceReaderError } from '../../../domain/errors/source-reader.error.js';

export interface AuthChallengeAdministrationRepository extends AuthChallengeRepository {
  listPending(ownerId?: string): Promise<AuthChallengeHandle[]>;
  findById(id: string): Promise<AuthChallengeHandle | undefined>;
}

function assertOwner(actor: SourceReaderActor, challenge: AuthChallengeHandle): void {
  if (challenge.ownerId !== actor.id) {
    throw new SourceReaderError('PLUGIN_PERMISSION_DENIED', 'Challenge belongs to another user', {
      retryable: false,
      fallbackAllowed: false
    });
  }
}

export class ListAuthChallengesUseCase {
  constructor(
    private readonly authorization: SourceReaderAuthorizationPolicy,
    private readonly challenges: Pick<AuthChallengeAdministrationRepository, 'listPending'>
  ) {}
  execute(input: { actor: SourceReaderActor }) {
    this.authorization.requireRole(input.actor, 'source-manager');
    return this.challenges.listPending(input.actor.id);
  }
}

export class GetAuthChallengeUseCase {
  constructor(
    private readonly authorization: SourceReaderAuthorizationPolicy,
    private readonly challenges: Pick<AuthChallengeAdministrationRepository, 'findById'>
  ) {}
  async execute(input: { actor: SourceReaderActor; challengeId: string }) {
    this.authorization.requireRole(input.actor, 'source-manager');
    const challenge = await this.challenges.findById(input.challengeId);
    if (!challenge) {
      throw new SourceReaderError(
        'AUTH_CHALLENGE_EXPIRED',
        'Authentication challenge unavailable',
        {
          retryable: false,
          fallbackAllowed: false
        }
      );
    }
    assertOwner(input.actor, challenge);
    return challenge;
  }
}

export class RespondAuthChallengeUseCase {
  constructor(
    private readonly authorization: SourceReaderAuthorizationPolicy,
    private readonly challenges: Pick<AuthChallengeService, 'respond'>
  ) {}
  execute(input: {
    actor: SourceReaderActor;
    challengeId: string;
    response: Record<string, unknown>;
  }) {
    this.authorization.requireRole(input.actor, 'source-manager');
    return this.challenges.respond({
      challengeId: input.challengeId,
      ownerId: input.actor.id,
      response: input.response
    });
  }
}

export class CancelAuthChallengeUseCase {
  constructor(
    private readonly authorization: SourceReaderAuthorizationPolicy,
    private readonly challenges: Pick<AuthChallengeService, 'cancel'>
  ) {}
  execute(input: { actor: SourceReaderActor; challengeId: string }) {
    this.authorization.requireRole(input.actor, 'source-manager');
    return this.challenges.cancel({ challengeId: input.challengeId, ownerId: input.actor.id });
  }
}
