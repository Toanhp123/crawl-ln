import { createHash } from 'node:crypto';
import type { CredentialRepository } from '../ports/credential.repository.js';
import type { NetworkProfileRepository } from '../ports/network-profile.repository.js';
import type {
  ResolvedRuntimeContext,
  RuntimeContextResolverPort
} from '../ports/runtime-context-resolver.port.js';
import type { SessionRepository } from '../ports/session.repository.js';
import { SourceReaderError } from '../../domain/errors/source-reader.error.js';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');

export class RuntimeContextResolverService implements RuntimeContextResolverPort {
  constructor(
    private readonly credentials: CredentialRepository,
    private readonly networks: NetworkProfileRepository,
    private readonly sessions: SessionRepository
  ) {}

  async resolve(
    input: Parameters<RuntimeContextResolverPort['resolve']>[0]
  ): Promise<ResolvedRuntimeContext> {
    const credential = input.credentialProfileId
      ? await this.credentials.findHandleById(input.credentialProfileId)
      : (
          await this.credentials.findCandidates({
            userId: input.userId,
            pluginId: input.pluginId,
            domain: input.domain
          })
        ).find(
          (candidate) =>
            candidate.ownerType === 'system' ||
            (Boolean(input.userId) && candidate.ownerId === input.userId)
        );

    if (input.runtimeRequirements?.authentication?.required && !credential) {
      throw new SourceReaderError('CREDENTIAL_NOT_CONFIGURED', 'Source credential is required', {
        retryable: false,
        fallbackAllowed: false
      });
    }
    if (credential?.ownerType === 'user' && credential.ownerId !== input.userId) {
      throw new SourceReaderError(
        'PLUGIN_PERMISSION_DENIED',
        'Credential is not owned by the actor',
        { retryable: false, fallbackAllowed: false }
      );
    }

    const requirement = input.runtimeRequirements?.network;
    const networkRoute = input.networkProfileId
      ? await this.networks.findHandleById(input.networkProfileId)
      : (
          await this.networks.findCandidates({
            userId: input.userId,
            regions: requirement?.regions,
            tags: requirement?.routeTags
          })
        ).find(
          (candidate) =>
            candidate.ownerType === 'system' ||
            (Boolean(input.userId) && candidate.ownerId === input.userId)
        );

    if (networkRoute?.ownerType === 'user' && networkRoute.ownerId !== input.userId) {
      throw new SourceReaderError(
        'PLUGIN_PERMISSION_DENIED',
        'Network profile is not owned by the actor',
        { retryable: false, fallbackAllowed: false }
      );
    }
    if (networkRoute?.healthStatus === 'offline') {
      throw new SourceReaderError('NETWORK_ROUTE_OFFLINE', 'Selected network route is offline', {
        retryable: true,
        fallbackAllowed: true
      });
    }
    if (requirement?.required && !networkRoute && !requirement.allowDirectFallback) {
      throw new SourceReaderError(
        requirement.regions?.length ? 'NETWORK_REGION_UNAVAILABLE' : 'NETWORK_ROUTE_REQUIRED',
        'Required network route is unavailable',
        { retryable: true, fallbackAllowed: true }
      );
    }

    const routeSession = credential
      ? await this.sessions.findActive({
          pluginId: input.pluginId,
          credentialProfileId: credential.id,
          ownerId: input.userId,
          networkProfileId: networkRoute?.id
        })
      : undefined;
    const alternateSession =
      credential && !routeSession && this.sessions.findActiveAnyRoute
        ? await this.sessions.findActiveAnyRoute({
            pluginId: input.pluginId,
            credentialProfileId: credential.id,
            ownerId: input.userId
          })
        : undefined;
    const session = routeSession ?? alternateSession;
    if (session?.networkBinding === 'required' && session.networkProfileId !== networkRoute?.id) {
      throw new SourceReaderError(
        'SESSION_NETWORK_MISMATCH',
        'Session requires the network route used during login',
        { retryable: false, fallbackAllowed: false }
      );
    }

    return {
      credential,
      session,
      networkRoute,
      executionMode: input.executionMode ?? 'in-process',
      browserRequired: false,
      cacheIdentity: {
        authScope: credential ? hash(`${credential.ownerType}:${credential.id}`) : 'anonymous',
        networkScope: networkRoute ? hash(networkRoute.id) : 'direct'
      }
    };
  }
}
