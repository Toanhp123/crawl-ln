import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AutoUpdateInterval, NovelDetail } from '@novel-tool/shared';
import { queryKeys } from '@/shared/api/queryKeys';
import { useI18n } from '@/shared/i18n/I18nProvider';
import { getRealtimePollingInterval, useRealtimeStatus } from '@/shared/realtime';
import { toast } from '@/shared/ui';
import { getNovelUpdateDiagnostics, updateAutoUpdatePolicy } from '../api/autoUpdate';

export function useAutoUpdate(novelId: string, diagnosticsEnabled = true) {
  const queryClient = useQueryClient();
  const realtimeStatus = useRealtimeStatus();
  const { t, errorMessage } = useI18n();
  const novelKey = queryKeys.novel(novelId);
  const diagnostics = useQuery({
    queryKey: queryKeys.novelUpdateDiagnostics(novelId),
    queryFn: ({ signal }) => getNovelUpdateDiagnostics(novelId, signal),
    enabled: diagnosticsEnabled,
    refetchInterval: () => getRealtimePollingInterval(realtimeStatus, diagnosticsEnabled, 15_000)
  });
  const policy = useMutation({
    mutationFn: (input: { enabled: boolean; intervalMinutes: AutoUpdateInterval }) =>
      updateAutoUpdatePolicy(novelId, input.enabled, input.intervalMinutes),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: novelKey });
      const previousDetail = queryClient.getQueryData<NovelDetail>(novelKey);
      queryClient.setQueryData<NovelDetail>(novelKey, (current) =>
        current
          ? {
              ...current,
              novel: {
                ...current.novel,
                autoUpdateEnabled: input.enabled,
                updateIntervalMinutes: input.intervalMinutes
              }
            }
          : current
      );
      return { previousDetail };
    },
    onSuccess: (updatedNovel) => {
      queryClient.setQueryData<NovelDetail>(novelKey, (current) =>
        current ? { ...current, novel: updatedNovel } : current
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.schedulerStatus });
    },
    onError: (error, _input, context) => {
      if (context?.previousDetail) {
        queryClient.setQueryData(novelKey, context.previousDetail);
      }
      toast({
        kind: 'error',
        title: t('autoUpdate.updateFailed'),
        description: errorMessage(error)
      });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: novelKey });
    }
  });
  return { diagnostics, policy };
}
