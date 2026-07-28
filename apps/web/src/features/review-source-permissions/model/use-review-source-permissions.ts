import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getSourcePluginUsageConflict,
  sourcePluginInvalidation,
  type SourcePluginUsageConflict
} from '../../../entities/source-plugin';
import { useI18n } from '../../../shared/i18n';
import { toast } from '../../../shared/ui';
import { reviewSourcePermissions } from '../api/review-source-permissions';

export function useReviewSourcePermissions(
  pluginId: string,
  version: string,
  onUsageConflict?: (conflict: SourcePluginUsageConflict) => void
) {
  const client = useQueryClient();
  const { errorMessage, t } = useI18n();
  return useMutation({
    mutationFn: (approved: boolean) => reviewSourcePermissions(pluginId, version, approved),
    onSuccess: (_data, approved) =>
      toast({
        kind: 'success',
        title: t(approved ? 'reviewSourcePermissions.approved' : 'reviewSourcePermissions.denied')
      }),
    onError: (error) => {
      const conflict = getSourcePluginUsageConflict(error);
      if (conflict?.operation === 'deny' && onUsageConflict) {
        onUsageConflict(conflict);
        return;
      }
      toast({
        kind: 'error',
        title: t('reviewSourcePermissions.failed'),
        description: errorMessage(error)
      });
    },
    onSettled: () => sourcePluginInvalidation.invalidateAll(client)
  });
}
