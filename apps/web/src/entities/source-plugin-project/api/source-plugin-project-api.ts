import { http } from '../../../shared/api';
import type { SourcePluginProject } from '../model/types';

export function listSourcePluginProjects(signal?: AbortSignal) {
  return http<SourcePluginProject[]>('/api/source-reader/studio/projects', { signal });
}

export function getSourcePluginProject(id: string, signal?: AbortSignal) {
  return http<SourcePluginProject>(`/api/source-reader/studio/projects/${encodeURIComponent(id)}`, {
    signal
  });
}
