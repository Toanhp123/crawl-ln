import type { BrowserSessionHandle } from './browser-runtime.port.js';
import type { PluginContext } from '../../domain/plugin/source-plugin.js';
import type { ResolvedRuntimeContext } from './runtime-context-resolver.port.js';

export interface PluginContextFactoryPort {
  create(input: {
    requestId?: string;
    pluginId: string;
    pluginVersion?: string;
    capability?: string;
    allowedHosts: string[];
    signal: AbortSignal;
    runtimeContext: ResolvedRuntimeContext;
    browserSession?: BrowserSessionHandle;
  }): PluginContext;
}
