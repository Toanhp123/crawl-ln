import type { SourcePluginArchivePreview } from '@novel-tool/shared';
import { httpFormData } from '../../../shared/api';

export const MAX_SOURCE_PLUGIN_ARCHIVE_BYTES = 20 * 1024 * 1024;

function archiveForm(file: File): FormData {
  const body = new FormData();
  body.set('plugin', file);
  return body;
}

export async function inspectSourcePluginArchive(file: File): Promise<SourcePluginArchivePreview> {
  if (file.size > MAX_SOURCE_PLUGIN_ARCHIVE_BYTES) {
    throw new Error('Source plugin archive exceeds 20 MiB');
  }
  return httpFormData<SourcePluginArchivePreview>(
    '/api/source-reader/plugins/import/inspect',
    archiveForm(file)
  );
}
