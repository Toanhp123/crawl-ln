import type { SourcePlugin } from '../../../entities/source-plugin';

export interface SourcePluginActivationState {
  targetVersion: string;
  blockedByPermissions: boolean;
  hasUpgrade: boolean;
  canEnable: boolean;
  canActivateLatest: boolean;
}

export function getSourcePluginActivationState(plugin: SourcePlugin): SourcePluginActivationState {
  const blockedByPermissions = plugin.permissionsPending;
  const hasUpgrade = Boolean(
    plugin.enabled && plugin.activeVersion && plugin.activeVersion !== plugin.latestVersion
  );
  return {
    targetVersion: plugin.latestVersion,
    blockedByPermissions,
    hasUpgrade,
    canEnable: !plugin.enabled && !blockedByPermissions && Boolean(plugin.latestVersion),
    canActivateLatest: hasUpgrade && !blockedByPermissions
  };
}
