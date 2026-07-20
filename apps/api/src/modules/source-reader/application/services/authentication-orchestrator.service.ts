import type { AuthenticationRuntimePort } from '../ports/authentication-runtime.port.js';
import type { AuthChallengeHandle } from '../ports/auth-challenge.repository.js';
import type { CredentialHandle, CredentialRepository } from '../ports/credential.repository.js';
import type { NetworkProfileHandle } from '../ports/network-profile.repository.js';
import type {
  NetworkRouteResolverPort,
  RouteAwareHttpClientPort
} from '../ports/network-route.port.js';
import type { PluginContextFactoryPort } from '../ports/plugin-context-factory.port.js';
import type { PluginRegistryPort } from '../ports/plugin-registry.port.js';
import type { SessionRepository } from '../ports/session.repository.js';
import type { SourceReaderInvalidationPort } from '../ports/source-reader-invalidation.port.js';
import type {
  AuthExecutionResult,
  AuthenticationStrategy
} from '../../domain/auth/authentication.js';
import { SourceReaderError } from '../../domain/errors/source-reader.error.js';
import type { AuthenticationHttpClient } from './standard-authentication.service.js';
import { StandardAuthenticationService } from './standard-authentication.service.js';

interface LoginInput {
  pluginId: string;
  pluginVersion: string;
  userId?: string;
  credentialProfileId: string;
  networkRoute?: NetworkProfileHandle;
  strategy: AuthenticationStrategy;
  configuration: Record<string, unknown>;
  signal?: AbortSignal;
}

export class AuthenticationOrchestratorService implements AuthenticationRuntimePort {
  constructor(
    private readonly credentials: CredentialRepository,
    private readonly sessions: SessionRepository,
    private readonly standard: StandardAuthenticationService,
    private readonly http: AuthenticationHttpClient,
    private readonly ids: { randomId(): string },
    private readonly clock: { now(): Date },
    private readonly plugins?: PluginRegistryPort,
    private readonly contexts?: PluginContextFactoryPort,
    private readonly challenges?: {
      create(input: {
        pluginId: string;
        pluginVersion: string;
        credentialProfileId?: string;
        networkProfileId?: string;
        ownerId?: string;
        type: AuthChallengeHandle['type'];
        expiresAt: string;
        state: Record<string, unknown>;
      }): Promise<AuthChallengeHandle>;
    },
    private readonly routes?: NetworkRouteResolverPort,
    private readonly invalidation?: SourceReaderInvalidationPort
  ) {}

  async login(input: LoginInput): Promise<AuthExecutionResult> {
    const credential = await this.credentials.findHandleById(input.credentialProfileId);
    if (!credential) {
      throw new SourceReaderError('CREDENTIAL_UNAVAILABLE', 'Credential is unavailable', {
        retryable: false,
        fallbackAllowed: false
      });
    }
    this.assertCredentialAccess(credential, input.userId, input.pluginId);
    return this.authenticate({
      pluginId: input.pluginId,
      pluginVersion: input.pluginVersion,
      userId: input.userId,
      credential,
      networkRoute: input.networkRoute,
      strategy: input.strategy,
      configuration: input.configuration,
      signal: input.signal
    });
  }

  async authenticate(
    input: Parameters<AuthenticationRuntimePort['authenticate']>[0]
  ): Promise<AuthExecutionResult> {
    this.assertCredentialAccess(input.credential, input.userId, input.pluginId);
    const resolvedRoute = this.routes
      ? await this.routes.resolve(input.networkRoute)
      : ({ kind: 'direct', identity: 'direct' } as const);
    const routedHttp = this.routedHttp(resolvedRoute);
    const result =
      input.strategy === 'custom'
        ? await this.authenticateCustom(input, resolvedRoute)
        : await this.standard.authenticate({
            strategy: input.strategy,
            secret: await this.credentials.resolveSecret(input.credential),
            configuration: await this.standardConfiguration(input),
            http: routedHttp
          });

    if (result.status === 'authenticated') {
      await this.sessions.save({
        id: this.ids.randomId(),
        pluginId: input.pluginId,
        pluginVersion: input.pluginVersion,
        credentialProfileId: input.credential.id,
        ...(input.userId ? { ownerId: input.userId } : {}),
        ...(input.networkRoute ? { networkProfileId: input.networkRoute.id } : {}),
        networkBinding: result.session.networkBinding,
        encryptedMaterial: result.session as unknown as Record<string, unknown>,
        status: 'active',
        ...(result.session.expiresAt ? { expiresAt: result.session.expiresAt } : {}),
        createdAt: this.clock.now().toISOString()
      });
      return result;
    }

    if (!this.challenges) {
      throw new SourceReaderError(
        'AUTHENTICATION_REQUIRED',
        'Authentication challenge persistence is unavailable',
        { retryable: false, fallbackAllowed: false }
      );
    }
    const { opaqueState, ...publicChallenge } = result.challenge;
    const persisted = await this.challenges.create({
      pluginId: input.pluginId,
      pluginVersion: input.pluginVersion,
      credentialProfileId: input.credential.id,
      ...(input.networkRoute ? { networkProfileId: input.networkRoute.id } : {}),
      ...(input.userId ? { ownerId: input.userId } : {}),
      type: result.challenge.type,
      expiresAt: result.challenge.expiresAt,
      state: {
        pluginChallengeId: result.challenge.id,
        opaqueState: opaqueState ?? {},
        __routeIdentity: resolvedRoute.identity
      }
    });
    return {
      status: 'challenge-required',
      challenge: { ...publicChallenge, id: persisted.id }
    };
  }

