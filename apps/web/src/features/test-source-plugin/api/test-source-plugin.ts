import type { SourceReaderPluginTestResult } from '@novel-tool/shared';
import { http } from '../../../shared/api';
export function testSourcePlugin(pluginId: string) {
  return http<SourceReaderPluginTestResult>(
    `/api/source-reader/plugins/${encodeURIComponent(pluginId)}/test`,
    { method: 'POST' }
  );
}
