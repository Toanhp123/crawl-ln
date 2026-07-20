import { AuthChallengeService } from '../../../modules/source-reader/application/services/auth-challenge.service.js';
import { AuthenticationOrchestratorService } from '../../../modules/source-reader/application/services/authentication-orchestrator.service.js';
import { PluginHealthService } from '../../../modules/source-reader/application/services/plugin-health.service.js';
import { PluginInstallationService } from '../../../modules/source-reader/application/services/plugin-installation.service.js';
import { PluginCompatibilityService } from '../../../modules/source-reader/application/services/plugin-compatibility.service.js';
import { ExternalPluginRevalidationService } from '../../../modules/source-reader/application/services/external-plugin-revalidation.service.js';
import { SOURCE_READER_HOST_COMPATIBILITY } from '../../../modules/source-reader/domain/plugin/source-reader-host-compatibility.js';
import { PluginActivationService } from '../../../modules/source-reader/application/services/plugin-activation.service.js';
import { ExternalPluginRegistrationFactory } from '../../../modules/source-reader/application/services/external-plugin-registration.factory.js';
import { RuntimeContextResolverService } from '../../../modules/source-reader/application/services/runtime-context-resolver.service.js';
import { SourceReaderMaintenanceService } from '../../../modules/source-reader/application/services/source-reader-maintenance.service.js';
import { SourceReaderInvalidationService } from '../../../modules/source-reader/application/services/source-reader-invalidation.service.js';
import { PublicCacheRefreshService } from '../../../modules/source-reader/application/services/public-cache-refresh.service.js';
import { SourceReaderService } from '../../../modules/source-reader/application/services/source-reader.service.js';
import { SourceReaderCircuitBreaker } from '../../../modules/source-reader/application/services/source-reader-circuit-breaker.js';
import { SourceReaderRateLimiter } from '../../../modules/source-reader/application/services/source-reader-rate-limiter.js';
import { StandardAuthenticationService } from '../../../modules/source-reader/application/services/standard-authentication.service.js';
import { SourceReaderAuthorizationPolicy } from '../../../modules/source-reader/application/policies/source-reader-authorization.policy.js';
import {
  ApprovePluginPermissionsUseCase,
  DenyPluginPermissionsUseCase,
  DisablePluginUseCase,
  EnablePluginUseCase,
  GetPluginDiagnosticsUseCase,
  GetPluginHealthUseCase,
  InstallSourcePluginUseCase,
  ListPluginPermissionsUseCase,
  ListPluginsUseCase,
  RemovePluginUseCase,
  TestPluginUseCase
} from '../../../modules/source-reader/application/use-cases/plugins/manage-source-plugins.usecase.js';
import {
  CreateCredentialUseCase,
  DeleteCredentialUseCase,
  ListCredentialsUseCase,
  LoginCredentialUseCase,
  LogoutCredentialUseCase,
  TestCredentialUseCase,
  UpdateCredentialSecretUseCase
} from '../../../modules/source-reader/application/use-cases/credentials/manage-credentials.usecase.js';
import {
  CreateNetworkProfileUseCase,
  DeleteNetworkProfileUseCase,
  ListNetworkProfilesUseCase,
  TestNetworkProfileUseCase,
  UpdateNetworkProfileUseCase
} from '../../../modules/source-reader/application/use-cases/network/manage-network-profiles.usecase.js';
import {
  CancelAuthChallengeUseCase,
  GetAuthChallengeUseCase,
  ListAuthChallengesUseCase,
  RespondAuthChallengeUseCase
} from '../../../modules/source-reader/application/use-cases/auth-challenges/manage-auth-challenges.usecase.js';
import { MemoryReaderCache } from '../../../modules/source-reader/infrastructure/cache/memory-reader.cache.js';
import { SqliteReaderCache } from '../../../modules/source-reader/infrastructure/cache/sqlite-reader.cache.js';
import { TieredReaderCache } from '../../../modules/source-reader/infrastructure/cache/tiered-reader.cache.js';
import { HmacCursorCodec } from '../../../modules/source-reader/infrastructure/cursor/hmac-cursor.codec.js';
import { novelCoolPlugin } from '../../../modules/source-reader/infrastructure/plugins/built-in/novelcool/novelcool.plugin.js';
import {
  ExternalPluginLoader,
  inspectInstalledPluginPackage
} from '../../../modules/source-reader/infrastructure/plugins/package-loader/external-plugin.loader.js';
import { SourcePluginPackageVerifier } from '../../../modules/source-reader/infrastructure/plugins/package-loader/source-plugin-package.verifier.js';
import { StaticTrustStore } from '../../../modules/source-reader/infrastructure/plugins/package-loader/static-trust.store.js';
import { InMemoryPluginRegistry } from '../../../modules/source-reader/infrastructure/plugins/registry/in-memory-plugin.registry.js';
import { InProcessPluginRuntime } from '../../../modules/source-reader/infrastructure/runtime/in-process/in-process-plugin.runtime.js';
import { BrowserRuntimeCoordinator } from '../../../modules/source-reader/infrastructure/runtime/browser-worker/browser-runtime.coordinator.js';
import { ExternalProcessSupervisor } from '../../../modules/source-reader/infrastructure/runtime/external-process/external-process-supervisor.js';
import { SANDBOX_PROTOCOL_VERSION } from '../../../modules/source-reader/infrastructure/runtime/external-process/sandbox-protocol.js';
import { RuntimeRouter } from '../../../modules/source-reader/infrastructure/runtime/runtime-router.js';
import { LocalEncryptedVault } from '../../../modules/source-reader/infrastructure/secrets/local-encrypted.vault.js';
import { SqliteAuthChallengeRepository } from '../../../modules/source-reader/infrastructure/sqlite/sqlite-auth-challenge.repository.js';
import { SqliteCredentialRepository } from '../../../modules/source-reader/infrastructure/sqlite/sqlite-credential.repository.js';
import { SqliteNetworkProfileRepository } from '../../../modules/source-reader/infrastructure/sqlite/sqlite-network-profile.repository.js';
import { SqlitePluginHealthRepository } from '../../../modules/source-reader/infrastructure/sqlite/sqlite-plugin-health.repository.js';
import { SqlitePluginStore } from '../../../modules/source-reader/infrastructure/sqlite/sqlite-plugin.store.js';
import { SqliteSessionRepository } from '../../../modules/source-reader/infrastructure/sqlite/sqlite-session.repository.js';
import { PluginContextFactory } from '../../../modules/source-reader/infrastructure/runtime/plugin-context.factory.js';
import { NetworkRouteResolver } from '../../../modules/source-reader/infrastructure/network/network-route.resolver.js';
import { NetworkRouteTester } from '../../../modules/source-reader/infrastructure/network/network-route-tester.js';
import { ProxyAgentFactory } from '../../../modules/source-reader/infrastructure/network/proxy-agent.factory.js';
import { RouteAwareHttpClientAdapter } from '../../../modules/source-reader/infrastructure/network/route-aware-http-client.adapter.js';
import { InProcessSourceReaderObservability } from '../../../modules/source-reader/infrastructure/observability/source-reader-observability.js';
import { BoundedSourceReaderStructuredLogger } from '../../../modules/source-reader/application/services/source-reader-structured-logger.js';
import { SourceReaderAdminController } from '../../../modules/source-reader/presentation/controllers/source-reader-admin.controller.js';
import { SourceReaderController } from '../../../modules/source-reader/presentation/controllers/source-reader.controller.js';
import type {
  SourceReaderApi,
  SourceReaderManagementApi
} from '../../../modules/source-reader/public/source-reader.api.js';
import { SourceReaderError } from '../../../modules/source-reader/domain/errors/source-reader.error.js';
import { env } from '../../config/env.js';
import { CheerioHtmlParserAdapter } from '../../infrastructure/html/cheerio-html-parser.adapter.js';
import type { InfrastructureModule } from './infrastructure.module.js';

