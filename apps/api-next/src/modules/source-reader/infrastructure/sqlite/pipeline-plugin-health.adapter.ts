import type { PluginHealthRepository } from '../../application/ports/plugin-health.repository.js';
import type { PluginRegistryPort } from '../../application/ports/plugin-registry.port.js';
import type { PluginStorePort } from '../../application/ports/plugin-store.port.js';
import type { ClockPort } from '../../application/ports/runtime-support.ports.js';
import type { SourceReaderHealthPort } from '../../application/source-reader.ports.js';

interface PipelinePluginHealthOptions {
  failureThreshold?: number;
  failureWindowMs?: number;
  plugins?: Pick<PluginStorePort, 'quarantine'>;
  registry?: Pick<PluginRegistryPort, 'unregister'>;
}

export class PipelinePluginHealthAdapter implements SourceReaderHealthPort {
  private readonly failureThreshold: number;
  private readonly failureWindowMs: number;

  constructor(
    private readonly repository: PluginHealthRepository,
    private readonly clock: ClockPort,
    private readonly nextId: () => string,
    private readonly options: PipelinePluginHealthOptions = {}
  ) {
    this.failureThreshold = Math.max(1, options.failureThreshold ?? 5);
    this.failureWindowMs = Math.max(1_000, options.failureWindowMs ?? 60_000);
  }

  async isEligible(input: Parameters<SourceReaderHealthPort['isEligible']>[0]): Promise<boolean> {
    const failures = await this.repository.recentFailures({
      pluginId: input.candidate.pluginId,
      pluginVersion: input.candidate.pluginVersion,
      capability: input.capability,
      since: new Date(this.clock.now().getTime() - this.failureWindowMs).toISOString()
    });
    return failures < this.failureThreshold;
  }

  async recordSuccess(
    input: Parameters<SourceReaderHealthPort['recordSuccess']>[0]
  ): Promise<void> {
    await this.repository.record({
      id: this.nextId(),
      pluginId: input.candidate.pluginId,
      pluginVersion: input.candidate.pluginVersion,
      capability: input.capability,
      status: 'healthy',
      durationMs: input.durationMs,
      checkedAt: this.clock.now().toISOString()
    });
  }

  async recordFailure(
    input: Parameters<SourceReaderHealthPort['recordFailure']>[0]
  ): Promise<void> {
    await this.repository.record({
      id: this.nextId(),
      pluginId: input.candidate.pluginId,
      pluginVersion: input.candidate.pluginVersion,
      capability: input.capability,
      status: 'failed',
      durationMs: input.durationMs,
      failureCode: input.failureCode,
      checkedAt: this.clock.now().toISOString()
    });
  }

  async recordOutputPolicyViolation(input: {
    pluginId: string;
    pluginVersion: string;
    stream: 'stdout' | 'stderr';
    bytes: number;
  }): Promise<void> {
    const failureCode = 'PLUGIN_OUTPUT_POLICY_VIOLATION';
    await this.repository.record({
      id: this.nextId(),
      pluginId: input.pluginId,
      pluginVersion: input.pluginVersion,
      status: 'failed',
      durationMs: 0,
      failureCode,
      checkedAt: this.clock.now().toISOString()
    });
    const failures = await this.repository.recentFailuresByCode({
      pluginId: input.pluginId,
      pluginVersion: input.pluginVersion,
      failureCode,
      since: new Date(this.clock.now().getTime() - this.failureWindowMs).toISOString()
    });
    if (failures < this.failureThreshold || !this.options.plugins || !this.options.registry) {
      return;
    }
    await this.options.plugins.quarantine(input.pluginId, input.pluginVersion, failureCode);
    this.options.registry.unregister(input.pluginId);
  }

  async quarantineIntegrityFailure(
    input: Parameters<NonNullable<SourceReaderHealthPort['quarantineIntegrityFailure']>>[0]
  ): Promise<void> {
    if (!this.options.plugins || !this.options.registry) {
      throw new Error('Plugin integrity supervision is not configured');
    }
    await this.options.plugins.quarantine(
      input.candidate.pluginId,
      input.candidate.pluginVersion,
      input.failureCode
    );
    this.options.registry.unregister(input.candidate.pluginId);
  }
}
