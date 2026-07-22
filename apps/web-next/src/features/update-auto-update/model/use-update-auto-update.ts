import { useMutation, useQueryClient } from '@tanstack/react-query';
import { novelInvalidation } from '../../../entities/novel';
import { schedulerInvalidation } from '../../../entities/scheduler';
import { useI18n } from '../../../shared/i18n';
import { toast } from '../../../shared/ui';
import { updateAutoUpdate, type UpdateAutoUpdateInput } from '../api/update-auto-update';

export function useUpdateAutoUpdate() {
  const client = useQueryClient();
  const { t, errorMessage } = useI18n();
  return useMutation({
    mutationFn: updateAutoUpdate,
    onSuccess: async (_novel, input: UpdateAutoUpdateInput) => {
      await Promise.all([
        novelInvalidation.invalidateList(client),
        novelInvalidation.invalidateDetail(client, input.novelId),
        schedulerInvalidation.invalidateStatus(client),
        schedulerInvalidation.invalidateNovelDiagnostics(client, input.novelId)
      ]);
      toast({ kind: 'success', title: t('autoUpdate.saved') });
    },
    onError: (error) =>
      toast({
        kind: 'error',
        title: t('autoUpdate.failed'),
        description: errorMessage(error, 'common.requestFailed')
      })
  });
}
