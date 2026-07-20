import type { ClockPort } from '../../../../../shared/ports/clock.port.js';
import type { IdGeneratorPort } from '../../../../../shared/ports/id-generator.port.js';
import type { CredentialHandle, CredentialRepository } from '../../ports/credential.repository.js';
import type { NetworkProfileRepository } from '../../ports/network-profile.repository.js';
import type { PluginStorePort } from '../../ports/plugin-store.port.js';
import type { SessionRepository } from '../../ports/session.repository.js';
import type { SourceReaderActor } from '../../ports/source-reader-actor.port.js';
import type { SourceReaderInvalidationPort } from '../../ports/source-reader-invalidation.port.js';
import type { SourceReaderAuthorizationPolicy } from '../../policies/source-reader-authorization.policy.js';
import type { AuthenticationOrchestratorService } from '../../services/authentication-orchestrator.service.js';
import { SourceReaderError } from '../../../domain/errors/source-reader.error.js';
import { toPublicAuthenticationResult } from '../../services/public-authentication-result.js';

export type CredentialAdministrationRepository = CredentialRepository;

export class CreateCredentialUseCase {
  constructor(
    private readonly authorization: SourceReaderAuthorizationPolicy,
    private readonly credentials: Pick<CredentialRepository, 'save'>,
    private readonly ids: IdGeneratorPort,
    private readonly clock: ClockPort
  ) {}

  async execute(input: {
    actor: SourceReaderActor;
    ownerType: 'system' | 'user';
    pluginId?: string;
    domain?: string;
    name: string;
    strategy: CredentialHandle['strategy'];
    secret: Record<string, unknown>;
  }) {
    const ownerId = input.ownerType === 'user' ? input.actor.id : undefined;
    this.authorization.assertCredentialAccess(input.actor, { ownerType: input.ownerType, ownerId });
    const now = this.clock.now().toISOString();
    const id = this.ids.randomId();
    await this.credentials.save({
      id,
      ownerType: input.ownerType,
      ...(ownerId ? { ownerId } : {}),
      ...(input.pluginId ? { pluginId: input.pluginId } : {}),
      ...(input.domain ? { domain: input.domain } : {}),
      name: input.name,
      strategy: input.strategy,
      secret: input.secret,
      enabled: true,
      createdAt: now,
      updatedAt: now
    });
    return { id, name: input.name, ownerType: input.ownerType, ownerId, strategy: input.strategy };
  }
}

export class ListCredentialsUseCase {
  constructor(
    private readonly authorization: SourceReaderAuthorizationPolicy,
    private readonly credentials: Pick<CredentialAdministrationRepository, 'listMetadata'>
  ) {}
  execute(input: { actor: SourceReaderActor }) {
    this.authorization.requireRole(input.actor, 'source-manager');
    return this.credentials.listMetadata({
      ownerId: input.actor.id,
      includeSystem: input.actor.roles.includes('system-admin')
    });
  }
}

export class UpdateCredentialSecretUseCase {
  constructor(
    private readonly authorization: SourceReaderAuthorizationPolicy,
    private readonly credentials: Pick<
      CredentialAdministrationRepository,
      'requireHandle' | 'updateSecret'
    >,
    private readonly sessions: Pick<SessionRepository, 'revokeByCredential'>,
    private readonly clock: ClockPort,
    private readonly invalidation?: SourceReaderInvalidationPort
  ) {}
  async execute(input: {
    actor: SourceReaderActor;
    credentialId: string;
    secret: Record<string, unknown>;
  }) {
    const handle = await this.credentials.requireHandle(input.credentialId);
    this.authorization.assertCredentialAccess(input.actor, handle);
    await this.credentials.updateSecret(
      input.credentialId,
      input.secret,
      this.clock.now().toISOString()
    );
    if (this.invalidation) {
      await this.invalidation.invalidate({
        type: 'credential-updated',
        credentialId: input.credentialId
      });
    } else {
      await this.sessions.revokeByCredential(input.credentialId);
    }
  }
}

export class DeleteCredentialUseCase {
  constructor(
    private readonly authorization: SourceReaderAuthorizationPolicy,
    private readonly credentials: Pick<
      CredentialAdministrationRepository,
      'requireHandle' | 'delete'
    >,
    private readonly sessions: Pick<SessionRepository, 'revokeByCredential'>,
    private readonly invalidation?: SourceReaderInvalidationPort
  ) {}
  async execute(input: { actor: SourceReaderActor; credentialId: string }) {
    const handle = await this.credentials.requireHandle(input.credentialId);
    this.authorization.assertCredentialAccess(input.actor, handle);
    if (!this.invalidation) await this.sessions.revokeByCredential(input.credentialId);
    await this.credentials.delete(input.credentialId);
    await this.invalidation?.invalidate({
      type: 'credential-deleted',
      credentialId: input.credentialId
    });
  }
}

interface AuthenticationDependencies {
  authentication: Pick<AuthenticationOrchestratorService, 'login' | 'logout'>;
  credentials: Pick<CredentialAdministrationRepository, 'requireHandle'>;
  plugins: Pick<PluginStorePort, 'findActive'>;
  networks: Pick<NetworkProfileRepository, 'findHandleById'>;
}

async function loginInput(
  dependencies: AuthenticationDependencies,
  input: { actor: SourceReaderActor; credentialId: string; networkProfileId?: string }
) {
  const credential = await dependencies.credentials.requireHandle(input.credentialId);
  if (!credential.pluginId) {
    throw new SourceReaderError('CREDENTIAL_UNAVAILABLE', 'Credential is not bound to a plugin', {
      retryable: false,
      fallbackAllowed: false
    });
  }
  const active = await dependencies.plugins.findActive(credential.pluginId);
  if (!active) {
    throw new SourceReaderError('PLUGIN_UNAVAILABLE', 'Credential plugin is not active', {
      retryable: true,
      fallbackAllowed: false
    });
  }
  const networkRoute = input.networkProfileId
    ? await dependencies.networks.findHandleById(input.networkProfileId)
    : undefined;
  return {
    pluginId: credential.pluginId,
    pluginVersion: active.version,
    userId: input.actor.id,
    credentialProfileId: credential.id,
    ...(networkRoute ? { networkRoute } : {}),
    strategy: credential.strategy,
    configuration: { ...(credential.domain ? { sourceUrl: `https://${credential.domain}/` } : {}) }
  };
}

export class LoginCredentialUseCase {
  constructor(
    private readonly authorization: SourceReaderAuthorizationPolicy,
    private readonly dependencies: AuthenticationDependencies
  ) {}
  async execute(input: {
    actor: SourceReaderActor;
    credentialId: string;
    networkProfileId?: string;
  }) {
    this.authorization.requireRole(input.actor, 'source-manager');
    return toPublicAuthenticationResult(
      await this.dependencies.authentication.login(await loginInput(this.dependencies, input))
    );
  }
}

export class LogoutCredentialUseCase {
  constructor(
    private readonly authorization: SourceReaderAuthorizationPolicy,
    private readonly authentication: Pick<AuthenticationOrchestratorService, 'logout'>
  ) {}
  execute(input: { actor: SourceReaderActor; credentialId: string }) {
    this.authorization.requireRole(input.actor, 'source-manager');
    return this.authentication.logout({ credentialProfileId: input.credentialId });
  }
}

export class TestCredentialUseCase extends LoginCredentialUseCase {}
