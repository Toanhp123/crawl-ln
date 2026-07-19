import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { PluginPackageVerifierPort } from '../ports/plugin-package-verifier.port.js';
import type { PluginStorePort } from '../ports/plugin-store.port.js';
import type { SourcePluginManifest } from '../../domain/plugin/source-plugin.js';

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

export class PluginInstallationService {
  constructor(
    private readonly verifier: PluginPackageVerifierPort,
    private readonly store: PluginStorePort,
    private readonly pluginRoot: string,
    private readonly ids: { randomId(): string },
    private readonly clock: { now(): Date }
  ) {}

  async install(input: { bytes: Uint8Array; originalName: string }) {
    const installationId = this.ids.randomId();
    const createdAt = this.clock.now().toISOString();
    const packagePath = join(this.pluginRoot, 'packages', `${installationId}.source-plugin`);
    let stagingPath: string | undefined;
    let installedPath: string | undefined;

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
      const versionRoot = join(
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
      await rename(stagingPath, versionRoot);
      installedPath = versionRoot;
      stagingPath = undefined;

      const status = 'pending-approval' as const;
      await this.store.upsertPluginVersion({
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
        installedAt: createdAt
      });
      await this.store.replaceRequestedPermissions({
        pluginId: verified.manifest.id,
        pluginVersion: verified.manifest.version,
        permissions: permissionRows(verified.manifest.permissions)
      });
      await this.store.recordInstallation({
        id: installationId,
        pluginId: verified.manifest.id,
        pluginVersion: verified.manifest.version,
        originalPackagePath: packagePath,
        status,
        createdAt,
        completedAt: this.clock.now().toISOString()
      });
      return {
        installationId,
        pluginId: verified.manifest.id,
        version: verified.manifest.version,
        status
      };
    } catch (error) {
      if (stagingPath) await rm(stagingPath, { recursive: true, force: true });
      if (installedPath) await rm(installedPath, { recursive: true, force: true });
      await this.store.recordInstallation({
        id: installationId,
        originalPackagePath: packagePath,
        status: 'quarantined',
        errorCode: errorCode(error),
        createdAt,
        completedAt: this.clock.now().toISOString()
      });
      throw error;
    }
  }
}
