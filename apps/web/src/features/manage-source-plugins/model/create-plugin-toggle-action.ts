import type { QueryClient } from '@tanstack/react-query';
import {
  sourcePluginInvalidation,
  sourcePluginKeys,
  type SourcePlugin
} from '../../../entities/source-plugin';
import { disableSourcePlugin, enableSourcePlugin } from '../api/manage-source-plugins';

export interface PluginToggleInput {
  pluginId: string;
  version: string;
  enabled: boolean;
}
export interface PluginToggleDependencies {
  enable(pluginId: string, version: string): Promise<unknown>;
  disable(pluginId: string): Promise<unknown>;
}

export function createPluginToggleAction(
  dependencies: PluginToggleDependencies = {
    enable: enableSourcePlugin,
    disable: disableSourcePlugin
  }
) {
  return {
    async execute(client: QueryClient, input: PluginToggleInput): Promise<void> {
      const key = sourcePluginKeys.list();
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<SourcePlugin[]>(key);
      client.setQueryData<SourcePlugin[]>(key, (plugins = []) =>
        plugins.map((plugin) =>
          plugin.id === input.pluginId
            ? {
                ...plugin,
                enabled: input.enabled,
                status: input.enabled ? 'initializing' : 'disabled'
              }
            : plugin
        )
      );
      try {
        if (input.enabled) {
          await dependencies.enable(input.pluginId, input.version);
        } else {
          await dependencies.disable(input.pluginId);
        }
      } catch (error) {
        if (previous) client.setQueryData(key, previous);
        throw error;
      } finally {
        await sourcePluginInvalidation.invalidateAll(client);
      }
    }
  };
}
