import type { PluginHealthRepository } from '../ports/plugin-health.repository.js';
import type { PluginRegistryPort } from '../ports/plugin-registry.port.js';
import type { PluginStorePort } from '../ports/plugin-store.port.js';
import type { SourceCapability } from '../../public/source-reader.models.js';

interface HealthOutcome {
  pluginId: string;
  pluginVersion: string;
  capability: SourceCapability;
  durationMs: number;
}

interface PluginHealthOptions {
  threshold?: number;
  windowMs?: number;
  pluginStore?: Pick<PluginStorePort, 'quarantine'>;
  registry?: Pick<PluginRegistryPort, 'unregister'>;
}

export class PluginHealthService {
  private readonly threshold: number;
  private readonly windowMs: number;

  constructor(
    private readonly repository: PluginHealthRepository,
    private readonly clock: { now(): Date },
    private readonly ids: { randomId(): string },
    private readonly options: PluginHealthOptions = {}
  ) {
    this.threshold = options.threshold ?? 5;
    this.windowMs = options.windowMs ?? 60_000;
  }

  async isEligible(
    pluginId: string,
    pluginVersion: string,
    capability: SourceCapability
  ): Promise<boolean> {
    const since = new Date(this.clock.now().getTime() - this.windowMs).toISOString();
    return (
      (await this.repository.recentFailures({ pluginId, pluginVersion, capability, since })) <
      this.threshold
    );
  }

  async recordSuccess(input: HealthOutcome): Promise<void> {
    await this.repository.record({
      id: this.ids.randomId(),
      ...input,
      status: 'healthy',
      checkedAt: this.clock.now().toISOString()
    });
  }

  async recordFailure(input: HealthOutcome & { failureCode: string }): Promise<void> {
    await this.repository.record({
      id: this.ids.randomId(),
      ...input,
      status: 'failed',
      checkedAt: this.clock.now().toISOString()
    });
  }

  async quarantineIntegrityFailure(input: {
    pluginId: string;
    pluginVersion: string;
    failureCode: string;
  }): Promise<void> {
    if (!this.options.pluginStore || !this.options.registry) {
      throw new Error('Plugin integrity supervision is not configured');
    }
    await this.options.pluginStore.quarantine(
      input.pluginId,
      input.pluginVersion,
      input.failureCode
    );
    this.options.registry.unregister(input.pluginId);
  }
}
