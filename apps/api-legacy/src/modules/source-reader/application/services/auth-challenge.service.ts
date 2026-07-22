import type {
  AuthChallengeHandle,
  AuthChallengeRepository
} from '../ports/auth-challenge.repository.js';
import type { BrowserRuntimePort, BrowserSessionIdentity } from '../ports/browser-runtime.port.js';
import type { PluginContextFactoryPort } from '../ports/plugin-context-factory.port.js';
import type { PluginRegistryPort } from '../ports/plugin-registry.port.js';
import type { SessionRepository } from '../ports/session.repository.js';
import type { AuthExecutionResult, AuthSessionMaterial } from '../../domain/auth/authentication.js';
import { SourceReaderError } from '../../domain/errors/source-reader.error.js';

interface CreateChallengeInput {
  pluginId: string;
  pluginVersion: string;
  credentialProfileId?: string;
  networkProfileId?: string;
  ownerId?: string;
  type: AuthChallengeHandle['type'];
  expiresAt: string;
  state: Record<string, unknown>;
}

export class AuthChallengeService {
  constructor(
    private readonly repository: AuthChallengeRepository,
    private readonly browser: BrowserRuntimePort,
    private readonly plugins: PluginRegistryPort,
    private readonly sessions: SessionRepository,
    private readonly contexts: PluginContextFactoryPort,
    private readonly ids: { randomId(): string },
    private readonly clock: { now(): Date },
    private readonly resolveRouteIdentity?: (networkProfileId?: string) => Promise<string>
  ) {}

  async create(input: CreateChallengeInput): Promise<AuthChallengeHandle> {
    const handle: AuthChallengeHandle = {
      id: this.ids.randomId(),
      pluginId: input.pluginId,
      ...(input.credentialProfileId ? { credentialProfileId: input.credentialProfileId } : {}),
      ...(input.networkProfileId ? { networkProfileId: input.networkProfileId } : {}),
      ...(input.ownerId ? { ownerId: input.ownerId } : {}),
      type: input.type,
      status: 'pending',
      expiresAt: input.expiresAt
    };
    await this.repository.save({
      ...handle,
      encryptedState: { ...input.state, __pluginVersion: input.pluginVersion },
      createdAt: this.clock.now().toISOString()
    });
    return handle;
  }

  async respond(input: {
    challengeId: string;
    ownerId?: string;
    response: Record<string, unknown>;
  }): Promise<AuthExecutionResult> {
    const challenge = await this.repository.findPendingById(input.challengeId);
    if (
      !challenge ||
      Date.parse(challenge.expiresAt) <= this.clock.now().getTime() ||
      challenge.ownerId !== input.ownerId
    ) {
      throw this.expired();
    }
    const state = (await this.repository.resolveState(challenge)) ?? {};
    const registration = this.plugins.findById(challenge.pluginId);
    const resume = registration?.plugin.authentication?.resumeChallenge;
    if (!registration || !resume) {
      throw new SourceReaderError(
        'CAPABILITY_NOT_SUPPORTED',
        'Plugin cannot resume authentication challenge',
        { retryable: false, fallbackAllowed: false }
      );
    }
    const pluginVersion = typeof state.__pluginVersion === 'string' ? state.__pluginVersion : '';
    const routeIdentity = this.resolveRouteIdentity
      ? await this.resolveRouteIdentity(challenge.networkProfileId)
      : (challenge.networkProfileId ?? 'direct');
    if (
      pluginVersion !== registration.plugin.manifest.version ||
      (typeof state.__routeIdentity === 'string' && state.__routeIdentity !== routeIdentity)
    ) {
      throw new SourceReaderError(
        'SESSION_BINDING_MISMATCH',
        'Authentication challenge binding no longer matches the active plugin or route',
        { retryable: false, fallbackAllowed: false }
      );
    }

    let result: AuthExecutionResult;
    if (registration.packagePath) {
      result = await resume.call(registration.plugin.authentication, {
        challengeId: challenge.id,
        challengeType: challenge.type,
        response: input.response,
        opaqueState:
          state.opaqueState && typeof state.opaqueState === 'object'
            ? (state.opaqueState as Record<string, unknown>)
            : {},
        routeIdentity
      });
    } else {
      const signal = new AbortController().signal;
      const context = this.contexts.create({
        requestId: 'untracked',
        pluginId: challenge.pluginId,
        pluginVersion,
        capability: 'authentication',
        allowedHosts: registration.plugin.manifest.permissions.network.hosts,
        signal,
        runtimeContext: {
          executionMode: registration.executionMode,
          browserRequired: false,
          resolvedNetworkRoute: { kind: 'direct', identity: 'direct' },
          cacheIdentity: {
            public: 'public',
            ...(challenge.credentialProfileId ? { account: challenge.credentialProfileId } : {}),
            ...(challenge.ownerId ? { user: challenge.ownerId } : {}),
            network: routeIdentity
          }
        }
      });
      result = await resume.call(
        registration.plugin.authentication,
        { challengeId: challenge.id, response: { ...state, ...input.response } },
        context
      );
    }
    await this.repository.complete(challenge.id, this.clock.now().toISOString());
    if (result.status === 'authenticated') {
      await this.persistSession(challenge, state, result.session);
    }
    return result;
  }

