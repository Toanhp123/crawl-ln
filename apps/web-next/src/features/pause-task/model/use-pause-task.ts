import { useMutation, useQueryClient } from '@tanstack/react-query';
import { taskInvalidation } from '../../../entities/task';
import { useI18n } from '../../../shared/i18n';
import { toast } from '../../../shared/ui';
import { pauseTask } from '../api/pause-task';

export function usePauseTask() {
  const client = useQueryClient();
  const { t, errorMessage } = useI18n();
  return useMutation({
    mutationFn: pauseTask,
    onSuccess: async (task) => {
      await Promise.all([
        taskInvalidation.invalidateDetail(client, task.id),
        taskInvalidation.invalidateForNovel(client, task.novelId),
        taskInvalidation.invalidateAll(client)
      ]);
      toast({ kind: 'info', title: t('pauseTask.success') });
    },
    onError: (error) =>
      toast({
        kind: 'error',
        title: t('pauseTask.failed'),
        description: errorMessage(error, 'common.requestFailed')
      })
  });
}
