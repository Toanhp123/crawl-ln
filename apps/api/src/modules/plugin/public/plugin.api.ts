import type { SourcePluginRegistryPort } from '../application/ports/source-plugin-registry.port.js';

export interface PluginApi {
  readonly registry: SourcePluginRegistryPort;
}

export interface PluginLifecycle {
  start(): Promise<void>;
  stop(): Promise<void>;
}
