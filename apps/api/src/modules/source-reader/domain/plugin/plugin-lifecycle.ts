export interface PluginLifecycleContext {
  pluginId: string;
  pluginVersion: string;
  protocolVersion: number;
  now: string;
}

export type PluginShutdownReason = 'upgrade' | 'disable' | 'quarantine' | 'application-stop';

export interface PluginHealthResult {
  status: 'healthy' | 'degraded';
  details?: Record<string, string>;
}

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
