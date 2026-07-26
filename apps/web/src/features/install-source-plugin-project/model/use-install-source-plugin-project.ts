import { useMutation, useQueryClient } from '@tanstack/react-query';
import { installSourcePluginProject } from '../api/install-source-plugin-project';
import { invalidateInstalledSourcePluginProject } from './invalidate-installed-source-plugin-project';

export function useInstallSourcePluginProject() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: installSourcePluginProject,
    onSettled: () => invalidateInstalledSourcePluginProject(client)
  });
}
