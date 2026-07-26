import { useMutation, useQueryClient } from '@tanstack/react-query';
import { sourcePluginProjectInvalidation } from '../../../entities/source-plugin-project';
import { createSourcePluginProject } from '../api/create-source-plugin-project';

export function useCreateSourcePluginProject() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: createSourcePluginProject,
    onSettled: () => sourcePluginProjectInvalidation.invalidateAll(client)
  });
}
