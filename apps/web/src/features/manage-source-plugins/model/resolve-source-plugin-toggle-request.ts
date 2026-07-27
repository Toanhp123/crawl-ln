import type { SourcePlugin } from '../../../entities/source-plugin';

export type SourcePluginToggleRequest =
  { kind: 'review-permissions' } | { kind: 'toggle'; enabled: boolean };

export function resolveSourcePluginToggleRequest(
  plugin: Pick<SourcePlugin, 'enabled' | 'permissionsPending'>,
  enabled: boolean
): SourcePluginToggleRequest {
  if (enabled && !plugin.enabled && plugin.permissionsPending) {
    return { kind: 'review-permissions' };
  }
  return { kind: 'toggle', enabled };
}
