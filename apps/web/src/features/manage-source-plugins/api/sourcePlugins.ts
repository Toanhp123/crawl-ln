import type { SourcePluginDescriptor } from '@novel-tool/shared';
import { http } from '@/shared/api/http';

export type SourcePlugin = SourcePluginDescriptor;

export const listSourcePlugins = (signal?: AbortSignal) =>
  http<SourcePluginDescriptor[]>('/api/plugins', { signal });
export const reloadSourcePlugins = () =>
  http<SourcePluginDescriptor[]>('/api/plugins/reload', { method: 'POST' });
export const setSourcePluginEnabled = (id: string, enabled: boolean) =>
  http<SourcePluginDescriptor>(`/api/plugins/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ enabled })
  });
