import { lstat, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { PluginPackageVerifierPort } from '../../ports/plugin-package-verifier.port.js';
import type { PluginStorePort } from '../../ports/plugin-store.port.js';
import type { SourcePluginManifest } from '../../../domain/plugin/source-plugin.js';
import type { PluginCompatibilityService } from './plugin-compatibility.service.js';

function permissionRows(
  permissions: SourcePluginManifest['permissions']
): Array<{ permission: string; scopeJson: string }> {
  const rows = [
    { permission: 'network', scopeJson: JSON.stringify({ hosts: permissions.network.hosts }) }
  ];
  if (permissions.browser) rows.push({ permission: 'browser', scopeJson: '{}' });
  if (permissions.authentication) rows.push({ permission: 'authentication', scopeJson: '{}' });
  if (permissions.persistentCache) rows.push({ permission: 'persistent-cache', scopeJson: '{}' });
  if (permissions.externalAssets?.length) {
    rows.push({
      permission: 'external-assets',
      scopeJson: JSON.stringify({ hosts: permissions.externalAssets })
    });
  }
  return rows;
}

function errorCode(error: unknown): string {
  if (error instanceof Error && error.name !== 'Error') return error.name;
  return 'INSTALL_FAILED';
}

const sourcePluginIdPattern = /^[a-z0-9][a-z0-9-]*$/;

interface PluginReplacementRollback {
  restore(): Promise<void>;
}

export interface PluginReplacementLifecycle {
  beforeReplace(input: {
    pluginId: string;
    version: string;
  }): Promise<PluginReplacementRollback | undefined>;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  }
}

export class PluginInstallationService {
  constructor(
    private readonly verifier: PluginPackageVerifierPort,
    private readonly store: PluginStorePort,
    private readonly pluginRoot: string,
    private readonly ids: { randomId(): string },
    private readonly clock: { now(): Date },
    private readonly compatibility?: PluginCompatibilityService,
    private readonly replacement?: PluginReplacementLifecycle
  ) {}

  async removeInstalled(pluginId: string): Promise<void> {
    if (!sourcePluginIdPattern.test(pluginId)) {
      throw new Error(`Invalid source plugin id: ${pluginId}`);
    }
    await this.removeInstalledPath(join(this.pluginRoot, 'installed', pluginId));
  }

  private removeInstalledPath(path: string): Promise<void> {
    return rm(path, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100
    });
  }

  async install(input: { bytes: Uint8Array; originalName: string }) {
    const installationId = this.ids.randomId();
    const createdAt = this.clock.now().toISOString();
    const packagePath = join(this.pluginRoot, 'packages', `${installationId}.source-plugin`);
    let stagingPath: string | undefined;
    let installedPath: string | undefined;
    let backupPath: string | undefined;
    let replacementRollback: PluginReplacementRollback | undefined;
    let committed = false;
    let versionRoot: string | undefined;

    await mkdir(dirname(packagePath), { recursive: true });
    await writeFile(packagePath, input.bytes, { flag: 'wx' });
    await this.store.recordInstallation({
      id: installationId,
      originalPackagePath: packagePath,
      status: 'verifying',
      createdAt
    });

    try {
      if (!input.originalName.toLowerCase().endsWith('.source-plugin')) {
        throw new Error('External plugin package must use the .source-plugin extension');
      }
      const verified = await this.verifier.verify(input.bytes);
      const compatibility = this.compatibility?.evaluate(verified.manifest, verified.files) ?? {
        compatible: true,
        issues: [],
        activatedExtensions: {}
      };
      versionRoot = join(
        this.pluginRoot,
        'installed',
        verified.manifest.id,
        verified.manifest.version
      );
      stagingPath = `${versionRoot}.staging-${installationId}`;
      await mkdir(dirname(stagingPath), { recursive: true });
      await mkdir(stagingPath, { recursive: false });
      for (const [path, content] of verified.files) {
        const target = join(stagingPath, path);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, content, { flag: 'wx' });
      }
      await mkdir(dirname(versionRoot), { recursive: true });
      replacementRollback = await this.replacement?.beforeReplace({
        pluginId: verified.manifest.id,
        version: verified.manifest.version
      });
      if (await pathExists(versionRoot)) {
        backupPath = `${versionRoot}.backup-${installationId}`;
        await rename(versionRoot, backupPath);
      }
      await rename(stagingPath, versionRoot);
      installedPath = versionRoot;
      stagingPath = undefined;

      const status = compatibility.compatible
        ? ('pending-approval' as const)
        : ('quarantined' as const);
      const fatal = compatibility.issues.find((issue) => issue.severity === 'fatal');
      await this.store.commitInstallation({
        version: {
          pluginId: verified.manifest.id,
          name: verified.manifest.name,
          version: verified.manifest.version,
          trustLevel: verified.trustLevel,
          status,
          packagePath: versionRoot,
          checksum: verified.packageChecksum,
          signatureStatus: verified.signatureStatus,
          manifestJson: JSON.stringify(verified.manifest),
          sdkRange: verified.manifest.engines.sourceReader,
          installedAt: createdAt,
          compatibilityIssuesJson: JSON.stringify(compatibility.issues),
          activatedExtensionsJson: JSON.stringify(compatibility.activatedExtensions),
          sandboxProtocolVersion: 1
        },
        permissions: permissionRows(verified.manifest.permissions),
        installation: {
          id: installationId,
          pluginId: verified.manifest.id,
          pluginVersion: verified.manifest.version,
          originalPackagePath: packagePath,
          status,
          createdAt,
          completedAt: this.clock.now().toISOString()
        },
        ...(!compatibility.compatible
          ? { quarantineReason: fatal?.code ?? 'PLUGIN_CONTRACT_INCOMPATIBLE' }
          : {})
      });
      committed = true;
      if (backupPath) {
        await this.removeInstalledPath(backupPath).catch(() => undefined);
        backupPath = undefined;
      }
      return {
        installationId,
        pluginId: verified.manifest.id,
        version: verified.manifest.version,
        status
      };
    } catch (error) {
      const failures: unknown[] = [error];
      let canRestoreRuntime = true;

      if (stagingPath) {
        try {
          await rm(stagingPath, { recursive: true, force: true });
        } catch (rollbackError) {
          failures.push(rollbackError);
        }
      }
      if (installedPath && !committed) {
        try {
          await rm(installedPath, { recursive: true, force: true });
        } catch (rollbackError) {
          failures.push(rollbackError);
          canRestoreRuntime = false;
        }
      }
      if (backupPath && !committed && versionRoot && canRestoreRuntime) {
        try {
          await rename(backupPath, versionRoot);
        } catch (rollbackError) {
          failures.push(rollbackError);
          canRestoreRuntime = false;
        }
      }
      if (!committed && canRestoreRuntime && replacementRollback) {
        try {
          await replacementRollback.restore();
        } catch (rollbackError) {
          failures.push(rollbackError);
        }
      }
      try {
        await this.store.recordInstallation({
          id: installationId,
          originalPackagePath: packagePath,
          status: 'quarantined',
          errorCode: errorCode(error),
          createdAt,
          completedAt: this.clock.now().toISOString()
        });
      } catch (recordError) {
        failures.push(recordError);
      }

      if (failures.length === 1) throw error;
      throw new AggregateError(failures, 'Plugin installation failed and rollback was incomplete');
    }
  }
}
