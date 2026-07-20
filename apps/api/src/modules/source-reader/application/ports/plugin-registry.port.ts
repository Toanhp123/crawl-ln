import type { SourceCapability } from '../../public/source-reader.models.js';
import type { ActivatedExtensionContract } from '../services/plugin-extension-validator.js';
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
  activatedExtensionContracts?: Record<string, ActivatedExtensionContract>;
}

export interface PluginCandidate extends RegisteredPlugin {
  priority: number;
  normalizedUrl: string;
  domain: string;
}

export interface PreparedPluginRegistrySnapshot {
  registrations: ReadonlyMap<string, RegisteredPlugin>;
}

export interface PluginRegistryPort {
  register(plugin: SourceReaderPlugin, options?: Partial<Omit<RegisteredPlugin, 'plugin'>>): void;
  unregister(pluginId: string): void;
  findById(pluginId: string): RegisteredPlugin | undefined;
  snapshot(): ReadonlyMap<string, RegisteredPlugin>;
  prepareRegistration(
    snapshot: ReadonlyMap<string, RegisteredPlugin>,
    registration: RegisteredPlugin
  ): PreparedPluginRegistrySnapshot;
  publishPrepared(snapshot: PreparedPluginRegistrySnapshot): void;
  listCandidates(request: {
    url: string;
    capability: SourceCapability;
  }): Promise<PluginCandidate[]>;
}
