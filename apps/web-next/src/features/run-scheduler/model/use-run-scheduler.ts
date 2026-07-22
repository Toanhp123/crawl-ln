import { useMutation, useQueryClient } from '@tanstack/react-query';
import { novelInvalidation } from '../../../entities/novel';
import { schedulerInvalidation } from '../../../entities/scheduler';
import { taskInvalidation } from '../../../entities/task';
import { useI18n } from '../../../shared/i18n';
import { toast } from '../../../shared/ui';
import { runScheduler } from '../api/run-scheduler';

export function useRunScheduler() {
  const client = useQueryClient();
  const { t, errorMessage } = useI18n();
  return useMutation({
    mutationFn: runScheduler,
    onSuccess: async () => {
      await Promise.all([
        schedulerInvalidation.invalidateAll(client),
        novelInvalidation.invalidateList(client),
        taskInvalidation.invalidateAll(client)
      ]);
      toast({ kind: 'success', title: t('scheduler.completed') });
    },
    onError: (error) =>
      toast({
        kind: 'error',
        title: t('scheduler.failed'),
        description: errorMessage(error, 'common.requestFailed')
      })
  });
}
