import type { RuntimeContextResolverPort } from '../../application/ports/runtime-context-resolver.port.js';
import type {
  SourceReaderRuntimeContext,
  SourceReaderRuntimeContextPort
} from '../../application/source-reader.ports.js';

export class PipelineRuntimeContextAdapter implements SourceReaderRuntimeContextPort {
  constructor(private readonly resolver: RuntimeContextResolverPort) {}

  async resolve(
    input: Parameters<SourceReaderRuntimeContextPort['resolve']>[0]
  ): Promise<SourceReaderRuntimeContext> {
    const resolved = await this.resolver.resolve({
      userId: input.request.userId,
      pluginId: input.candidate.pluginId,
      pluginVersion: input.candidate.pluginVersion,
      domain: input.candidate.domain,
      capability: input.capability,
      credentialProfileId: input.request.credentialProfileId,
      networkProfileId: input.request.networkProfileId,
      executionMode: input.candidate.executionMode,
      runtimeRequirements: input.candidate.runtimeRequirements,
      requiresBrowser: input.candidate.requiresBrowser
    });
    return {
      cacheIdentity: resolved.cacheIdentity,
      credentialId: resolved.credential?.id,
      sessionId: resolved.session?.id,
      networkProfileId: resolved.networkRoute?.id,
      browserRequired: resolved.browserRequired,
      requestId: input.request.requestId,
      runtime: resolved
    };
  }
}
