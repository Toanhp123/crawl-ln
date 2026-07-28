import type { SourcePluginProjectImportResolution } from '@novel-tool/shared';
import { MAX_SOURCE_PLUGIN_ARCHIVE_BYTES } from '../../../entities/source-plugin-archive';
import type { SourcePluginProject } from '../../../entities/source-plugin-project';
import { httpFormData } from '../../../shared/api';

export interface ImportSourcePluginProjectInput {
  file: File;
  expectedChecksum: string;
  resolution: SourcePluginProjectImportResolution;
}

export function importSourcePluginProject({
  file,
  expectedChecksum,
  resolution
}: ImportSourcePluginProjectInput): Promise<SourcePluginProject> {
  if (file.size > MAX_SOURCE_PLUGIN_ARCHIVE_BYTES) {
    throw new Error('Source plugin archive exceeds 20 MiB');
  }
  const body = new FormData();
  body.set('plugin', file);
  body.set('expectedChecksum', expectedChecksum);
  body.set('resolutionJson', JSON.stringify(resolution));
  return httpFormData<SourcePluginProject>('/api/source-reader/studio/projects/import', body);
}
