import { useMutation, useQueryClient } from '@tanstack/react-query';
import { sourcePluginProjectInvalidation } from '../../../entities/source-plugin-project';
import { buildSourcePluginProject } from '../api/build-source-plugin-project';

export function useBuildSourcePluginProject() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: buildSourcePluginProject,
    onSettled: () => sourcePluginProjectInvalidation.invalidateAll(client)
  });
}
