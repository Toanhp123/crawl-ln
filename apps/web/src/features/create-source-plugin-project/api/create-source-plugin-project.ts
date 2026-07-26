import type {
  SourcePluginProject,
  SourcePluginStudioCapability,
  SourcePluginStudioSelectors
} from '../../../entities/source-plugin-project';
import { http } from '../../../shared/api';

export interface CreateSourcePluginProjectInput {
  name: string;
  pluginId: string;
  version: string;
  hosts: string[];
  capabilities: SourcePluginStudioCapability[];
  selectors: SourcePluginStudioSelectors;
}

export function createSourcePluginProject(input: CreateSourcePluginProjectInput) {
  return http<SourcePluginProject>('/api/source-reader/studio/projects', {
    method: 'POST',
    body: JSON.stringify(input)
  });
}