  async expirePending(): Promise<void> {
    const expired = await this.repository.listExpiredPending(this.clock.now().toISOString());
    for (const challenge of expired) {
      await this.repository.markExpired(challenge.id);
      if (challenge.type === 'captcha' || challenge.type === 'browser-interaction') {
        await this.browser.closeByIdentity(this.identity(challenge));
      }
    }
  }

  async cancel(input: { challengeId: string; ownerId?: string }): Promise<void> {
    const challenge = await this.repository.findPendingById(input.challengeId);
    if (!challenge || challenge.ownerId !== input.ownerId) throw this.expired();
    await this.repository.cancel(challenge.id, this.clock.now().toISOString());
    if (challenge.type === 'captcha' || challenge.type === 'browser-interaction') {
      await this.browser.closeByIdentity(this.identity(challenge));
    }
  }

  private async persistSession(
    challenge: AuthChallengeHandle,
    state: Record<string, unknown>,
    material: AuthSessionMaterial
  ): Promise<void> {
    if (!challenge.credentialProfileId || typeof state.__pluginVersion !== 'string') {
      throw new SourceReaderError(
        'SESSION_UNAVAILABLE',
        'Challenge session identity is incomplete',
        {
          retryable: false,
          fallbackAllowed: false
        }
      );
    }
    await this.sessions.save({
      id: this.ids.randomId(),
      pluginId: challenge.pluginId,
      pluginVersion: state.__pluginVersion,
      credentialProfileId: challenge.credentialProfileId,
      ...(challenge.ownerId ? { ownerId: challenge.ownerId } : {}),
      ...(challenge.networkProfileId ? { networkProfileId: challenge.networkProfileId } : {}),
      networkBinding: material.networkBinding,
      encryptedMaterial: material as unknown as Record<string, unknown>,
      status: 'active',
      ...(material.expiresAt ? { expiresAt: material.expiresAt } : {}),
      createdAt: this.clock.now().toISOString()
    });
  }

  private identity(challenge: AuthChallengeHandle): BrowserSessionIdentity {
    return {
      ...(challenge.ownerId ? { userId: challenge.ownerId } : {}),
      pluginId: challenge.pluginId,
      sourceAccountId: challenge.credentialProfileId ?? challenge.id,
      ...(challenge.networkProfileId ? { networkRouteId: challenge.networkProfileId } : {})
    };
  }

  private expired(): SourceReaderError {
    return new SourceReaderError('AUTH_CHALLENGE_EXPIRED', 'Authentication challenge expired', {
      retryable: false,
      fallbackAllowed: false
    });
  }
}