  async logout(input: { credentialProfileId: string }): Promise<void> {
    await this.sessions.revokeByCredential(input.credentialProfileId);
    await this.invalidation?.invalidate({
      type: 'logout',
      credentialId: input.credentialProfileId
    });
  }

  private async authenticateCustom(
    input: Parameters<AuthenticationRuntimePort['authenticate']>[0],
    resolvedNetworkRoute: Awaited<ReturnType<NetworkRouteResolverPort['resolve']>>
  ): Promise<AuthExecutionResult> {
    const sourceUrl =
      typeof input.configuration.sourceUrl === 'string' ? input.configuration.sourceUrl : '';
    if (!sourceUrl || !this.plugins || !this.contexts) {
      return this.customUnavailable('Custom authentication is unavailable');
    }

    const candidate = (
      await this.plugins.listCandidates({ url: sourceUrl, capability: 'authentication' })
    ).find((item) => item.plugin.manifest.id === input.pluginId);
    const extension = candidate?.plugin.authentication;
    if (!candidate || !extension) {
      return this.customUnavailable('Custom authentication is unavailable');
    }

    const secret = await this.credentials.resolveSecret(input.credential);
    const allowedFields = candidate.plugin.manifest.authentication?.custom?.fields ?? [];
    const fields = Object.fromEntries(
      allowedFields.flatMap((field) =>
        typeof secret[field] === 'string' ? [[field, secret[field] as string]] : []
      )
    );
    if (candidate.packagePath) {
      return extension.login({
        credentialHandleId: input.credential.id,
        fields,
        routeIdentity: resolvedNetworkRoute.identity
      });
    }

    const signal = input.signal ?? new AbortController().signal;
    const context = this.contexts.create({
      pluginId: input.pluginId,
      allowedHosts: candidate.plugin.manifest.permissions.network.hosts,
      signal,
      runtimeContext: {
        credential: input.credential,
        ...(input.networkRoute ? { networkRoute: input.networkRoute } : {}),
        executionMode: candidate.executionMode,
        resolvedNetworkRoute,
        browserRequired: candidate.plugin.manifest.runtime.requiresBrowser ?? false,
        cacheIdentity: {
          public: 'public',
          account: input.credential.id,
          ...(input.userId ? { user: input.userId } : {}),
          network: resolvedNetworkRoute.identity
        }
      }
    });
    return extension.login(
      {
        credentialHandleId: input.credential.id,
        fields,
        routeIdentity: resolvedNetworkRoute.identity
      },
      context
    );
  }

  private async standardConfiguration(
    input: Parameters<AuthenticationRuntimePort['authenticate']>[0]
  ): Promise<Record<string, unknown>> {
    if (input.strategy !== 'form-login' || !this.plugins) return input.configuration;
    const sourceUrl =
      typeof input.configuration.sourceUrl === 'string' ? input.configuration.sourceUrl : '';
    if (!sourceUrl) return input.configuration;
    const candidate = (
      await this.plugins.listCandidates({ url: sourceUrl, capability: 'authentication' })
    ).find((item) => item.plugin.manifest.id === input.pluginId);
    const formLogin = candidate?.plugin.manifest.authentication?.formLogin;
    if (!formLogin) return input.configuration;
    return {
      ...input.configuration,
      loginUrl: formLogin.loginUrlTemplate,
      fields: formLogin.fields,
      staticFields: formLogin.staticFields,
      success: formLogin.success,
      failure: formLogin.failure,
      session: formLogin.session
    };
  }

  private routedHttp(
    route: Awaited<ReturnType<NetworkRouteResolverPort['resolve']>>
  ): AuthenticationHttpClient {
    const candidate = this.http as AuthenticationHttpClient & Partial<RouteAwareHttpClientPort>;
    if (!candidate.getRouted || !candidate.postRouted) return this.http;
    return {
      get: (url, options) => candidate.getRouted!(url, { ...options, route }),
      post: (url, options) => candidate.postRouted!(url, { ...options, route })
    };
  }

  private assertCredentialAccess(
    credential: CredentialHandle,
    userId: string | undefined,
    pluginId: string
  ): void {
    if (credential.ownerType === 'user' && credential.ownerId !== userId) {
      throw new SourceReaderError('PLUGIN_PERMISSION_DENIED', 'Credential is not owned by actor', {
        retryable: false,
        fallbackAllowed: false
      });
    }
    if (credential.pluginId && credential.pluginId !== pluginId) {
      throw new SourceReaderError(
        'PLUGIN_PERMISSION_DENIED',
        'Credential is not approved for this plugin',
        { retryable: false, fallbackAllowed: false }
      );
    }
  }

  private customUnavailable(message: string): never {
    throw new SourceReaderError('CAPABILITY_NOT_SUPPORTED', message, {
      retryable: false,
      fallbackAllowed: false
    });
  }
}
