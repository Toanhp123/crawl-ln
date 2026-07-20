import type { ClockPort } from '../../../../../shared/ports/clock.port.js';
import type { IdGeneratorPort } from '../../../../../shared/ports/id-generator.port.js';
import type {
  NetworkProfileHandle,
  NetworkProfileRepository
} from '../../ports/network-profile.repository.js';
import type { SessionRepository } from '../../ports/session.repository.js';
import type { SourceReaderActor } from '../../ports/source-reader-actor.port.js';
import type { SourceReaderAuthorizationPolicy } from '../../policies/source-reader-authorization.policy.js';

export type NetworkProfileAdministrationRepository = NetworkProfileRepository;

export interface NetworkProfileTester {
  test(
    profileId: string,
    ownerId?: string
  ): Promise<{
    status: 'healthy' | 'degraded' | 'offline';
    region?: string;
    latencyMs: number;
    checkedAt: string;
  }>;
}

export interface CreateNetworkProfileInput {
  actor: SourceReaderActor;
  ownerType: 'system' | 'user';
  name: string;
  routeType: NetworkProfileHandle['routeType'];
  regions: string[];
  tags: string[];
  config?: Record<string, unknown>;
}

export class CreateNetworkProfileUseCase {
  constructor(
    private readonly authorization: SourceReaderAuthorizationPolicy,
    private readonly profiles: Pick<NetworkProfileRepository, 'save'>,
    private readonly ids: IdGeneratorPort,
    private readonly clock: ClockPort
  ) {}
  async execute(input: CreateNetworkProfileInput) {
    const ownerId = input.ownerType === 'user' ? input.actor.id : undefined;
    this.authorization.assertNetworkAccess(input.actor, { ownerType: input.ownerType, ownerId });
    const id = this.ids.randomId();
    const now = this.clock.now().toISOString();
    await this.profiles.save({
      id,
      ownerType: input.ownerType,
      ...(ownerId ? { ownerId } : {}),
      name: input.name,
      routeType: input.routeType,
      regions: input.regions,
      tags: input.tags,
      healthStatus: 'unknown',
      ...(input.config ? { secretConfig: input.config } : {}),
      enabled: true,
      createdAt: now,
      updatedAt: now
    });
    return {
      id,
      name: input.name,
      ownerType: input.ownerType,
      ownerId,
      routeType: input.routeType
    };
  }
}

export class ListNetworkProfilesUseCase {
  constructor(
    private readonly authorization: SourceReaderAuthorizationPolicy,
    private readonly profiles: Pick<NetworkProfileAdministrationRepository, 'listMetadata'>
  ) {}
  execute(input: { actor: SourceReaderActor }) {
    this.authorization.requireRole(input.actor, 'source-manager');
    return this.profiles.listMetadata({
      ownerId: input.actor.id,
      includeSystem: input.actor.roles.includes('system-admin')
    });
  }
}

export class UpdateNetworkProfileUseCase {
  constructor(
    private readonly authorization: SourceReaderAuthorizationPolicy,
    private readonly profiles: Pick<
      NetworkProfileAdministrationRepository,
      'requireHandle' | 'update'
    >,
    private readonly clock: ClockPort
  ) {}
  async execute(input: {
    actor: SourceReaderActor;
    profileId: string;
    patch: Parameters<NetworkProfileAdministrationRepository['update']>[1];
  }) {
    const current = await this.profiles.requireHandle(input.profileId);
    this.authorization.assertNetworkAccess(input.actor, current);
    await this.profiles.update(input.profileId, input.patch, this.clock.now().toISOString());
  }
}

export class DeleteNetworkProfileUseCase {
  constructor(
    private readonly authorization: SourceReaderAuthorizationPolicy,
    private readonly profiles: Pick<
      NetworkProfileAdministrationRepository,
      'requireHandle' | 'delete'
    >,
    private readonly sessions: { revokeByNetworkProfile(profileId: string): Promise<void> }
  ) {}
  async execute(input: { actor: SourceReaderActor; profileId: string }) {
    const current = await this.profiles.requireHandle(input.profileId);
    this.authorization.assertNetworkAccess(input.actor, current);
    await this.sessions.revokeByNetworkProfile(input.profileId);
    await this.profiles.delete(input.profileId);
  }
}

export class TestNetworkProfileUseCase {
  constructor(
    private readonly authorization: SourceReaderAuthorizationPolicy,
    private readonly tester: NetworkProfileTester
  ) {}
  execute(input: { actor: SourceReaderActor; profileId: string }) {
    this.authorization.requireRole(input.actor, 'source-manager');
    return this.tester.test(input.profileId, input.actor.id);
  }
}
