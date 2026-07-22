import { useMutation, useQueryClient } from '@tanstack/react-query';
import { novelInvalidation } from '../../../entities/novel';
import { taskInvalidation } from '../../../entities/task';
import { useI18n } from '../../../shared/i18n';
import { toast } from '../../../shared/ui';
import { updateNovel } from '../api/update-novel';

export function useUpdateNovel() {
  const client = useQueryClient();
  const { t, errorMessage } = useI18n();
  return useMutation({
    mutationFn: updateNovel,
    onSuccess: async (result, novelId) => {
      await Promise.all([
        novelInvalidation.invalidateAll(client),
        novelInvalidation.invalidateDetail(client, novelId),
        taskInvalidation.invalidateAll(client),
        taskInvalidation.invalidateForNovel(client, novelId)
      ]);
      toast({
        kind: result.task ? 'success' : 'info',
        title: result.task ? t('updateNovel.queued') : t('updateNovel.upToDate'),
        description: result.task
          ? t('updateNovel.queuedDescription', {
              count: result.newChapterCount || result.pendingChapterCount
            })
          : t('updateNovel.upToDateDescription')
      });
    },
    onError: (error) =>
      toast({
        kind: 'error',
        title: t('updateNovel.failed'),
        description: errorMessage(error, 'common.requestFailed')
      })
  });
}
