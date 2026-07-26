import { http, httpVoid, requestDownload, type DownloadArtifact } from '../../../shared/api';
import type {
  SourcePluginProject,
  SourcePluginStudioCapability,
  SourcePluginStudioSelectors
} from '../../../entities/source-plugin-project';

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

export function updateSourcePluginProject(
  projectId: string,
  patch: Partial<CreateSourcePluginProjectInput> & {
    expectedRevision: number;
    files?: Record<string, string>;
  }
) {
  return http<SourcePluginProject>(
    `/api/source-reader/studio/projects/${encodeURIComponent(projectId)}`,
    { method: 'PATCH', body: JSON.stringify(patch) }
  );
}

export function deleteSourcePluginProject(projectId: string) {
  return httpVoid(`/api/source-reader/studio/projects/${encodeURIComponent(projectId)}`, {
    method: 'DELETE'
  });
}

export function buildSourcePluginProject(projectId: string) {
  return http<unknown>(
    `/api/source-reader/studio/projects/${encodeURIComponent(projectId)}/build`,
    { method: 'POST' }
  );
}

export function testSourcePluginProject(projectId: string) {
  return http<unknown>(`/api/source-reader/studio/projects/${encodeURIComponent(projectId)}/test`, {
    method: 'POST'
  });
}

export function installSourcePluginProject(projectId: string) {
  return http<unknown>(
    `/api/source-reader/studio/projects/${encodeURIComponent(projectId)}/install`,
    { method: 'POST' }
  );
}

export function exportSourcePluginProject(projectId: string): Promise<DownloadArtifact> {
  return requestDownload(
    fetch,
    `/api/source-reader/studio/projects/${encodeURIComponent(projectId)}/export`,
    {},
    'source-plugin.source-plugin'
  );
}
