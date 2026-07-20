import type { CompatibilityIssue } from '../../domain/plugin/source-reader-host-compatibility.js';
import type {
  PluginStatus,
  PluginTrustLevel,
  SourcePluginManifest
} from '../../domain/plugin/source-plugin.js';

export interface StoredPluginVersion {
  pluginId: string;
  version: string;
  trustLevel: PluginTrustLevel;
  status: PluginStatus;
  packagePath: string;
  checksum: string;
  signatureStatus: 'built-in' | 'valid' | 'unsigned' | 'invalid';
  manifest: SourcePluginManifest;
  compatibilityIssues?: CompatibilityIssue[];
  activatedExtensions?: Record<string, { version: number; schema: string; required: boolean }>;
  sandboxProtocolVersion?: number;
}

export interface PluginStorePort {
  recordInstallation(input: {
    id: string;
    pluginId?: string;
    pluginVersion?: string;
    originalPackagePath: string;
    stagingPath?: string;
    status: string;
    errorCode?: string;
    createdAt: string;
    completedAt?: string;
  }): Promise<void>;
  upsertPluginVersion(input: {
    pluginId: string;
    name: string;
    version: string;
    trustLevel: PluginTrustLevel;
    status: PluginStatus;
    packagePath: string;
    checksum: string;
    signatureStatus: 'built-in' | 'valid' | 'unsigned' | 'invalid';
    manifestJson: string;
    sdkRange: string;
    installedAt: string;
    compatibilityIssuesJson?: string;
    activatedExtensionsJson?: string;
    sandboxProtocolVersion?: number;
  }): Promise<void>;
  replaceRequestedPermissions(input: {
    pluginId: string;
    pluginVersion: string;
    permissions: Array<{ permission: string; scopeJson: string }>;
  }): Promise<void>;
  approvePermissions(input: {
    pluginId: string;
    pluginVersion: string;
    approvedBy: string;
    approvedAt: string;
  }): Promise<void>;
  permissionsApproved(pluginId: string, version: string): Promise<boolean>;
  activate(pluginId: string, version: string, activatedAt: string): Promise<void>;
  activateCandidateAtomically(
    pluginId: string,
    version: string,
    activatedAt: string
  ): Promise<void>;
  recordActivationFailure(input: {
    pluginId: string;
    version: string;
    phase: string;
    message: string;
  }): Promise<void>;
  findVersion(pluginId: string, version: string): Promise<StoredPluginVersion | undefined>;
  findActive(pluginId: string): Promise<StoredPluginVersion | undefined>;
  listActive(): Promise<StoredPluginVersion[]>;
  listInstalled(): Promise<
    Array<{
      pluginId: string;
      name: string;
      trustLevel: PluginTrustLevel;
      status: PluginStatus;
      activeVersion?: string;
      enabled: boolean;
      installedAt: string;
      updatedAt: string;
    }>
  >;
  listPermissions(pluginId: string): Promise<
    Array<{
      pluginId: string;
      pluginVersion: string;
      permission: string;
      scope: unknown;
      status: string;
      approvedBy?: string;
      approvedAt?: string;
    }>
  >;
  denyPermissions(input: { pluginId: string; pluginVersion: string }): Promise<void>;
  disable(pluginId: string): Promise<void>;
  remove(pluginId: string): Promise<void>;
  quarantine(pluginId: string, version: string, reason: string): Promise<void>;
}
