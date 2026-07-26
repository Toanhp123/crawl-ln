import { http } from '../../../shared/api';

export interface SourcePluginProjectTestResult {
  status: 'healthy';
  checks: string[];
  revision: number;
}

export function testSourcePluginProject(projectId: string) {
  return http<SourcePluginProjectTestResult>(
    `/api/source-reader/studio/projects/${encodeURIComponent(projectId)}/test`,
    { method: 'POST' }
  );
}
