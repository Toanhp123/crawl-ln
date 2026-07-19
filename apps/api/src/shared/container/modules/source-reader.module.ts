import { RuntimeContextResolverService } from '../../../modules/source-reader/application/services/runtime-context-resolver.service.js';
import { SourceReaderMaintenanceService } from '../../../modules/source-reader/application/services/source-reader-maintenance.service.js';
import { SourceReaderService } from '../../../modules/source-reader/application/services/source-reader.service.js';
import { MemoryReaderCache } from '../../../modules/source-reader/infrastructure/cache/memory-reader.cache.js';
import { SqliteReaderCache } from '../../../modules/source-reader/infrastructure/cache/sqlite-reader.cache.js';
import { TieredReaderCache } from '../../../modules/source-reader/infrastructure/cache/tiered-reader.cache.js';
import { HmacCursorCodec } from '../../../modules/source-reader/infrastructure/cursor/hmac-cursor.codec.js';
import { novelCoolPlugin } from '../../../modules/source-reader/infrastructure/plugins/built-in/novelcool/novelcool.plugin.js';
import { ExternalPluginLoader } from '../../../modules/source-reader/infrastructure/plugins/package-loader/external-plugin.loader.js';
import { InMemoryPluginRegistry } from '../../../modules/source-reader/infrastructure/plugins/registry/in-memory-plugin.registry.js';
import { InProcessPluginRuntime } from '../../../modules/source-reader/infrastructure/runtime/in-process/in-process-plugin.runtime.js';
import { IsolatedWorkerPluginRuntime } from '../../../modules/source-reader/infrastructure/runtime/isolated-worker/isolated-worker-plugin.runtime.js';
import { RuntimeRouter } from '../../../modules/source-reader/infrastructure/runtime/runtime-router.js';
import { LocalEncryptedVault } from '../../../modules/source-reader/infrastructure/secrets/local-encrypted.vault.js';
import { SqliteAuthChallengeRepository } from '../../../modules/source-reader/infrastructure/sqlite/sqlite-auth-challenge.repository.js';
import { SqliteCredentialRepository } from '../../../modules/source-reader/infrastructure/sqlite/sqlite-credential.repository.js';
import { SqliteNetworkProfileRepository } from '../../../modules/source-reader/infrastructure/sqlite/sqlite-network-profile.repository.js';
import { SqlitePluginStore } from '../../../modules/source-reader/infrastructure/sqlite/sqlite-plugin.store.js';
import { SqliteSessionRepository } from '../../../modules/source-reader/infrastructure/sqlite/sqlite-session.repository.js';
import { PluginContextFactory } from '../../../modules/source-reader/infrastructure/runtime/plugin-context.factory.js';
import { SourceReaderController } from '../../../modules/source-reader/presentation/controllers/source-reader.controller.js';
import type { SourceReaderApi } from '../../../modules/source-reader/public/source-reader.api.js';
import { env } from '../../config/env.js';
import { CheerioHtmlParserAdapter } from '../../infrastructure/html/cheerio-html-parser.adapter.js';
import { AxiosHttpClientAdapter } from '../../infrastructure/http/axios-http-client.adapter.js';
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
  const externalLoader = new ExternalPluginLoader(pluginStore);
  const persistentCache = new SqliteReaderCache(infrastructure.database);
  const cache = new TieredReaderCache(
    new MemoryReaderCache(env.sourceReaderMemoryCacheEntries),
    persistentCache
  );
  const runtimeContexts = new RuntimeContextResolverService(credentials, networks, sessions);
  const maintenance = new SourceReaderMaintenanceService(
    persistentCache,
    sessions,
    challenges,
    () => infrastructure.clock.now()
  );

  const api = new SourceReaderService(
    registry,
    new RuntimeRouter(
      new InProcessPluginRuntime(),
      new IsolatedWorkerPluginRuntime({ defaultTimeoutMs: env.requestTimeoutMs })
    ),
    new PluginContextFactory(
      new AxiosHttpClientAdapter(),
      new CheerioHtmlParserAdapter(),
      infrastructure.clock,
      infrastructure.logger
    ),
    cache,
    new HmacCursorCodec(Buffer.from(env.sourceReaderCursorKey.padEnd(32, '0').slice(0, 32))),
    infrastructure.clock,
    runtimeContexts
  ) satisfies SourceReaderApi;

  return {
    api,
    presentation: { controller: new SourceReaderController(api) },
    lifecycle: {
      async start() {
        registry.replaceExternal(await externalLoader.loadActive());
        maintenance.start();
      },
      async stop() {
        await maintenance.stop();
      }
    }
  };
}

export type SourceReaderModule = ReturnType<typeof createSourceReaderModule>;
