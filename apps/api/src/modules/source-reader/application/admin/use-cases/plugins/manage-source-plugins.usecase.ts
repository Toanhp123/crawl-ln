import type { ClockPort } from '../../../ports/runtime-support.ports.js';
import type { SourceReaderActor } from '../../../ports/source-reader-actor.port.js';
import type { SourceReaderPluginDiagnostics } from '../../../../public/source-reader.api.js';
import type { SourceReaderInvalidationPort } from '../../../ports/source-reader-invalidation.port.js';
import type { SourceReaderAuthorizationPolicy } from '../../policies/source-reader-authorization.policy.js';

export interface PluginAdministrationStore {
  listInstalled(): Promise<unknown[]>;
  approvePermissions(input: {
    pluginId: string;
    pluginVersion: string;
    approvedBy: string;
    approvedAt: string;
  }): Promise<void>;
  denyPermissions(input: { pluginId: string; pluginVersion: string }): Promise<void>;
  listPermissions(pluginId: string): Promise<unknown[]>;
  findLatestVersion(pluginId: string): Promise<{ version: string } | undefined>;
  findActive(pluginId: string): Promise<{ version: string } | undefined>;
  activate(pluginId: string, version: string, activatedAt: string): Promise<void>;
  disable(pluginId: string): Promise<void>;
  remove(pluginId: string): Promise<void>;
  quarantine(pluginId: string, version: string, reason: string): Promise<void>;
}

interface PluginInstaller {
  install(input: { bytes: Uint8Array; originalName: string }): Promise<Record<string, unknown>>;
}

interface PluginPackageRemover {
  removeInstalled(pluginId: string): Promise<void>;
}

interface PluginHealthCheckAdministration {
  runPluginHealthCheck(pluginId: string): Promise<unknown>;
}

interface PluginDiagnosticsAdministration {
  describePlugin(pluginId: string): Promise<SourceReaderPluginDiagnostics>;
}

interface PluginActivationAdministration {
  activate(input: { pluginId: string; version: string; signal: AbortSignal }): Promise<unknown>;
  disable(pluginId: string): Promise<void>;
  quarantine(pluginId: string, version: string, reason: string): Promise<void>;
}

interface PluginUsageAdministration {
  assertCanDisable(pluginId: string): Promise<void>;
  assertCanRemove(pluginId: string): Promise<void>;
}

export class InstallSourcePluginUseCase {
  constructor(
    private readonly authorization: SourceReaderAuthorizationPolicy,
    private readonly installations: PluginInstaller
  ) {}

  async execute(input: { actor: SourceReaderActor; bytes: Uint8Array; originalName: string }) {
    this.authorization.requireRole(input.actor, 'source-admin');
    const installed = await this.installations.install({
      bytes: input.bytes,
      originalName: input.originalName
    });
    const { packagePath: _packagePath, stagingPath: _stagingPath, ...safe } = installed;
    return safe;
  }
}

export class ListPluginsUseCase {
  constructor(
    private readonly authorization: SourceReaderAuthorizationPolicy,
    private readonly store: Pick<PluginAdministrationStore, 'listInstalled'>
  ) {}
  execute(input: { actor: SourceReaderActor }) {
    this.authorization.requireRole(input.actor, 'reader');
    return this.store.listInstalled();
  }
}

export class ApprovePluginPermissionsUseCase {
  constructor(
    private readonly authorization: SourceReaderAuthorizationPolicy,
    private readonly store: Pick<PluginAdministrationStore, 'approvePermissions'>,
    private readonly clock: ClockPort
  ) {}
  async execute(input: { actor: SourceReaderActor; pluginId: string; version: string }) {
    this.authorization.requireRole(input.actor, 'source-admin');
    await this.store.approvePermissions({
      pluginId: input.pluginId,
      pluginVersion: input.version,
      approvedBy: input.actor.id ?? 'system',
      approvedAt: this.clock.now().toISOString()
    });
  }
}

export class DenyPluginPermissionsUseCase {
  constructor(
    private readonly authorization: SourceReaderAuthorizationPolicy,
    private readonly store: Pick<PluginAdministrationStore, 'denyPermissions' | 'findActive'>,
    private readonly activation: Pick<PluginActivationAdministration, 'disable'>,
    private readonly invalidation?: SourceReaderInvalidationPort
  ) {}
  async execute(input: { actor: SourceReaderActor; pluginId: string; version: string }) {
    this.authorization.requireRole(input.actor, 'source-admin');
    const active = await this.store.findActive(input.pluginId);
    await this.store.denyPermissions({ pluginId: input.pluginId, pluginVersion: input.version });
    if (active?.version !== input.version) return;
    await this.activation.disable(input.pluginId);
    await this.invalidation?.invalidate({ type: 'plugin-disabled', pluginId: input.pluginId });
  }
}

