import { useMutation, useQueryClient } from '@tanstack/react-query';
import { sourcePluginInvalidation } from '../../../entities/source-plugin';
import { getPublicErrorDescription } from '../../../shared/api';
import { useI18n } from '../../../shared/i18n';
import { toast } from '../../../shared/ui';
import { reviewSourcePermissions } from '../api/review-source-permissions';

export function useReviewSourcePermissions(pluginId: string, version: string) {
  const client = useQueryClient();
  const { t } = useI18n();
  return useMutation({
    mutationFn: (approved: boolean) => reviewSourcePermissions(pluginId, version, approved),
    onSuccess: (_data, approved) =>
      toast({
        kind: 'success',
        title: t(approved ? 'reviewSourcePermissions.approved' : 'reviewSourcePermissions.denied')
      }),
    onError: (error) =>
      toast({
        kind: 'error',
        title: t('reviewSourcePermissions.failed'),
        description: getPublicErrorDescription(error)
      }),
    onSettled: () => sourcePluginInvalidation.invalidateAll(client)
  });
}
