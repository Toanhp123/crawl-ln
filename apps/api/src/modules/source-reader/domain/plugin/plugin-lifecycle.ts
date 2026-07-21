import type {
  PluginHealthResult,
  PluginLifecycleContext,
  PluginShutdownReason
} from '@novel-tool/source-plugin-sdk';

export type {
  PluginHealthResult,
  PluginLifecycleContext,
  PluginShutdownReason
} from '@novel-tool/source-plugin-sdk';

export interface PluginLifecycle {
  initialize(context: PluginLifecycleContext): Promise<void>;
  healthCheck(): Promise<PluginHealthResult>;
  shutdown(reason: PluginShutdownReason): Promise<void>;
}

export interface PluginActivationResult {
  pluginId: string;
  version: string;
  status: 'active' | 'installed' | 'quarantined';
  warnings: Array<{ code: string; message: string }>;
}
