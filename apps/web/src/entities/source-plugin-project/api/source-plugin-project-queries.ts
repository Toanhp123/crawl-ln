import { useQuery } from '@tanstack/react-query';
import { getSourcePluginProject, listSourcePluginProjects } from './source-plugin-project-api';
import { sourcePluginProjectKeys } from './source-plugin-project-keys';

export function useSourcePluginProjects() {
  return useQuery({
    queryKey: sourcePluginProjectKeys.list(),
    queryFn: ({ signal }) => listSourcePluginProjects(signal),
    staleTime: 10_000,
    refetchOnWindowFocus: false
  });
}

export function useSourcePluginProject(id: string | null | undefined) {
  return useQuery({
    queryKey: sourcePluginProjectKeys.detail(id ?? ''),
    queryFn: ({ signal }) => getSourcePluginProject(id!, signal),
    enabled: Boolean(id),
    staleTime: 10_000,
    refetchOnWindowFocus: false
  });
}
