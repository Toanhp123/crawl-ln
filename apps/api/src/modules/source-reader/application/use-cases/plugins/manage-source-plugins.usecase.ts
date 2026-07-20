import type { ClockPort } from '../../../../../shared/ports/clock.port.js';
import type { SourceReaderActor } from '../../ports/source-reader-actor.port.js';
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
  activate(pluginId: string, version: string, activatedAt: string): Promise<void>;
  disable(pluginId: string): Promise<void>;
  remove(pluginId: string): Promise<void>;
  quarantine(pluginId: string, version: string, reason: string): Promise<void>;
}

interface PluginInstaller {
  install(input: { bytes: Uint8Array; originalName: string }): Promise<Record<string, unknown>>;
}

interface PluginHealthAdministration {
  runPluginHealthCheck(pluginId: string): Promise<unknown>;
  describePlugin(pluginId: string): Promise<unknown>;
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
    private readonly store: Pick<PluginAdministrationStore, 'denyPermissions'>
  ) {}
  async execute(input: { actor: SourceReaderActor; pluginId: string; version: string }) {
    this.authorization.requireRole(input.actor, 'source-admin');
    await this.store.denyPermissions({ pluginId: input.pluginId, pluginVersion: input.version });
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
    private readonly store: Pick<PluginAdministrationStore, 'activate'>,
    private readonly clock: ClockPort
  ) {}
  async execute(input: { actor: SourceReaderActor; pluginId: string; version: string }) {
    this.authorization.requireRole(input.actor, 'source-admin');
    await this.store.activate(input.pluginId, input.version, this.clock.now().toISOString());
  }
}

export class DisablePluginUseCase {
  constructor(
    private readonly authorization: SourceReaderAuthorizationPolicy,
    private readonly store: Pick<PluginAdministrationStore, 'disable'>
  ) {}
  async execute(input: { actor: SourceReaderActor; pluginId: string }) {
    this.authorization.requireRole(input.actor, 'source-admin');
    await this.store.disable(input.pluginId);
  }
}

export class RemovePluginUseCase {
  constructor(
    private readonly authorization: SourceReaderAuthorizationPolicy,
    private readonly store: Pick<PluginAdministrationStore, 'remove'>
  ) {}
  async execute(input: { actor: SourceReaderActor; pluginId: string }) {
    this.authorization.requireRole(input.actor, 'source-admin');
    await this.store.remove(input.pluginId);
  }
}

export class TestPluginUseCase {
  constructor(
    private readonly authorization: SourceReaderAuthorizationPolicy,
    private readonly health: PluginHealthAdministration
  ) {}
  execute(input: { actor: SourceReaderActor; pluginId: string }) {
    this.authorization.requireRole(input.actor, 'source-admin');
    return this.health.runPluginHealthCheck(input.pluginId);
  }
}

export class GetPluginHealthUseCase {
  constructor(
    private readonly authorization: SourceReaderAuthorizationPolicy,
    private readonly health: PluginHealthAdministration
  ) {}
  execute(input: { actor: SourceReaderActor; pluginId: string }) {
    this.authorization.requireRole(input.actor, 'reader');
    return this.health.describePlugin(input.pluginId);
  }
}

export class QuarantinePluginUseCase {
  constructor(
    private readonly authorization: SourceReaderAuthorizationPolicy,
    private readonly store: Pick<PluginAdministrationStore, 'quarantine'>
  ) {}
  async execute(input: {
    actor: SourceReaderActor;
    pluginId: string;
    version: string;
    reason: string;
  }) {
    this.authorization.requireRole(input.actor, 'source-admin');
    await this.store.quarantine(input.pluginId, input.version, input.reason);
  }
}
