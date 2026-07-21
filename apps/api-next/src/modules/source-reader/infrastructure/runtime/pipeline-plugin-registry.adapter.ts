import type { PluginRegistryPort } from '../../application/ports/plugin-registry.port.js';
import type {
  ExecutableSourceCapability,
  SourceReaderCandidate,
  SourceReaderCandidateRegistryPort
} from '../../application/source-reader.ports.js';
import { matcherAccepts } from '../../application/services/plugin-matcher.js';

export class PipelinePluginRegistryAdapter implements SourceReaderCandidateRegistryPort {
  constructor(private readonly registry: PluginRegistryPort) {}

  async listCandidates(input: {
    url: string;
    capability: ExecutableSourceCapability;
  }): Promise<SourceReaderCandidate[]> {
    const candidates = await this.registry.listCandidates(input);
    return candidates.map((candidate) => {
      const manifest = candidate.plugin.manifest;
      return {
        pluginId: manifest.id,
        pluginVersion: manifest.version,
        domain: candidate.domain,
        normalizedUrl: candidate.normalizedUrl,
        priority: candidate.priority,
        trustLevel: candidate.trustLevel === 'built-in' ? 'built-in' : 'external',
        executionMode: candidate.executionMode,
        contractVersion: Number(manifest.contracts[input.capability]),
        extensionContractVersions: Object.fromEntries(
          Object.entries(candidate.activatedExtensionContracts ?? {}).map(
            ([namespace, contract]) => [namespace, contract.version]
          )
        ),
        extensionContracts: candidate.activatedExtensionContracts,
        allowedHosts: manifest.permissions.network.hosts,
        runtimeRequirements: manifest.runtimeRequirements,
        requiresBrowser: manifest.runtime.requiresBrowser
      };
    });
  }

  async hasAnyCandidate(url: string): Promise<boolean> {
    for (const registration of this.registry.snapshot().values()) {
      if (!registration.enabled) continue;
      for (const capability of registration.plugin.manifest.capabilities) {
        if (capability === 'authentication') continue;
        if (
          registration.plugin.manifest.matchers.some((matcher) =>
            matcherAccepts(matcher, { url, capability })
          )
        ) {
          return true;
        }
      }
    }
    return false;
  }
}
