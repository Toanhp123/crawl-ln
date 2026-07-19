import type { PluginStorePort } from '../../../application/ports/plugin-store.port.js';
import type { RegisteredPlugin } from '../../../application/ports/plugin-registry.port.js';

export class ExternalPluginLoader {
  constructor(private readonly store: PluginStorePort) {}

  async loadActive(): Promise<RegisteredPlugin[]> {
    const versions = await this.store.listActive();
    return versions.map((version) => ({
      plugin: { manifest: version.manifest },
      trustLevel: version.trustLevel,
      executionMode:
        version.trustLevel === 'local-unverified'
          ? 'isolated'
          : version.manifest.runtime.preferredMode,
      enabled: true,
      packagePath: version.packagePath
    }));
  }
}
