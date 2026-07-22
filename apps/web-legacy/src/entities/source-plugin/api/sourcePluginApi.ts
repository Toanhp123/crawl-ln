import type {
  SourceReaderPluginActivationResult,
  SourceReaderPluginDescriptor,
  SourceReaderPluginDiagnostics,
  SourceReaderPluginInstallResult,
  SourceReaderPluginPermission,
  SourceReaderPluginTestResult
} from '@novel-tool/shared';
import { useQuery } from '@tanstack/react-query';
import { http, httpFormData, httpVoid } from '@/shared/api/http';
import { queryKeys } from '@/shared/api/queryKeys';

interface PluginResponse extends Partial<SourceReaderPluginDescriptor> {
  pluginId?: string;
}

function normalizePlugin(plugin: PluginResponse): SourceReaderPluginDescriptor {
  const id = plugin.id ?? plugin.pluginId;
  if (!id || !plugin.name || !plugin.trustLevel || !plugin.status) {
    throw new Error('Source Reader returned an invalid plugin descriptor');
  }
  return {
    id,
    name: plugin.name,
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

export async function listSourcePlugins(signal?: AbortSignal) {
  const plugins = await http<PluginResponse[]>('/api/source-reader/plugins', { signal });
  return plugins.map(normalizePlugin);
}

export const getSourcePluginDiagnostics = (id: string, signal?: AbortSignal) =>
  http<SourceReaderPluginDiagnostics>(`/api/source-reader/plugins/${encodeURIComponent(id)}`, {
    signal
  });

export const getSourcePluginHealth = (id: string, signal?: AbortSignal) =>
  http<SourceReaderPluginDiagnostics>(
    `/api/source-reader/plugins/${encodeURIComponent(id)}/health`,
    { signal }
  );

export const listSourcePluginPermissions = (id: string, signal?: AbortSignal) =>
  http<SourceReaderPluginPermission[]>(
    `/api/source-reader/plugins/${encodeURIComponent(id)}/permissions`,
    { signal }
  );

export async function installSourcePlugin(file: File) {
  const body = new FormData();
  body.set('plugin', file);
  return httpFormData<SourceReaderPluginInstallResult>('/api/source-reader/plugins/install', body);
}

export const enableSourcePlugin = (id: string, version: string) =>
  http<SourceReaderPluginActivationResult>(
    `/api/source-reader/plugins/${encodeURIComponent(id)}/enable`,
    {
      method: 'POST',
      body: JSON.stringify({ version })
    }
  );

export const disableSourcePlugin = (id: string) =>
  httpVoid(`/api/source-reader/plugins/${encodeURIComponent(id)}/disable`, { method: 'POST' });

export const removeSourcePlugin = (id: string) =>
  httpVoid(`/api/source-reader/plugins/${encodeURIComponent(id)}`, { method: 'DELETE' });

export const testSourcePlugin = (id: string) =>
  http<SourceReaderPluginTestResult>(`/api/source-reader/plugins/${encodeURIComponent(id)}/test`, {
    method: 'POST'
  });

export const approveSourcePluginPermissions = (id: string, version: string) =>
  httpVoid(`/api/source-reader/plugins/${encodeURIComponent(id)}/permissions/approve`, {
    method: 'POST',
    body: JSON.stringify({ version })
  });

export const denySourcePluginPermissions = (id: string, version: string) =>
  httpVoid(`/api/source-reader/plugins/${encodeURIComponent(id)}/permissions/deny`, {
    method: 'POST',
    body: JSON.stringify({ version })
  });

export function useSourcePluginsQuery() {
  return useQuery({
    queryKey: queryKeys.sourceReader.plugins(),
    queryFn: ({ signal }) => listSourcePlugins(signal)
  });
}

export function useSourcePluginDiagnosticsQuery(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.sourceReader.plugin(id ?? ''),
    queryFn: ({ signal }) => getSourcePluginDiagnostics(id!, signal),
    enabled: Boolean(id)
  });
}

export function useSourcePluginHealthQuery(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.sourceReader.pluginHealth(id ?? ''),
    queryFn: ({ signal }) => getSourcePluginHealth(id!, signal),
    enabled: Boolean(id)
  });
}

export function useSourcePluginPermissionsQuery(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.sourceReader.pluginPermissions(id ?? ''),
    queryFn: ({ signal }) => listSourcePluginPermissions(id!, signal),
    enabled: Boolean(id)
  });
}
