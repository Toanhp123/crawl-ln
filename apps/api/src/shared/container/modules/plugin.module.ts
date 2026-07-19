import { join } from 'node:path';
import {
  ListSourcePluginsUseCase,
  ReloadSourcePluginsUseCase,
  SetSourcePluginEnabledUseCase
} from '../../../modules/plugin/application/use-cases/manage-source-plugins.usecase.js';
import { DynamicSourcePluginRegistry } from '../../../modules/plugin/infrastructure/runtime/dynamic-source-plugin.registry.js';
import { SourcePluginController } from '../../../modules/plugin/presentation/controllers/source-plugin.controller.js';
import { AxiosHttpClientAdapter } from '../../infrastructure/http/axios-http-client.adapter.js';
import { CheerioHtmlParserAdapter } from '../../infrastructure/html/cheerio-html-parser.adapter.js';
import { env } from '../../config/env.js';
import type { InfrastructureModule } from './infrastructure.module.js';
import type { PluginApi, PluginLifecycle } from '../../../modules/plugin/public/plugin.api.js';
export function createPluginModule(infrastructure: InfrastructureModule) {
  const registry = new DynamicSourcePluginRegistry(
    env.sourcesDir,
    join(env.storageDir, 'plugin-state.json'),
    new AxiosHttpClientAdapter(),
    new CheerioHtmlParserAdapter(),
    infrastructure.clock,
    infrastructure.logger
  );
  const api = { registry } satisfies PluginApi;
  const lifecycle = registry satisfies PluginLifecycle;
  return {
    api,
    presentation: {
      controller: new SourcePluginController(
        new ListSourcePluginsUseCase(registry),
        new ReloadSourcePluginsUseCase(registry),
        new SetSourcePluginEnabledUseCase(registry),
        infrastructure.realtime
      )
    },
    lifecycle
  };
}
export type PluginModule = ReturnType<typeof createPluginModule>;
