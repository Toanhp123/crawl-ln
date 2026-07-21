import { useMutation, useQueryClient } from '@tanstack/react-query';
import { taskInvalidation } from '../../../entities/task';
import { useI18n } from '../../../shared/i18n';
import { toast } from '../../../shared/ui';
import { resumeTask } from '../api/resume-task';

export function useResumeTask() {
  const client = useQueryClient();
  const { t, errorMessage } = useI18n();
  return useMutation({
    mutationFn: resumeTask,
    onSuccess: async (task) => {
      await Promise.all([
        taskInvalidation.invalidateDetail(client, task.id),
        taskInvalidation.invalidateNovel(client, task.novelId),
        taskInvalidation.invalidateAll(client)
      ]);
      toast({ kind: 'info', title: t('resumeTask.success') });
    },
    onError: (error) =>
      toast({
        kind: 'error',
        title: t('resumeTask.failed'),
        description: errorMessage(error, 'common.requestFailed')
      })
  });
}
