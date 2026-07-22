import type { SourceReaderPluginInstallResult } from '@novel-tool/shared';
import { httpFormData } from '../../../shared/api';

export const MAX_SOURCE_PLUGIN_BYTES = 20 * 1024 * 1024;

export async function installSourcePlugin(file: File): Promise<SourceReaderPluginInstallResult> {
  if (file.size > MAX_SOURCE_PLUGIN_BYTES) throw new Error('Source plugin package exceeds 20 MiB');
  const body = new FormData();
  body.set('plugin', file);
  return httpFormData<SourceReaderPluginInstallResult>('/api/source-reader/plugins/install', body);
}
