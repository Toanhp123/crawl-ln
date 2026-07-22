import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/shared/ui';
import { useI18n } from '@/shared/i18n/I18nProvider';
import { queryKeys } from '@/shared/api/queryKeys';
import { updateNovel } from '../api/updateNovel';

export function useUpdateNovel() {
  const queryClient = useQueryClient();
  const { t, errorMessage } = useI18n();
  return useMutation({
    mutationFn: updateNovel,
    onSuccess: (result, novelId) => {
      toast({
        kind: result.task ? 'success' : 'info',
        title: result.task ? t('updateNovel.queued') : t('updateNovel.upToDate'),
        description: result.task
          ? t('updateNovel.queuedDescription', {
              count: result.newChapterCount || result.pendingChapterCount
            })
          : t('updateNovel.upToDateDescription')
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.novel(novelId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.novelTask(novelId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.novelsRoot });
      void queryClient.invalidateQueries({ queryKey: queryKeys.novelStats });
      void queryClient.invalidateQueries({ queryKey: queryKeys.tasks });
      void queryClient.invalidateQueries({ queryKey: queryKeys.taskSummary });
    },
    onError: (error) =>
      toast({
        kind: 'error',
        title: t('updateNovel.failed'),
        description: errorMessage(error, 'common.errorDescription')
      })
  });
}
