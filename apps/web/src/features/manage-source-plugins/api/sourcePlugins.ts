import type { SourceReaderPluginDescriptor } from '@novel-tool/shared';
import { http, httpVoid } from '@/shared/api/http';

export type SourcePlugin = SourceReaderPluginDescriptor;

interface SourceReaderPluginResponse extends Partial<SourceReaderPluginDescriptor> {
  pluginId?: string;
}

function normalizePlugin(plugin: SourceReaderPluginResponse): SourceReaderPluginDescriptor {
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

export const listSourcePlugins = async (signal?: AbortSignal) =>
  (await http<SourceReaderPluginResponse[]>('/api/source-reader/plugins', { signal })).map(
    normalizePlugin
  );

export async function setSourcePluginEnabled(
  id: string,
  enabled: boolean,
  activeVersion?: string
): Promise<void> {
  const encodedId = encodeURIComponent(id);
  if (!enabled) {
    await httpVoid(`/api/source-reader/plugins/${encodedId}/disable`, { method: 'POST' });
    return;
  }
  if (!activeVersion) throw new Error('An active plugin version is required');
  await http<unknown>(`/api/source-reader/plugins/${encodedId}/enable`, {
    method: 'POST',
    body: JSON.stringify({ version: activeVersion })
  });
}

export const testSourcePlugin = (id: string) =>
  http(`/api/source-reader/plugins/${encodeURIComponent(id)}/test`, { method: 'POST' });
export const getSourcePluginHealth = (id: string) =>
  http(`/api/source-reader/plugins/${encodeURIComponent(id)}/health`);
export const listSourceCredentials = () =>
  http<Array<Record<string, unknown>>>('/api/source-reader/credentials');
export const listSourceNetworkProfiles = () =>
  http<Array<Record<string, unknown>>>('/api/source-reader/network-profiles');
export const listSourceAuthChallenges = () =>
  http<Array<Record<string, unknown>>>('/api/source-reader/auth/challenges');
