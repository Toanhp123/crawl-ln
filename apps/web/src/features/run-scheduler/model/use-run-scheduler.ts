import { useMutation, useQueryClient } from '@tanstack/react-query';
import { novelInvalidation } from '../../../entities/novel';
import { schedulerInvalidation } from '../../../entities/scheduler';
import { taskInvalidation } from '../../../entities/task';
import { runScheduler } from '../api/run-scheduler';

export function useRunScheduler() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: runScheduler,
    onSuccess: async () => {
      await Promise.all([
        schedulerInvalidation.invalidateAll(client),
        novelInvalidation.invalidateList(client),
        taskInvalidation.invalidateAll(client)
      ]);
    }
  });
}
