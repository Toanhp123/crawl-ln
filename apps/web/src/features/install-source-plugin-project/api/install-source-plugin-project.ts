import { http } from '../../../shared/api';

export function installSourcePluginProject(projectId: string) {
  return http<Record<string, unknown>>(
    `/api/source-reader/studio/projects/${encodeURIComponent(projectId)}/install`,
    { method: 'POST' }
  );
}
