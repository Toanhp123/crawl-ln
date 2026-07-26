import { requestDownload, type DownloadArtifact } from '../../../shared/api';

export function exportSourcePluginProject(projectId: string): Promise<DownloadArtifact> {
  return requestDownload(
    fetch,
    `/api/source-reader/studio/projects/${encodeURIComponent(projectId)}/export`,
    {},
    'source-plugin.source-plugin'
  );
}
