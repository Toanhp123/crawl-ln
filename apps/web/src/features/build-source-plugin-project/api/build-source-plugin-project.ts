import { http } from '../../../shared/api';

export interface SourcePluginProjectBuildResult {
  artifactName: string;
  checksum: string;
  size: number;
  revision: number;
  stale: boolean;
  manifest: unknown;
}

export function buildSourcePluginProject(projectId: string) {
  return http<SourcePluginProjectBuildResult>(
    `/api/source-reader/studio/projects/${encodeURIComponent(projectId)}/build`,
    { method: 'POST' }
  );
}
