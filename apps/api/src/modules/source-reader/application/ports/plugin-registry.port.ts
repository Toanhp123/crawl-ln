import type { SourceCapability } from '../../public/source-reader.models.js';
import type {
  PluginExecutionMode,
  PluginTrustLevel,
  SourceReaderPlugin
} from '../../domain/plugin/source-plugin.js';

export interface RegisteredPlugin {
  plugin: SourceReaderPlugin;
  trustLevel: PluginTrustLevel;
  executionMode: PluginExecutionMode;
  enabled: boolean;
  packagePath?: string;
}

export interface PluginCandidate extends RegisteredPlugin {
  priority: number;
  normalizedUrl: string;
  domain: string;
}

export interface PluginRegistryPort {
  register(plugin: SourceReaderPlugin, options?: Partial<Omit<RegisteredPlugin, 'plugin'>>): void;
  unregister(pluginId: string): void;
  listCandidates(request: {
    url: string;
    capability: SourceCapability;
  }): Promise<PluginCandidate[]>;
}
