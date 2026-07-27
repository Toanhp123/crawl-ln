import { useMutation, useQueryClient } from '@tanstack/react-query';
import { sourcePluginProjectInvalidation } from '../../../entities/source-plugin-project';
import { getPublicErrorDescription } from '../../../shared/api';
import { useI18n } from '../../../shared/i18n';
import { toast } from '../../../shared/ui';
import { deleteSourcePluginProject } from '../api/delete-source-plugin-project';

export function useDeleteSourcePluginProject(projectId: string, onDeleted?: () => void) {
  const client = useQueryClient();
  const { t } = useI18n();
  return useMutation({
    mutationFn: () => deleteSourcePluginProject(projectId),
    onSuccess: async () => {
      await sourcePluginProjectInvalidation.invalidateAll(client);
      toast({ kind: 'success', title: t('deleteSourcePluginProject.deleted') });
      onDeleted?.();
    },
    onError: (error) =>
      toast({
        kind: 'error',
        title: t('deleteSourcePluginProject.failed'),
        description: getPublicErrorDescription(error)
      })
  });
}
