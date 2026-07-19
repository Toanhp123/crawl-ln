import type { SourcePluginRegistryPort } from '../ports/source-plugin-registry.port.js';

export class ListSourcePluginsUseCase {
  constructor(private readonly registry: SourcePluginRegistryPort) {}
  execute() {
    return this.registry.list();
  }
}
export class ReloadSourcePluginsUseCase {
  constructor(private readonly registry: SourcePluginRegistryPort) {}
  execute() {
    return this.registry.reload();
  }
}
export class SetSourcePluginEnabledUseCase {
  constructor(private readonly registry: SourcePluginRegistryPort) {}
  execute(id: string, enabled: boolean) {
    return this.registry.setEnabled(id, enabled);
  }
}
