import type {
  PluginCandidate,
  PluginRegistryPort,
  PreparedPluginRegistrySnapshot,
  RegisteredPlugin
} from '../../../application/ports/plugin-registry.port.js';
import {
  matcherAccepts,
  normalizeSourceUrl
} from '../../../application/services/plugin-matcher.js';
import type { SourceReaderPlugin } from '../../../domain/plugin/source-plugin.js';
import type { SourceCapability } from '../../../public/source-reader.models.js';

export class InMemoryPluginRegistry implements PluginRegistryPort {
  private registrations = new Map<string, RegisteredPlugin>();

  register(
    plugin: SourceReaderPlugin,
    options: Partial<Omit<RegisteredPlugin, 'plugin'>> = {}
  ): void {
    if (this.registrations.has(plugin.manifest.id)) {
      throw new Error(`Duplicate source plugin id: ${plugin.manifest.id}`);
    }
    const prepared = this.prepareRegistration(
      this.registrations,
      this.registration(plugin, options)
    );
    this.publishPrepared(prepared);
  }

  replaceExternal(registrations: RegisteredPlugin[]): void {
    let next = new Map(
      [...this.registrations].filter(([, registration]) => registration.trustLevel === 'built-in')
    );
    for (const registration of registrations) {
      const pluginId = registration.plugin.manifest.id;
      if (next.has(pluginId)) throw new Error(`Duplicate source plugin id: ${pluginId}`);
      const prepared = this.prepareRegistration(next, registration);
      next = new Map(prepared.registrations);
    }
    this.publishPrepared({ registrations: next });
  }

  snapshot(): ReadonlyMap<string, RegisteredPlugin> {
    return new Map(this.registrations);
  }

  prepareRegistration(
    snapshot: ReadonlyMap<string, RegisteredPlugin>,
    registration: RegisteredPlugin
  ): PreparedPluginRegistrySnapshot {
    const normalized = this.registration(registration.plugin, {
      trustLevel: registration.trustLevel,
      executionMode: registration.executionMode,
      enabled: registration.enabled,
      packagePath: registration.packagePath,
      activatedExtensionContracts: registration.activatedExtensionContracts
    });
    const pluginId = normalized.plugin.manifest.id;
    if (!pluginId || normalized.plugin.manifest.matchers.length === 0) {
      throw new Error('Plugin registration is invalid');
    }
    const next = new Map(snapshot);
    next.set(pluginId, normalized);
    return { registrations: next };
  }

  publishPrepared(snapshot: PreparedPluginRegistrySnapshot): void {
    this.registrations = new Map(snapshot.registrations);
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
      ...(options.packagePath ? { packagePath: options.packagePath } : {}),
      ...(options.activatedExtensionContracts
        ? { activatedExtensionContracts: options.activatedExtensionContracts }
        : {})
    };
  }

  unregister(pluginId: string): void {
    const next = new Map(this.registrations);
    next.delete(pluginId);
    this.registrations = next;
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
