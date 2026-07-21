import { useMutation, useQueryClient } from '@tanstack/react-query';
import { taskInvalidation } from '../../../entities/task';
import { useI18n } from '../../../shared/i18n';
import { toast } from '../../../shared/ui';
import { crawlNovel } from '../api/crawl-novel';

export function useCrawlNovel() {
  const client = useQueryClient();
  const { t, errorMessage } = useI18n();
  return useMutation({
    mutationFn: crawlNovel,
    onSuccess: async (task) => {
      await Promise.all([
        taskInvalidation.invalidateAll(client),
        taskInvalidation.invalidateNovel(client, task.novelId)
      ]);
      toast({
        kind: 'info',
        title: t('crawlNovel.queued'),
        description: t('crawlNovel.queuedDescription', { id: task.id })
      });
    },
    onError: (error) =>
      toast({
        kind: 'error',
        title: t('crawlNovel.failed'),
        description: errorMessage(error, 'common.requestFailed')
      })
  });
}
