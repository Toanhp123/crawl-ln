import type { PluginStorePort, StoredPluginVersion } from '../../ports/plugin-store.port.js';
import type { PluginCompatibilityService } from './plugin-compatibility.service.js';
import type { PluginActivationService } from './plugin-activation.service.js';

export interface ExternalPluginRevalidationResult {
  pluginId: string;
  version: string;
  status: 'active' | 'installed-pending-revalidation' | 'quarantined';
  reasonCode?: string;
}

interface RevalidationStore extends Pick<
  PluginStorePort,
  'listPendingRevalidation' | 'quarantine'
> {}

interface InstalledPackageInspector {
  inspect(version: StoredPluginVersion): Promise<ReadonlyMap<string, Uint8Array>>;
}

interface CompatibilityEvaluator {
  evaluate(
    manifest: StoredPluginVersion['manifest'],
    files: ReadonlyMap<string, Uint8Array>
  ): ReturnType<PluginCompatibilityService['evaluate']>;
}

interface CandidateActivator {
  activate(input: {
    pluginId: string;
    version: string;
    signal: AbortSignal;
  }): ReturnType<PluginActivationService['activate']>;
}

export class ExternalPluginRevalidationService {
  constructor(
    private readonly store: RevalidationStore,
    private readonly inspector: InstalledPackageInspector,
    private readonly compatibility: CompatibilityEvaluator,
    private readonly activation: CandidateActivator
  ) {}

  async revalidateAll(signal: AbortSignal): Promise<ExternalPluginRevalidationResult[]> {
    const results: ExternalPluginRevalidationResult[] = [];
    for (const candidate of await this.store.listPendingRevalidation()) {
      if (signal.aborted) throw signal.reason ?? new Error('Plugin revalidation aborted');
      let files: ReadonlyMap<string, Uint8Array>;
      try {
        files = await this.inspector.inspect(candidate);
      } catch {
        await this.store.quarantine(
          candidate.pluginId,
          candidate.version,
          'PLUGIN_PACKAGE_INVALID'
        );
        results.push({
          pluginId: candidate.pluginId,
          version: candidate.version,
          status: 'quarantined',
          reasonCode: 'PLUGIN_PACKAGE_INVALID'
        });
        continue;
      }

      const report = this.compatibility.evaluate(candidate.manifest, files);
      const fatal = report.issues.find((issue) => issue.severity === 'fatal');
      if (fatal) {
        await this.store.quarantine(candidate.pluginId, candidate.version, fatal.code);
        results.push({
          pluginId: candidate.pluginId,
          version: candidate.version,
          status: 'quarantined',
          reasonCode: fatal.code
        });
        continue;
      }

      try {
        await this.activation.activate({
          pluginId: candidate.pluginId,
          version: candidate.version,
          signal
        });
        results.push({
          pluginId: candidate.pluginId,
          version: candidate.version,
          status: 'active'
        });
      } catch {
        results.push({
          pluginId: candidate.pluginId,
          version: candidate.version,
          status: 'installed-pending-revalidation',
          reasonCode: 'PLUGIN_LIFECYCLE_FAILED'
        });
      }
    }
    return results;
  }
}