export function createSourceReaderModule(infrastructure: InfrastructureModule) {
  const registry = new InMemoryPluginRegistry();
  registry.register(novelCoolPlugin, {
    trustLevel: 'built-in',
    executionMode: 'in-process',
    enabled: true
  });

  const vault = new LocalEncryptedVault(env.sourceReaderMasterKey);
  const credentials = new SqliteCredentialRepository(infrastructure.database, vault);
  const networks = new SqliteNetworkProfileRepository(infrastructure.database, vault);
  const sessions = new SqliteSessionRepository(infrastructure.database, vault);
  const challenges = new SqliteAuthChallengeRepository(infrastructure.database, vault);
  const pluginStore = new SqlitePluginStore(infrastructure.database);
  const structuredLogger = new BoundedSourceReaderStructuredLogger(infrastructure.logger);
  const health = new PluginHealthService(
    new SqlitePluginHealthRepository(infrastructure.database),
    infrastructure.clock,
    infrastructure.ids,
    {
      pluginStore,
      registry,
      threshold: env.sourceReaderPluginPolicyViolationThreshold
    }
  );
  const externalSupervisor = new ExternalProcessSupervisor({
    startupTimeoutMs: env.sourceReaderExternalProcessStartTimeoutMs,
    cancelGraceMs: 100,
    structuredLogger,
    onOutputPolicyViolation: (input) => health.recordPolicyViolation(input)
  });
  const externalRegistrationFactory = new ExternalPluginRegistrationFactory({
    supervisor: externalSupervisor,
    timeoutMs: env.requestTimeoutMs,
    now: () => infrastructure.clock.now(),
    randomId: () => infrastructure.ids.randomId(),
    protocolVersion: SANDBOX_PROTOCOL_VERSION
  });
  const externalLoader = new ExternalPluginLoader(pluginStore, externalRegistrationFactory);
  const compatibility = new PluginCompatibilityService(SOURCE_READER_HOST_COMPATIBILITY);
  const installer = new PluginInstallationService(
    new SourcePluginPackageVerifier(new StaticTrustStore(env.sourceReaderTrustedKeys)),
    pluginStore,
    env.sourceReaderPluginDir,
    infrastructure.ids,
    infrastructure.clock,
    compatibility
  );
  const persistentCache = new SqliteReaderCache(infrastructure.database);
  const memoryCache = new MemoryReaderCache(env.sourceReaderMemoryCacheEntries);
  const cache = new TieredReaderCache(memoryCache, persistentCache);
  const routes = new NetworkRouteResolver(networks);
  const http = new RouteAwareHttpClientAdapter(new ProxyAgentFactory(20));
  const runtimeContexts = new RuntimeContextResolverService(
    credentials,
    networks,
    sessions,
    routes
  );
  const pluginContexts = new PluginContextFactory(
    http,
    new CheerioHtmlParserAdapter(),
    infrastructure.clock,
    structuredLogger,
    sessions
  );
  const browser = new BrowserRuntimeCoordinator({
    browserExecutablePath: env.sourceReaderBrowserExecutable,
    credentialResolver: async ({ credentialId, field }) => {
      const handle = await credentials.findHandleById(credentialId);
      if (!handle) throw new Error(`Credential ${credentialId} is unavailable`);
      const value = (await credentials.resolveSecret(handle))[field];
      if (typeof value !== 'string') {
        throw new Error(`Credential field ${field} is unavailable`);
      }
      return value;
    }
  });
  const invalidation = new SourceReaderInvalidationService(
    sessions,
    browser,
    memoryCache,
    persistentCache,
    {
      invalidationFinished(input) {
        structuredLogger.host('source_reader.invalidation_finished', input);
      }
    }
  );
  const publicRefresh = new PublicCacheRefreshService();
  const challengeService = new AuthChallengeService(
    challenges,
    browser,
    registry,
    sessions,
    pluginContexts,
    infrastructure.ids,
    infrastructure.clock,
    async (networkProfileId) => {
      if (!networkProfileId) return 'direct';
      const profile = await networks.requireHandle(networkProfileId);
      return (await routes.resolve(profile)).identity;
    }
  );
  const authentication = new AuthenticationOrchestratorService(
    credentials,
    sessions,
    new StandardAuthenticationService(),
    http,
    infrastructure.ids,
    infrastructure.clock,
    registry,
    pluginContexts,
    challengeService,
    routes,
    invalidation
  );
  const maintenance = new SourceReaderMaintenanceService(
    persistentCache,
    sessions,
    challengeService,
    () => infrastructure.clock.now()
  );

  const pluginActivation = new PluginActivationService(
    pluginStore,
    registry,
    externalSupervisor,
    externalRegistrationFactory,
    infrastructure.clock,
    infrastructure.ids,
    env.requestTimeoutMs
  );
  const externalRevalidation = new ExternalPluginRevalidationService(
    pluginStore,
    { inspect: inspectInstalledPluginPackage },
    compatibility,
    pluginActivation
  );

  const api = new SourceReaderService(
    registry,
    new RuntimeRouter(new InProcessPluginRuntime(), externalSupervisor, env.requestTimeoutMs),
    pluginContexts,
    cache,
    new HmacCursorCodec(
      Buffer.from(env.sourceReaderCursorKey.padEnd(32, '0').slice(0, 32)),
      infrastructure.clock
    ),
    infrastructure.clock,
    runtimeContexts,
    health,
    browser,
    new InProcessSourceReaderObservability(structuredLogger),
    new SourceReaderCircuitBreaker({ failureThreshold: 5, openMs: 60_000 }),
    new SourceReaderRateLimiter({ maxConcurrent: 2, minimumDelayMs: 100 }, infrastructure.clock),
    publicRefresh,
    invalidation
  ) satisfies SourceReaderApi;

  const authorization = new SourceReaderAuthorizationPolicy();
  const healthAdministration = {
    async describePlugin(pluginId: string) {
      const installed = (await pluginStore.listInstalled()).find(
        (item) => item.pluginId === pluginId
      );
      if (!installed) {
        throw new SourceReaderError('PLUGIN_UNAVAILABLE', 'Plugin is unavailable', {
          retryable: false,
          fallbackAllowed: false
        });
      }
      const version = installed.activeVersion
        ? await pluginStore.findVersion(pluginId, installed.activeVersion)
        : await pluginStore.findLatestVersion(pluginId);
      const registration = registry.findById(pluginId);
      return {
        pluginId,
        ...(installed.activeVersion ? { activeVersion: installed.activeVersion } : {}),
        status: installed.status,
        lifecycleState: registration ? 'running' : installed.status,
        runtimeVersion: SOURCE_READER_HOST_COMPATIBILITY.runtimeVersion,
        sandboxProtocolVersion: version?.sandboxProtocolVersion ?? 1,
        compatibilityIssues: version?.compatibilityIssues ?? [],
        policy: {
          processStartTimeoutMs: env.sourceReaderExternalProcessStartTimeoutMs,
          violationThreshold: env.sourceReaderPluginPolicyViolationThreshold
        }
      };
    },
    async runPluginHealthCheck(pluginId: string) {
      const diagnostics = await this.describePlugin(pluginId);
      const registration = registry.findById(pluginId);
      if (!registration) {
        throw new SourceReaderError('PLUGIN_UNAVAILABLE', 'Plugin is not active', {
          retryable: false,
          fallbackAllowed: false
        });
      }
      const lifecycleHealth = registration.plugin.lifecycle
        ? await registration.plugin.lifecycle.healthCheck()
        : { status: 'healthy' as const, details: { adapter: 'built-in' } };
      const checkedAt = infrastructure.clock.now().toISOString();
      return {
        ...diagnostics,
        lastHealth: { status: lifecycleHealth.status, checkedAt }
      };
    }
  };
  const loginDependencies = {
    authentication,
    credentials,
    plugins: pluginStore,
    networks
  };
  const networkTester = new NetworkRouteTester(
    networks,
    routes,
    http,
    infrastructure.clock,
    env.sourceReaderNetworkDiagnosticUrl,
    env.requestTimeoutMs
  );

  const management = {
    plugins: {
      list: new ListPluginsUseCase(authorization, pluginStore),
      install: new InstallSourcePluginUseCase(authorization, installer),
      approvePermissions: new ApprovePluginPermissionsUseCase(
        authorization,
        pluginStore,
        infrastructure.clock
      ),
      denyPermissions: new DenyPluginPermissionsUseCase(authorization, pluginStore),
      listPermissions: new ListPluginPermissionsUseCase(authorization, pluginStore),
      enable: new EnablePluginUseCase(authorization, pluginActivation, invalidation),
      disable: new DisablePluginUseCase(authorization, pluginActivation, invalidation),
      remove: new RemovePluginUseCase(authorization, pluginStore, invalidation),
      test: new TestPluginUseCase(authorization, healthAdministration),
      health: new GetPluginHealthUseCase(authorization, healthAdministration),
      diagnostics: new GetPluginDiagnosticsUseCase(authorization, healthAdministration)
    },
    credentials: {
      create: new CreateCredentialUseCase(
        authorization,
        credentials,
        infrastructure.ids,
        infrastructure.clock
      ),
      list: new ListCredentialsUseCase(authorization, credentials),
      updateSecret: new UpdateCredentialSecretUseCase(
        authorization,
        credentials,
        sessions,
        infrastructure.clock,
        invalidation
      ),
      remove: new DeleteCredentialUseCase(authorization, credentials, sessions, invalidation),
      login: new LoginCredentialUseCase(authorization, loginDependencies),
      logout: new LogoutCredentialUseCase(authorization, authentication),
      test: new TestCredentialUseCase(authorization, loginDependencies)
    },
    networkProfiles: {
      create: new CreateNetworkProfileUseCase(
        authorization,
        networks,
        infrastructure.ids,
        infrastructure.clock
      ),
      list: new ListNetworkProfilesUseCase(authorization, networks),
      update: new UpdateNetworkProfileUseCase(
        authorization,
        networks,
        infrastructure.clock,
        invalidation
      ),
      remove: new DeleteNetworkProfileUseCase(authorization, networks, sessions, invalidation),
      test: new TestNetworkProfileUseCase(authorization, networkTester)
    },
    challenges: {
      list: new ListAuthChallengesUseCase(authorization, challenges),
      get: new GetAuthChallengeUseCase(authorization, challenges),
      respond: new RespondAuthChallengeUseCase(authorization, challengeService),
      cancel: new CancelAuthChallengeUseCase(authorization, challengeService)
    }
  } satisfies SourceReaderManagementApi;

  return {
    api,
    management,
    application: { authentication, challenges: challengeService },
    presentation: {
      reader: new SourceReaderController(api),
      admin: new SourceReaderAdminController(management),
      actorOptions: {
        defaultRoles: env.sourceReaderDefaultRoles,
        trustRoleHeaders: env.sourceReaderTrustRoleHeaders
      }
    },
    lifecycle: {
      async start() {
        registry.replaceExternal(await externalLoader.loadActive());
        await externalRevalidation.revalidateAll(new AbortController().signal);
        maintenance.start();
      },
      async stop() {
        await pluginActivation.stopAll();
        await maintenance.stop();
      }
    }
  };
}

export type SourceReaderModule = ReturnType<typeof createSourceReaderModule>;
