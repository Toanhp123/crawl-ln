import type {
  PluginCandidate,
  PluginRegistryPort,
  RegisteredPlugin
} from '../../../application/ports/plugin-registry.port.js';
import {
  matcherAccepts,
  normalizeSourceUrl
} from '../../../application/services/plugin-matcher.js';
import type { SourceReaderPlugin } from '../../../domain/plugin/source-plugin.js';
import type { SourceCapability } from '../../../public/source-reader.models.js';

export class InMemoryPluginRegistry implements PluginRegistryPort {
  private readonly registrations = new Map<string, RegisteredPlugin>();

  register(
    plugin: SourceReaderPlugin,
    options: Partial<Omit<RegisteredPlugin, 'plugin'>> = {}
  ): void {
    if (this.registrations.has(plugin.manifest.id)) {
      throw new Error(`Duplicate source plugin id: ${plugin.manifest.id}`);
    }
    this.registrations.set(plugin.manifest.id, this.registration(plugin, options));
  }

  replaceExternal(registrations: RegisteredPlugin[]): void {
    const next = new Map(
      [...this.registrations].filter(([, registration]) => registration.trustLevel === 'built-in')
    );
    for (const registration of registrations) {
      const pluginId = registration.plugin.manifest.id;
      if (next.has(pluginId)) throw new Error(`Duplicate source plugin id: ${pluginId}`);
      next.set(
        pluginId,
        this.registration(registration.plugin, {
          trustLevel: registration.trustLevel,
          executionMode: registration.executionMode,
          enabled: registration.enabled,
          packagePath: registration.packagePath
        })
      );
    }
    this.registrations.clear();
    for (const [pluginId, registration] of next) this.registrations.set(pluginId, registration);
  }

  private registration(
    plugin: SourceReaderPlugin,
    options: Partial<Omit<RegisteredPlugin, 'plugin'>>
  ): RegisteredPlugin {
    return {
      plugin,
      trustLevel: options.trustLevel ?? 'built-in',
      executionMode: options.executionMode ?? plugin.manifest.runtime.preferredMode,
      enabled: options.enabled ?? true,
      ...(options.packagePath ? { packagePath: options.packagePath } : {})
    };
  }

  unregister(pluginId: string): void {
    this.registrations.delete(pluginId);
  }

  findById(pluginId: string): RegisteredPlugin | undefined {
    return this.registrations.get(pluginId);
  }

  async listCandidates(request: {
    url: string;
    capability: SourceCapability;
  }): Promise<PluginCandidate[]> {
    const normalizedUrl = normalizeSourceUrl(request.url);
    const domain = new URL(normalizedUrl).hostname;
    const candidates: PluginCandidate[] = [];

    for (const registration of this.registrations.values()) {
      if (!registration.enabled) continue;
      if (!registration.plugin.manifest.capabilities.includes(request.capability)) continue;

      const matching = registration.plugin.manifest.matchers.filter((matcher) =>
        matcherAccepts(matcher, request)
      );
      if (matching.length === 0) continue;

      candidates.push({
        ...registration,
        priority: Math.max(...matching.map((matcher) => matcher.priority)),
        normalizedUrl,
        domain
      });
    }

    return candidates.sort(
      (left, right) =>
        right.priority - left.priority ||
        left.plugin.manifest.id.localeCompare(right.plugin.manifest.id)
    );
  }
}
