import type { SourceReaderPluginActivationResult } from '@novel-tool/shared';
import { http, httpVoid } from '../../../shared/api';

export function enableSourcePlugin(pluginId: string, version: string) {
  return http<SourceReaderPluginActivationResult>(
    `/api/source-reader/plugins/${encodeURIComponent(pluginId)}/enable`,
    { method: 'POST', body: JSON.stringify({ version }) }
  );
}
export function disableSourcePlugin(pluginId: string) {
  return httpVoid(`/api/source-reader/plugins/${encodeURIComponent(pluginId)}/disable`, {
    method: 'POST'
  });
}
export function removeSourcePlugin(pluginId: string) {
  return httpVoid(`/api/source-reader/plugins/${encodeURIComponent(pluginId)}`, {
    method: 'DELETE'
  });
}
