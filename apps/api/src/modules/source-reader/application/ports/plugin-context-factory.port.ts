import type { PluginContext } from '../../domain/plugin/source-plugin.js';

export interface PluginContextFactoryPort {
  create(input: { pluginId: string; allowedHosts: string[]; signal: AbortSignal }): PluginContext;
}
