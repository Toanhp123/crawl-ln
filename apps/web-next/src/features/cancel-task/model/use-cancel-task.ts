import { useMutation, useQueryClient } from '@tanstack/react-query';
import { taskInvalidation } from '../../../entities/task';
import { useI18n } from '../../../shared/i18n';
import { toast } from '../../../shared/ui';
import { cancelTask } from '../api/cancel-task';

export function useCancelTask() {
  const client = useQueryClient();
  const { t, errorMessage } = useI18n();
  return useMutation({
    mutationFn: cancelTask,
    onSuccess: async (task) => {
      await Promise.all([
        taskInvalidation.invalidateDetail(client, task.id),
        taskInvalidation.invalidateNovel(client, task.novelId),
        taskInvalidation.invalidateAll(client)
      ]);
      toast({ kind: 'success', title: t('cancelTask.success') });
    },
    onError: (error) =>
      toast({
        kind: 'error',
        title: t('cancelTask.failed'),
        description: errorMessage(error, 'common.requestFailed')
      })
  });
}
