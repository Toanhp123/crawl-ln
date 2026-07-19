import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteNovel } from '../api/deleteNovel';
import { queryKeys } from '@/shared/api/queryKeys';
import { toast } from '@/shared/ui';
import { useI18n } from '@/shared/i18n/I18nProvider';
export function useDeleteNovel(onDeleted: () => void) {
  const queryClient = useQueryClient();
  const { t, errorMessage } = useI18n();
  return useMutation({
    mutationFn: deleteNovel,
    onSuccess: async () => {
      toast({ kind: 'success', title: t('library.toast.deleted') });
      onDeleted();
      await queryClient.invalidateQueries({ queryKey: queryKeys.novelsRoot });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.tasks }),
        queryClient.invalidateQueries({ queryKey: queryKeys.taskSummary })
      ]);
      await queryClient.invalidateQueries({ queryKey: queryKeys.novelStats });
    },
    onError: (error) =>
      toast({
        kind: 'error',
        title: t('library.toast.deleteFailed'),
        description: errorMessage(error, 'common.errorDescription')
      })
  });
}
