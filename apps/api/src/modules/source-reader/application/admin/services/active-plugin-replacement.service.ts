import type { PluginStorePort } from '../../ports/plugin-store.port.js';
import type { SourceReaderInvalidationPort } from '../../ports/source-reader-invalidation.port.js';
import type { PluginReplacementLifecycle } from './plugin-installation.service.js';

interface ReplacementActivation {
  disable(pluginId: string): Promise<void>;
  activate(input: { pluginId: string; version: string; signal: AbortSignal }): Promise<unknown>;
}

export class ActivePluginReplacementService implements PluginReplacementLifecycle {
  constructor(
    private readonly plugins: Pick<PluginStorePort, 'findActive'>,
    private readonly usage: { assertCanDisable(pluginId: string): Promise<void> },
    private readonly activation: ReplacementActivation,
    private readonly invalidation: SourceReaderInvalidationPort
  ) {}

  async beforeReplace(input: { pluginId: string; version: string }) {
    const active = await this.plugins.findActive(input.pluginId);
    if (!active || active.version !== input.version) return undefined;

    await this.usage.assertCanDisable(input.pluginId);
    await this.activation.disable(input.pluginId);
    try {
      await this.invalidation.invalidate({
        type: 'plugin-disabled',
        pluginId: input.pluginId,
        pluginVersion: input.version
      });
    } catch (error) {
      await this.restore(input);
      throw error;
    }

    return { restore: () => this.restore(input) };
  }

  private async restore(input: { pluginId: string; version: string }): Promise<void> {
    await this.activation.activate({
      pluginId: input.pluginId,
      version: input.version,
      signal: new AbortController().signal
    });
    await this.invalidation.invalidate({
      type: 'plugin-activated',
      pluginId: input.pluginId,
      pluginVersion: input.version
    });
  }
}
