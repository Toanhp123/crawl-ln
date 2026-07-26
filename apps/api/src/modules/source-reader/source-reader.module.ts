import { randomUUID } from 'node:crypto';
import type { Environment } from '../../platform/config/environment.js';
import type { SqliteDatabase } from '../../platform/database/sqlite-database.js';
import { SourceReaderAuthorizationPolicy } from './application/admin/policies/source-reader-authorization.policy.js';
import { AuthChallengeService } from './application/admin/services/auth-challenge.service.js';
import { AuthenticationOrchestratorService } from './application/admin/services/authentication-orchestrator.service.js';
import { ExternalPluginRegistrationFactory } from './application/admin/services/external-plugin-registration.factory.js';
import { ExternalPluginRevalidationService } from './application/admin/services/external-plugin-revalidation.service.js';
import { NetworkRouteTester } from './application/admin/services/network-route-tester.service.js';
import { PluginActivationService } from './application/admin/services/plugin-activation.service.js';
import { PluginCompatibilityService } from './application/admin/services/plugin-compatibility.service.js';
import { PluginDiagnosticsService } from './application/admin/services/plugin-diagnostics.service.js';
import { PluginHealthCheckService } from './application/admin/services/plugin-health-check.service.js';
import { PluginHealthService } from './application/admin/services/plugin-health.service.js';
import { PluginInstallationService } from './application/admin/services/plugin-installation.service.js';
import { SourceReaderInvalidationService } from './application/admin/services/source-reader-invalidation.service.js';
import { SourceReaderMaintenanceService } from './application/admin/services/source-reader-maintenance.service.js';
import { StandardAuthenticationService } from './application/admin/services/standard-authentication.service.js';
import {
  CancelAuthChallengeUseCase,
  GetAuthChallengeUseCase,
  ListAuthChallengesUseCase,
  RespondAuthChallengeUseCase
} from './application/admin/use-cases/auth-challenges/manage-auth-challenges.usecase.js';
import {
  CreateCredentialUseCase,
  DeleteCredentialUseCase,
  ListCredentialsUseCase,
  LoginCredentialUseCase,
  LogoutCredentialUseCase,
  TestCredentialUseCase,
  UpdateCredentialSecretUseCase
} from './application/admin/use-cases/credentials/manage-credentials.usecase.js';
import {
  CreateNetworkProfileUseCase,
  DeleteNetworkProfileUseCase,
  ListNetworkProfilesUseCase,
  TestNetworkProfileUseCase,
  UpdateNetworkProfileUseCase
} from './application/admin/use-cases/network/manage-network-profiles.usecase.js';
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
} from './application/admin/use-cases/plugins/manage-source-plugins.usecase.js';
import { CandidateResolver } from './application/services/candidate-resolver.js';
import { HealthFallbackPolicy } from './application/services/health-fallback.policy.js';
import { InvocationCoordinator } from './application/services/invocation-coordinator.js';
import { PaginationCoordinator } from './application/services/pagination-coordinator.js';
import { ReaderCachePolicy } from './application/services/reader-cache-policy.js';
import { RuntimeContextResolverService } from './application/services/runtime-context-resolver.service.js';
import { SourceRequestGateService } from './application/services/source-request-gate.service.js';
import { BoundedSourceReaderStructuredLogger } from './application/services/source-reader-structured-logger.js';
import { SourceResultValidator } from './application/services/source-result-validator.js';
import { SourceReaderFacade } from './application/source-reader.facade.js';
import { SOURCE_READER_HOST_COMPATIBILITY } from './domain/plugin/source-reader-host-compatibility.js';
import { BrowserRuntimeCoordinator } from './infrastructure/browser/browser-runtime.coordinator.js';
import { SourceReaderBackupContributor } from './infrastructure/backup/source-reader-backup.contributor.js';
import { sourceReaderMigrations } from './infrastructure/migrations/001-source-reader-schema.js';
import { NetworkRouteResolver } from './infrastructure/network/network-route.resolver.js';
import { InMemorySourceRateLimiterService } from './infrastructure/network/in-memory-source-rate-limiter.service.js';
import { ProxyAgentFactory } from './infrastructure/network/proxy-agent.factory.js';
import {
  AxiosRobotsTextClient,
  RobotsTxtAccessPolicyAdapter
} from './infrastructure/network/robots-txt-access-policy.adapter.js';
import { RouteAwareHttpClientAdapter } from './infrastructure/network/route-aware-http-client.adapter.js';
import { novelCoolPlugin } from './infrastructure/plugins/built-in/novelcool/novelcool.plugin.js';
import {
  ExternalPluginLoader,
  inspectInstalledPluginPackage
} from './infrastructure/plugins/package-loader/external-plugin.loader.js';
import { SourcePluginPackageVerifier } from './infrastructure/plugins/package-loader/source-plugin-package.verifier.js';
import { StaticTrustStore } from './infrastructure/plugins/package-loader/static-trust.store.js';
import { InMemoryPluginRegistry } from './infrastructure/plugins/registry/in-memory-plugin.registry.js';
import { CheerioHtmlParserAdapter } from './infrastructure/runtime/cheerio-html-parser.adapter.js';
import { ExternalProcessSupervisor } from './infrastructure/runtime/external-process/external-process-supervisor.js';
import { HmacCursorCodec } from './infrastructure/runtime/hmac-cursor.codec.js';
import { InProcessPluginRuntime } from './infrastructure/runtime/in-process/in-process-plugin.runtime.js';
import { PipelinePluginRegistryAdapter } from './infrastructure/runtime/pipeline-plugin-registry.adapter.js';
import { PipelineRuntimeContextAdapter } from './infrastructure/runtime/pipeline-runtime-context.adapter.js';
import { PipelineSourceReaderInvocationAdapter } from './infrastructure/runtime/pipeline-source-reader-invocation.adapter.js';
import { PluginContextFactory } from './infrastructure/runtime/plugin-context.factory.js';
import { RuntimeRouter } from './infrastructure/runtime/runtime-router.js';
import { SANDBOX_PROTOCOL_VERSION } from './infrastructure/runtime/external-process/sandbox-protocol.js';
import { LocalEncryptedVault } from './infrastructure/secrets/local-encrypted.vault.js';
import { PipelinePluginHealthAdapter } from './infrastructure/sqlite/pipeline-plugin-health.adapter.js';
import { SqliteAuthChallengeRepository } from './infrastructure/sqlite/sqlite-auth-challenge.repository.js';
import { SqliteCredentialRepository } from './infrastructure/sqlite/sqlite-credential.repository.js';
import { SqliteNetworkProfileRepository } from './infrastructure/sqlite/sqlite-network-profile.repository.js';
import { SqlitePluginHealthRepository } from './infrastructure/sqlite/sqlite-plugin-health.repository.js';
import { SqlitePluginStore } from './infrastructure/sqlite/sqlite-plugin.store.js';
import { SqliteReaderCache } from './infrastructure/sqlite/sqlite-reader.cache.js';
import { SqliteSessionRepository } from './infrastructure/sqlite/sqlite-session.repository.js';
import { SourceReaderAdminController } from './presentation/source-reader-admin.controller.js';
import { SourceReaderController } from './presentation/source-reader.controller.js';
import type { SourceReaderApi, SourceReaderManagementApi } from './public/source-reader.api.js';

