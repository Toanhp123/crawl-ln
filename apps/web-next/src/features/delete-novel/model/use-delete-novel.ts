import { useMutation, useQueryClient } from '@tanstack/react-query';
import { novelInvalidation } from '../../../entities/novel';
import { taskInvalidation } from '../../../entities/task';
import { useI18n } from '../../../shared/i18n';
import { toast } from '../../../shared/ui';
import { deleteNovel } from '../api/delete-novel';

export function useDeleteNovel(options: { onDeleted?: (novelId: string) => void } = {}) {
  const client = useQueryClient();
  const { t, errorMessage } = useI18n();
  return useMutation({
    mutationFn: deleteNovel,
    onSuccess: async (novelId) => {
      await Promise.all([
        novelInvalidation.invalidateAll(client),
        taskInvalidation.invalidateAll(client),
        taskInvalidation.invalidateForNovel(client, novelId)
      ]);
      toast({ kind: 'success', title: t('deleteNovel.deleted') });
      options.onDeleted?.(novelId);
    },
    onError: (error) =>
      toast({
        kind: 'error',
        title: t('deleteNovel.failed'),
        description: errorMessage(error, 'common.requestFailed')
      })
  });
}
