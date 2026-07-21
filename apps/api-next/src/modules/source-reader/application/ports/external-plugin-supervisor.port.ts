import type { PluginContext } from '../../domain/plugin/source-plugin.js';

export type ExternalPluginOperation =
  | 'initialize'
  | 'healthCheck'
  | 'shutdown'
  | 'probeCanHandle'
  | 'login'
  | 'resumeChallenge'
  | 'invokeCapability';

export interface ExternalPluginRequest {
  requestId: string;
  operation: ExternalPluginOperation;
  deadlineAt: string;
  payload: Record<string, unknown>;
}

export interface ExternalPluginHostBridge {
  context?: PluginContext;
}

export interface ExternalPluginProcessHandle {
  pluginId: string;
  pluginVersion: string;
  request(
    request: ExternalPluginRequest,
    signal: AbortSignal,
    host?: ExternalPluginHostBridge
  ): Promise<unknown>;
  terminate(reason: string): Promise<void>;
}

export interface ExternalPluginSupervisorPort {
  start(input: {
    pluginId: string;
    pluginVersion: string;
    packageRoot: string;
    entryPath: string;
  }): Promise<ExternalPluginProcessHandle>;
  get(pluginId: string, pluginVersion: string): ExternalPluginProcessHandle | undefined;
  stop(pluginId: string, pluginVersion: string, reason: string): Promise<void>;
}
