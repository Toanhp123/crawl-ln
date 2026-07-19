import type { RegisteredPlugin } from './plugin-registry.port.js';
import type { PluginContext, PluginOperationResult } from '../../domain/plugin/source-plugin.js';
import type { SourceCapability } from '../../public/source-reader.models.js';

export interface PluginInvocation {
  registration: RegisteredPlugin;
  capability: SourceCapability;
  request: Record<string, unknown>;
  context: PluginContext;
}

export interface PluginRuntimePort {
  invoke(invocation: PluginInvocation): Promise<PluginOperationResult<unknown>>;
}
