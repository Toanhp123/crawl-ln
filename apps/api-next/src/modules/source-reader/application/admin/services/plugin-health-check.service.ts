import type { PluginRegistryPort } from '../../ports/plugin-registry.port.js';
import { SourceReaderError } from '../../../domain/errors/source-reader.error.js';
import type { PluginDiagnosticsService } from './plugin-diagnostics.service.js';

export class PluginHealthCheckService {
  constructor(
    private readonly diagnostics: PluginDiagnosticsService,
    private readonly registry: Pick<PluginRegistryPort, 'findById'>,
    private readonly clock: { now(): Date }
  ) {}

  async runPluginHealthCheck(pluginId: string) {
    const diagnostics = await this.diagnostics.describePlugin(pluginId);
    const registration = this.registry.findById(pluginId);
    if (!registration) {
      throw new SourceReaderError('PLUGIN_UNAVAILABLE', 'Plugin is not active', {
        retryable: false,
        fallbackAllowed: false
      });
    }
    const lifecycleHealth = registration.plugin.lifecycle
      ? await registration.plugin.lifecycle.healthCheck()
      : { status: 'healthy' as const, details: { adapter: 'built-in' } };
    return {
      ...diagnostics,
      lastHealth: {
        status: lifecycleHealth.status,
        checkedAt: this.clock.now().toISOString()
      }
    };
  }
}
