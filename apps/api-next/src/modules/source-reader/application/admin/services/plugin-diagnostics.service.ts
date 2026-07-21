import type { PluginRegistryPort } from '../../ports/plugin-registry.port.js';
import type { PluginStorePort } from '../../ports/plugin-store.port.js';
import { SourceReaderError } from '../../../domain/errors/source-reader.error.js';
import type { SourceReaderHostCompatibility } from '../../../domain/plugin/source-reader-host-compatibility.js';
import type { SourceReaderPluginDiagnostics } from '../../../public/source-reader.api.js';

export class PluginDiagnosticsService {
  constructor(
    private readonly store: Pick<
      PluginStorePort,
      'listInstalled' | 'findVersion' | 'findLatestVersion'
    >,
    private readonly registry: Pick<PluginRegistryPort, 'findById'>,
    private readonly compatibility: SourceReaderHostCompatibility,
    private readonly policy: {
      processStartTimeoutMs: number;
      violationThreshold: number;
    }
  ) {}

  async describePlugin(pluginId: string): Promise<SourceReaderPluginDiagnostics> {
    const installed = (await this.store.listInstalled()).find(
      (candidate) => candidate.pluginId === pluginId
    );
    if (!installed) {
      throw new SourceReaderError('PLUGIN_UNAVAILABLE', 'Plugin is unavailable', {
        retryable: false,
        fallbackAllowed: false
      });
    }

    const version = installed.activeVersion
      ? await this.store.findVersion(pluginId, installed.activeVersion)
      : await this.store.findLatestVersion(pluginId);
    const registration = this.registry.findById(pluginId);
    return {
      pluginId,
      ...(installed.activeVersion ? { activeVersion: installed.activeVersion } : {}),
      status: installed.status,
      lifecycleState: registration ? 'running' : installed.status,
      runtimeVersion: this.compatibility.runtimeVersion,
      sandboxProtocolVersion: version?.sandboxProtocolVersion ?? 1,
      compatibilityIssues: version?.compatibilityIssues ?? [],
      policy: this.policy
    };
  }
}
