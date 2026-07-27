import { httpVoid } from '../../../shared/api';

export function deleteSourcePluginProject(projectId: string) {
  return httpVoid(`/api/source-reader/studio/projects/${encodeURIComponent(projectId)}`, {
    method: 'DELETE'
  });
}
