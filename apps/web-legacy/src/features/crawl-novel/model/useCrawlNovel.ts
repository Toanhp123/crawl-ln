import { useMutation, useQueryClient } from '@tanstack/react-query';
import { crawlNovel } from '../api/crawlNovel';
import { queryKeys } from '@/shared/api/queryKeys';
import { toast } from '@/shared/ui';
import { useI18n } from '@/shared/i18n/I18nProvider';
export function useCrawlNovel() {
  const queryClient = useQueryClient();
  const { t, errorMessage } = useI18n();
  return useMutation({
    mutationFn: crawlNovel,
    onSuccess: (createdTask) => {
      toast({
        kind: 'info',
        title: t('crawl.toast.queued'),
        description: t('crawl.toast.queuedDescription', { id: createdTask.id })
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.tasks });
      void queryClient.invalidateQueries({ queryKey: queryKeys.taskSummary });
      void queryClient.invalidateQueries({ queryKey: queryKeys.novelTask(createdTask.novelId) });
    },
    onError: (error) =>
      toast({
        kind: 'error',
        title: t('crawl.toast.queueFailed'),
        description: errorMessage(error, 'common.errorDescription')
      })
  });
}
