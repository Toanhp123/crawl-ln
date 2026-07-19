import { SourceReaderService } from '../../../modules/source-reader/application/services/source-reader.service.js';
import { MemoryReaderCache } from '../../../modules/source-reader/infrastructure/cache/memory-reader.cache.js';
import { SqliteReaderCache } from '../../../modules/source-reader/infrastructure/cache/sqlite-reader.cache.js';
import { TieredReaderCache } from '../../../modules/source-reader/infrastructure/cache/tiered-reader.cache.js';
import { HmacCursorCodec } from '../../../modules/source-reader/infrastructure/cursor/hmac-cursor.codec.js';
import { novelCoolPlugin } from '../../../modules/source-reader/infrastructure/plugins/built-in/novelcool/novelcool.plugin.js';
import { InMemoryPluginRegistry } from '../../../modules/source-reader/infrastructure/plugins/registry/in-memory-plugin.registry.js';
import { InProcessPluginRuntime } from '../../../modules/source-reader/infrastructure/runtime/in-process/in-process-plugin.runtime.js';
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

  const cache = new TieredReaderCache(
    new MemoryReaderCache(env.sourceReaderMemoryCacheEntries),
    new SqliteReaderCache(infrastructure.database)
  );

  const api = new SourceReaderService(
    registry,
    new InProcessPluginRuntime(),
    new PluginContextFactory(
      new AxiosHttpClientAdapter(),
      new CheerioHtmlParserAdapter(),
      infrastructure.clock,
      infrastructure.logger
    ),
    cache,
    new HmacCursorCodec(Buffer.from(env.sourceReaderCursorKey.padEnd(32, '0').slice(0, 32))),
    infrastructure.clock
  ) satisfies SourceReaderApi;

  return {
    api,
    presentation: { controller: new SourceReaderController(api) },
    lifecycle: {
      async start() {},
      async stop() {}
    }
  };
}

export type SourceReaderModule = ReturnType<typeof createSourceReaderModule>;
