import type { BrowserRuntimePort } from '../../application/ports/browser-runtime.port.js';
import type { PluginContextFactoryPort } from '../../application/ports/plugin-context-factory.port.js';
import type { PluginRegistryPort } from '../../application/ports/plugin-registry.port.js';
import type { PluginRuntimePort } from '../../application/ports/plugin-runtime.port.js';
import type { ResolvedRuntimeContext } from '../../application/ports/runtime-context-resolver.port.js';
import type {
  SourceReaderInvocationPort,
  SourceReaderOperationResult
} from '../../application/source-reader.ports.js';
import { SourceReaderError } from '../../domain/errors/source-reader.error.js';

interface PipelineSourceReaderInvocationOptions {
  registry: PluginRegistryPort;
  runtime: PluginRuntimePort;
  contextFactory: PluginContextFactoryPort;
  browser?: BrowserRuntimePort;
}

function isResolvedRuntimeContext(value: unknown): value is ResolvedRuntimeContext {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'resolvedNetworkRoute' in value &&
    'cacheIdentity' in value
  );
}

export class PipelineSourceReaderInvocationAdapter implements SourceReaderInvocationPort {
  constructor(private readonly options: PipelineSourceReaderInvocationOptions) {}

  async invoke(
    input: Parameters<SourceReaderInvocationPort['invoke']>[0]
  ): Promise<SourceReaderOperationResult> {
    const registration = this.options.registry.findById(input.candidate.pluginId);
    if (
      !registration ||
      registration.plugin.manifest.version !== input.candidate.pluginVersion ||
      !registration.enabled
    ) {
      throw new SourceReaderError('PLUGIN_UNAVAILABLE', 'Plugin registration is unavailable', {
        retryable: true,
        fallbackAllowed: true,
        details: {
          pluginId: input.candidate.pluginId,
          pluginVersion: input.candidate.pluginVersion
        }
      });
    }
    if (!isResolvedRuntimeContext(input.context.runtime)) {
      throw new SourceReaderError(
        'SOURCE_READER_INTERNAL_ERROR',
        'Resolved plugin runtime context is unavailable',
        { retryable: false, fallbackAllowed: false }
      );
    }

    const signal = input.signal ?? new AbortController().signal;
    const runtimeContext = input.context.runtime;
    const browserSession = runtimeContext.browserRequired
      ? await this.openBrowser(input, runtimeContext, signal)
      : undefined;
    const context = this.options.contextFactory.create({
      requestId: input.context.requestId,
      pluginId: input.candidate.pluginId,
      pluginVersion: input.candidate.pluginVersion,
      capability: input.capability,
      allowedHosts:
        input.candidate.allowedHosts ?? registration.plugin.manifest.permissions.network.hosts,
      signal,
      runtimeContext,
      browserSession
    });
    return this.options.runtime.invoke({
      registration,
      capability: input.capability,
      request: input.request,
      context,
      timeoutMs: input.timeoutMs
    });
  }

  private async openBrowser(
    input: Parameters<SourceReaderInvocationPort['invoke']>[0],
    runtimeContext: ResolvedRuntimeContext,
    signal: AbortSignal
  ) {
    if (!this.options.browser) {
      throw new SourceReaderError(
        'PLUGIN_PERMISSION_DENIED',
        'Plugin requires an unavailable browser runtime',
        { retryable: false, fallbackAllowed: true }
      );
    }
    return this.options.browser.open({
      identity: {
        userId: input.context.cacheIdentity.user,
        pluginId: input.candidate.pluginId,
        pluginVersion: input.candidate.pluginVersion,
        sourceAccountId:
          runtimeContext.credential?.id ??
          `anonymous:${input.context.cacheIdentity.user ?? 'public'}`,
        credentialId: runtimeContext.credential?.id,
        sessionId: runtimeContext.session?.id,
        networkRouteId: runtimeContext.networkRoute?.id,
        networkIdentity: runtimeContext.resolvedNetworkRoute.identity
      },
      allowedHosts: input.candidate.allowedHosts ?? [],
      route: runtimeContext.resolvedNetworkRoute,
      signal
    });
  }
}
