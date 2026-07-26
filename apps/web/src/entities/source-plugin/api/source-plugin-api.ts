import type {
  SourceReaderPluginDescriptor,
  SourceReaderPluginDiagnostics,
  SourceReaderPluginPermission
} from '@novel-tool/shared';
import { http } from '../../../shared/api';

export type SourcePlugin = SourceReaderPluginDescriptor;
export type SourcePluginDiagnostics = SourceReaderPluginDiagnostics;
export type SourcePluginHealth = SourceReaderPluginDiagnostics;
export type SourcePluginPermission = SourceReaderPluginPermission;

type PluginResponse = Partial<SourceReaderPluginDescriptor> & { pluginId?: string };

function normalizePlugin(plugin: PluginResponse): SourcePlugin {
  const id = plugin.id ?? plugin.pluginId;
  if (!id || !plugin.name || !plugin.latestVersion || !plugin.trustLevel || !plugin.status) {
    throw new Error('Source Reader returned an invalid plugin descriptor');
  }

  return {
    id,
    name: plugin.name,
    latestVersion: plugin.latestVersion,
    ...(plugin.activeVersion ? { activeVersion: plugin.activeVersion } : {}),
    trustLevel: plugin.trustLevel,
    status: plugin.status,
    enabled: plugin.enabled ?? false,
    capabilities: plugin.capabilities ?? [],
    domains: plugin.domains ?? [],
    permissionsPending: plugin.permissionsPending ?? false,
    ...(plugin.health ? { health: plugin.health } : {})
  };
}

export async function listSourcePlugins(signal?: AbortSignal): Promise<SourcePlugin[]> {
  const plugins = await http<PluginResponse[]>('/api/source-reader/plugins', { signal });
  return plugins.map(normalizePlugin);
}

export function getSourcePluginDiagnostics(
  pluginId: string,
  signal?: AbortSignal
): Promise<SourcePluginDiagnostics> {
  return http<SourcePluginDiagnostics>(
    `/api/source-reader/plugins/${encodeURIComponent(pluginId)}`,
    { signal }
  );
}

export function getSourcePluginHealth(
  pluginId: string,
  signal?: AbortSignal
): Promise<SourcePluginHealth> {
  return http<SourcePluginHealth>(
    `/api/source-reader/plugins/${encodeURIComponent(pluginId)}/health`,
    { signal }
  );
}

export function listSourcePluginPermissions(
  pluginId: string,
  signal?: AbortSignal
): Promise<SourcePluginPermission[]> {
  return http<SourcePluginPermission[]>(
    `/api/source-reader/plugins/${encodeURIComponent(pluginId)}/permissions`,
    { signal }
  );
}
