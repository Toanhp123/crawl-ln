import type {
  SourcePluginProject,
  SourcePluginStudioCapability,
  SourcePluginStudioSelectors
} from '../../../entities/source-plugin-project';
import { http } from '../../../shared/api';

export interface UpdateSourcePluginProjectInput {
  expectedRevision: number;
  name?: string;
  pluginId?: string;
  version?: string;
  hosts?: string[];
  capabilities?: SourcePluginStudioCapability[];
  selectors?: SourcePluginStudioSelectors;
  files?: Record<string, string>;
}

export function updateSourcePluginProject(
  projectId: string,
  patch: UpdateSourcePluginProjectInput
) {
  return http<SourcePluginProject>(
    `/api/source-reader/studio/projects/${encodeURIComponent(projectId)}`,
    { method: 'PATCH', body: JSON.stringify(patch) }
  );
}