interface SourceReaderModuleOptions {
  database: SqliteDatabase;
  environment: Environment;
  clock: { now(): Date };
  logger: { error(message: string, metadata?: Record<string, unknown>): void };
}

export function createSourceReaderModule(options: SourceReaderModuleOptions) {
  const { database, environment, clock } = options;
  const requestTimeoutMs = environment.requestTimeoutMs ?? 15_000;
  const processStartTimeoutMs = environment.sourceReaderExternalProcessStartTimeoutMs ?? 10_000;
  const violationThreshold = environment.sourceReaderPluginPolicyViolationThreshold ?? 3;
  const ids = { randomId: randomUUID };
  const hostLogger = {
    info() {},
    warn() {},
    error(message: string) {
      options.logger.error(message);
    }
  };
  const structuredLogger = new BoundedSourceReaderStructuredLogger(hostLogger);

  const registry = new InMemoryPluginRegistry();
  registry.register(novelCoolPlugin, {
    trustLevel: 'built-in',
    executionMode: 'in-process',
    enabled: true
  });

  const vault = new LocalEncryptedVault(environment.sourceReaderMasterKey);
  const credentials = new SqliteCredentialRepository(database, vault);
  const networks = new SqliteNetworkProfileRepository(database, vault);
  const sessions = new SqliteSessionRepository(database, vault);
  const challenges = new SqliteAuthChallengeRepository(database, vault);
  const pluginStore = new SqlitePluginStore(database);
  const healthRepository = new SqlitePluginHealthRepository(database);
  const pluginHealth = new PluginHealthService(healthRepository, clock, ids, {
    pluginStore,
    registry,
    threshold: violationThreshold
  });
  const externalSupervisor = new ExternalProcessSupervisor({
    startupTimeoutMs: processStartTimeoutMs,
    cancelGraceMs: 100,
    structuredLogger,
    onOutputPolicyViolation: (input) => pluginHealth.recordPolicyViolation(input)
  });
  const externalRegistrationFactory = new ExternalPluginRegistrationFactory({
    supervisor: externalSupervisor,
    timeoutMs: requestTimeoutMs,
    now: () => clock.now(),
    randomId: () => ids.randomId(),
    protocolVersion: SANDBOX_PROTOCOL_VERSION
  });
  const externalLoader = new ExternalPluginLoader(pluginStore, externalRegistrationFactory);
  const compatibility = new PluginCompatibilityService(SOURCE_READER_HOST_COMPATIBILITY);
  const installer = new PluginInstallationService(
    new SourcePluginPackageVerifier(
      new StaticTrustStore(environment.sourceReaderTrustedKeys ?? [])
    ),
    pluginStore,
    environment.sourceReaderPluginDir ?? './apps/api/storage/source-plugins',
    ids,
    clock,
    compatibility
  );
  const pluginActivation = new PluginActivationService(
    pluginStore,
    registry,
    externalSupervisor,
    externalRegistrationFactory,
    clock,
    ids,
    requestTimeoutMs
  );
  const externalRevalidation = new ExternalPluginRevalidationService(
    pluginStore,
    { inspect: inspectInstalledPluginPackage },
    compatibility,
    pluginActivation
  );

  const cache = new SqliteReaderCache(database);
  const routes = new NetworkRouteResolver(networks);
  const requestGate = new SourceRequestGateService(
    new RobotsTxtAccessPolicyAdapter({
      http: new AxiosRobotsTextClient(),
      sourceAllowlist: environment.sourceAllowlist,
      defaultCrawlDelayMs: environment.crawlerDelayMs,
      requestTimeoutMs,
      now: () => clock.now().getTime()
    }),
    new InMemorySourceRateLimiterService()
  );
  const http = new RouteAwareHttpClientAdapter(new ProxyAgentFactory(20), {
    requestTimeoutMs,
    requestGate
  });
  const diagnosticHttp = new RouteAwareHttpClientAdapter(new ProxyAgentFactory(4), {
    requestTimeoutMs
  });
  const runtimeContexts = new RuntimeContextResolverService(
    credentials,
    networks,
    sessions,
    routes
  );
  const pluginContexts = new PluginContextFactory(
    http,
    new CheerioHtmlParserAdapter(),
    clock,
    structuredLogger,
    sessions
  );
  const browser = new BrowserRuntimeCoordinator({
    browserExecutablePath: environment.sourceReaderBrowserExecutable,
    requestGate,
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
  const invalidation = new SourceReaderInvalidationService(sessions, browser, [cache]);
  const challengeService = new AuthChallengeService(
    challenges,
    browser,
    registry,
    sessions,
    pluginContexts,
    ids,
    clock,
    async (networkProfileId) => {
      if (!networkProfileId) return 'direct';
      return (await routes.resolve(await networks.requireHandle(networkProfileId))).identity;
    }
  );
  const authentication = new AuthenticationOrchestratorService(
    credentials,
    sessions,
    new StandardAuthenticationService(),
    http,
    ids,
    clock,
    registry,
    pluginContexts,
    challengeService,
    routes,
    invalidation
  );
  const maintenance = new SourceReaderMaintenanceService(cache, sessions, challengeService, () =>
    clock.now()
  );

  const pipelineHealth = new PipelinePluginHealthAdapter(
    healthRepository,
    clock,
    () => ids.randomId(),
    { plugins: pluginStore, registry }
  );
  const runtime = new RuntimeRouter(
    new InProcessPluginRuntime(),
    externalSupervisor,
    requestTimeoutMs
  );
  const api = new SourceReaderFacade({
    requestGate,
    candidates: new CandidateResolver(new PipelinePluginRegistryAdapter(registry)),
    contexts: new PipelineRuntimeContextAdapter(runtimeContexts),
    cache: new ReaderCachePolicy(cache, clock),
    invocation: new InvocationCoordinator(
      new PipelineSourceReaderInvocationAdapter({
        registry,
        runtime,
        contextFactory: pluginContexts,
        browser
      })
    ),
    pagination: new PaginationCoordinator(
      new HmacCursorCodec(
        Buffer.from(
          (
            environment.sourceReaderCursorKey ??
            'development-only-source-reader-cursor-key-32-bytes'
          )
            .padEnd(32, '0')
            .slice(0, 32)
        ),
        clock
      ),
      clock
    ),
    health: new HealthFallbackPolicy(pipelineHealth, clock),
    validator: new SourceResultValidator()
  }) satisfies SourceReaderApi;

  const authorization = new SourceReaderAuthorizationPolicy();
  const diagnostics = new PluginDiagnosticsService(
    pluginStore,
    registry,
    SOURCE_READER_HOST_COMPATIBILITY,
    { processStartTimeoutMs, violationThreshold }
  );
  const healthCheck = new PluginHealthCheckService(diagnostics, registry, clock);
  const networkTester = new NetworkRouteTester(
    networks,
    routes,
    diagnosticHttp,
    clock,
    environment.sourceReaderNetworkDiagnosticUrl ?? 'https://example.com/',
    requestTimeoutMs
  );
  const loginDependencies = {
    authentication,
    credentials,
    plugins: pluginStore,
    networks
  };
  const management = {
    plugins: {
      list: new ListPluginsUseCase(authorization, pluginStore),
      install: new InstallSourcePluginUseCase(authorization, installer),
      approvePermissions: new ApprovePluginPermissionsUseCase(authorization, pluginStore, clock),
      denyPermissions: new DenyPluginPermissionsUseCase(
        authorization,
        pluginStore,
        pluginActivation,
        invalidation
      ),
      listPermissions: new ListPluginPermissionsUseCase(authorization, pluginStore),
      enable: new EnablePluginUseCase(authorization, pluginActivation, invalidation),
      disable: new DisablePluginUseCase(authorization, pluginActivation, invalidation),
      remove: new RemovePluginUseCase(authorization, pluginActivation, pluginStore, invalidation),
      test: new TestPluginUseCase(authorization, healthCheck),
      health: new GetPluginHealthUseCase(authorization, diagnostics),
      diagnostics: new GetPluginDiagnosticsUseCase(authorization, diagnostics)
    },
    credentials: {
      create: new CreateCredentialUseCase(authorization, credentials, ids, clock),
      list: new ListCredentialsUseCase(authorization, credentials),
      updateSecret: new UpdateCredentialSecretUseCase(
        authorization,
        credentials,
        sessions,
        clock,
        invalidation
      ),
      remove: new DeleteCredentialUseCase(authorization, credentials, sessions, invalidation),
      login: new LoginCredentialUseCase(authorization, loginDependencies),
      logout: new LogoutCredentialUseCase(authorization, credentials, authentication),
      test: new TestCredentialUseCase(authorization, loginDependencies)
    },
    networkProfiles: {
      create: new CreateNetworkProfileUseCase(authorization, networks, ids, clock),
      list: new ListNetworkProfilesUseCase(authorization, networks),
      update: new UpdateNetworkProfileUseCase(authorization, networks, clock, invalidation),
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
    name: 'source-reader',
    migrations: sourceReaderMigrations,
    api,
    backup: new SourceReaderBackupContributor(database),
    management,
    presentation: {
      reader: new SourceReaderController(api),
      admin: new SourceReaderAdminController(management),
      actorOptions: {
        localAdminEnabled: environment.sourceReaderLocalAdmin ?? false,
        trustRoleHeaders: environment.sourceReaderTrustRoleHeaders ?? false
      }
    },
    async start() {
      registry.replaceExternal(await externalLoader.loadActive());
      await externalRevalidation.revalidateAll(new AbortController().signal);
      maintenance.start();
    },
    async stop() {
      await pluginActivation.stopAll();
      await maintenance.stop();
      http.destroy();
      diagnosticHttp.destroy();
    }
  };
}

export type SourceReaderModule = ReturnType<typeof createSourceReaderModule>;
