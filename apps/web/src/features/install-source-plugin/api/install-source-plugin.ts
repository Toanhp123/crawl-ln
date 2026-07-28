import type { SourceReaderPluginInstallResult } from '@novel-tool/shared';
import { httpFormData } from '../../../shared/api';
import { MAX_SOURCE_PLUGIN_ARCHIVE_BYTES } from '../../../entities/source-plugin-archive';

export const MAX_SOURCE_PLUGIN_BYTES = 20 * 1024 * 1024;

export async function installSourcePlugin(file: File): Promise<SourceReaderPluginInstallResult> {
  if (file.size > MAX_SOURCE_PLUGIN_BYTES) throw new Error('Source plugin package exceeds 20 MiB');
  const body = new FormData();
  body.set('plugin', file);
  return httpFormData<SourceReaderPluginInstallResult>('/api/source-reader/plugins/install', body);
}

export async function installSourcePluginArchive(
  file: File,
  expectedChecksum: string
): Promise<SourceReaderPluginInstallResult> {
  if (file.size > MAX_SOURCE_PLUGIN_ARCHIVE_BYTES) {
    throw new Error('Source plugin archive exceeds 20 MiB');
  }
  const body = new FormData();
  body.set('plugin', file);
  body.set('expectedChecksum', expectedChecksum);
  return httpFormData<SourceReaderPluginInstallResult>(
    '/api/source-reader/plugins/import/install',
    body
  );
}