export class ListPluginPermissionsUseCase {
  constructor(
    private readonly authorization: SourceReaderAuthorizationPolicy,
    private readonly store: Pick<PluginAdministrationStore, 'listPermissions'>
  ) {}
  execute(input: { actor: SourceReaderActor; pluginId: string }) {
    this.authorization.requireRole(input.actor, 'reader');
    return this.store.listPermissions(input.pluginId);
  }
}

export class EnablePluginUseCase {
  constructor(
    private readonly authorization: SourceReaderAuthorizationPolicy,
    private readonly activation: Pick<PluginActivationAdministration, 'activate'>,
    private readonly invalidation?: SourceReaderInvalidationPort
  ) {}
  async execute(input: { actor: SourceReaderActor; pluginId: string; version: string }) {
    this.authorization.requireRole(input.actor, 'source-admin');
    const result = await this.activation.activate({
      pluginId: input.pluginId,
      version: input.version,
      signal: new AbortController().signal
    });
    await this.invalidation?.invalidate({
      type: 'plugin-activated',
      pluginId: input.pluginId
    });
    return result;
  }
}

export class DisablePluginUseCase {
  constructor(
    private readonly authorization: SourceReaderAuthorizationPolicy,
    private readonly activation: Pick<PluginActivationAdministration, 'disable'>,
    private readonly invalidation?: SourceReaderInvalidationPort,
    private readonly usage: Pick<PluginUsageAdministration, 'assertCanDisable'> = {
      assertCanDisable: async () => undefined
    }
  ) {}
  async execute(input: { actor: SourceReaderActor; pluginId: string }) {
    this.authorization.requireRole(input.actor, 'source-admin');
    await this.usage.assertCanDisable(input.pluginId);
    await this.activation.disable(input.pluginId);
    await this.invalidation?.invalidate({ type: 'plugin-disabled', pluginId: input.pluginId });
  }
}

export class RemovePluginUseCase {
  constructor(
    private readonly authorization: SourceReaderAuthorizationPolicy,
    private readonly activation: Pick<PluginActivationAdministration, 'disable'>,
    private readonly store: Pick<PluginAdministrationStore, 'findLatestVersion' | 'remove'>,
    private readonly packages: PluginPackageRemover,
    private readonly invalidation?: SourceReaderInvalidationPort,
    private readonly usage: Pick<PluginUsageAdministration, 'assertCanRemove'> = {
      assertCanRemove: async () => undefined
    }
  ) {}
  async execute(input: { actor: SourceReaderActor; pluginId: string }) {
    this.authorization.requireRole(input.actor, 'source-admin');
    if (await this.store.findLatestVersion(input.pluginId)) {
      await this.usage.assertCanRemove(input.pluginId);
      await this.activation.disable(input.pluginId);
      await this.packages.removeInstalled(input.pluginId);
    }
    await this.store.remove(input.pluginId);
    await this.invalidation?.invalidate({ type: 'plugin-disabled', pluginId: input.pluginId });
  }
}

export class TestPluginUseCase {
  constructor(
    private readonly authorization: SourceReaderAuthorizationPolicy,
    private readonly health: PluginHealthCheckAdministration
  ) {}
  execute(input: { actor: SourceReaderActor; pluginId: string }) {
    this.authorization.requireRole(input.actor, 'source-admin');
    return this.health.runPluginHealthCheck(input.pluginId);
  }
}

export class GetPluginDiagnosticsUseCase {
  constructor(
    private readonly authorization: SourceReaderAuthorizationPolicy,
    private readonly health: PluginDiagnosticsAdministration
  ) {}
  execute(input: { actor: SourceReaderActor; pluginId: string }) {
    this.authorization.requireRole(input.actor, 'reader');
    return this.health.describePlugin(input.pluginId);
  }
}

export class GetPluginHealthUseCase {
  constructor(
    private readonly authorization: SourceReaderAuthorizationPolicy,
    private readonly health: PluginDiagnosticsAdministration
  ) {}
  execute(input: { actor: SourceReaderActor; pluginId: string }) {
    this.authorization.requireRole(input.actor, 'reader');
    return this.health.describePlugin(input.pluginId);
  }
}

export class QuarantinePluginUseCase {
  constructor(
    private readonly authorization: SourceReaderAuthorizationPolicy,
    private readonly activation: Pick<PluginActivationAdministration, 'quarantine'>,
    private readonly invalidation?: SourceReaderInvalidationPort
  ) {}
  async execute(input: {
    actor: SourceReaderActor;
    pluginId: string;
    version: string;
    reason: string;
  }) {
    this.authorization.requireRole(input.actor, 'source-admin');
    await this.activation.quarantine(input.pluginId, input.version, input.reason);
    await this.invalidation?.invalidate({
      type: 'plugin-quarantined',
      pluginId: input.pluginId,
      pluginVersion: input.version
    });
  }
}
