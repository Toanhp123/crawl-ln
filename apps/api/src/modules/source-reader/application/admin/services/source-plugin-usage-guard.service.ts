import type { PluginStorePort, StoredPluginVersion } from '../../ports/plugin-store.port.js';
import type {
  SourcePluginUsageOperation,
  SourcePluginUsageQueryPort,
  SourcePluginUsageRecord
} from '../../ports/source-plugin-usage.port.js';
import { matcherAccepts } from '../../services/plugin-matcher.js';

interface BlockingSourcePluginJob {
  jobId: string;
  novelId: string;
  status: string;
}

interface SourcePluginUsageConflictDetails {
  reason: 'SOURCE_PLUGIN_IN_USE';
  operation: SourcePluginUsageOperation;
  pluginId: string;
  blockingJobCount: number;
  blockingJobs: BlockingSourcePluginJob[];
}

class SourcePluginUsageConflictError extends Error {
  readonly kind = 'conflict' as const;

  constructor(readonly details: SourcePluginUsageConflictDetails) {
    const action = details.operation === 'disable' ? 'disabled' : 'removed';
    const jobs = details.blockingJobCount === 1 ? 'crawl job' : 'crawl jobs';
    super(
      [
        `Plugin ${details.pluginId} cannot be ${action} while`,
        `${details.blockingJobCount} ${jobs} still depend on it`
      ].join(' ')
    );
    this.name = 'SourcePluginUsageConflictError';
  }
}

function uniqueVersions(versions: Array<StoredPluginVersion | undefined>): StoredPluginVersion[] {
  const result = new Map<string, StoredPluginVersion>();
  for (const version of versions) {
    if (version) result.set(`${version.pluginId}@${version.version}`, version);
  }
  return [...result.values()];
}

function recordMatchesVersion(
  record: SourcePluginUsageRecord,
  version: StoredPluginVersion
): boolean {
  if (record.unresolved) return true;
  if (!version.manifest.capabilities.includes('chapter-content')) return false;
  return record.sourceUrls.some((url) =>
    version.manifest.matchers.some((matcher) => {
      try {
        return matcherAccepts(matcher, { url, capability: 'chapter-content' });
      } catch {
        return false;
      }
    })
  );
}

export class SourcePluginUsageGuardService {
  constructor(
    private readonly usages: SourcePluginUsageQueryPort,
    private readonly plugins: Pick<PluginStorePort, 'findActive' | 'findLatestVersion'>
  ) {}

  async assertCanDisable(pluginId: string): Promise<void> {
    const active = await this.plugins.findActive(pluginId);
    if (!active) return;
    await this.assertUnused(pluginId, 'disable', [active]);
  }

  async assertCanRemove(pluginId: string): Promise<void> {
    const versions = uniqueVersions(
      await Promise.all([
        this.plugins.findActive(pluginId),
        this.plugins.findLatestVersion(pluginId)
      ])
    );
    if (versions.length === 0) return;
    await this.assertUnused(pluginId, 'remove', versions);
  }

  private async assertUnused(
    pluginId: string,
    operation: SourcePluginUsageOperation,
    versions: StoredPluginVersion[]
  ): Promise<void> {
    const potential = await this.usages.listPotentialUsages(operation);
    const blocking = potential.filter((record) =>
      versions.some((version) => recordMatchesVersion(record, version))
    );
    if (blocking.length === 0) return;

    const blockingJobs = blocking.map(({ jobId, novelId, status }) => ({
      jobId,
      novelId,
      status
    }));
    throw new SourcePluginUsageConflictError({
      reason: 'SOURCE_PLUGIN_IN_USE',
      operation,
      pluginId,
      blockingJobCount: blockingJobs.length,
      blockingJobs
    });
  }
}
