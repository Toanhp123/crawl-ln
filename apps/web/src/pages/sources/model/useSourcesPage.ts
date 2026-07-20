import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listSourceAuthChallenges,
  listSourceCredentials,
  listSourceNetworkProfiles,
  listSourcePlugins,
  setSourcePluginEnabled,
  type SourcePlugin
} from '@/features/manage-source-plugins/api/sourcePlugins';
import { queryKeys } from '@/shared/api/queryKeys';
import { useI18n } from '@/shared/i18n/I18nProvider';
import { toast } from '@/shared/ui';

export function useSourcesPage() {
  const client = useQueryClient();
  const { t, errorMessage } = useI18n();
  const query = useQuery({
    queryKey: queryKeys.sourcePlugins,
    queryFn: ({ signal }) => listSourcePlugins(signal)
  });
  const credentials = useQuery({
    queryKey: queryKeys.sourceReaderCredentials,
    queryFn: listSourceCredentials
  });
  const networkProfiles = useQuery({
    queryKey: queryKeys.sourceReaderNetworkProfiles,
    queryFn: listSourceNetworkProfiles
  });
  const challenges = useQuery({
    queryKey: queryKeys.sourceReaderChallenges,
    queryFn: listSourceAuthChallenges
  });
  const reload = useMutation({
    mutationFn: () => listSourcePlugins(),
    onSuccess: (data) => {
      client.setQueryData(queryKeys.sourcePlugins, data);
      toast({ kind: 'success', title: t('sources.refreshed') });
    },
    onError: (error) =>
      toast({
        kind: 'error',
        title: t('sources.refreshFailed'),
        description: errorMessage(error)
      })
  });
  const toggle = useMutation({
    mutationFn: ({ plugin, enabled }: { plugin: SourcePlugin; enabled: boolean }) =>
      setSourcePluginEnabled(plugin.id, enabled, plugin.activeVersion),
    onMutate: async ({ plugin, enabled }) => {
      await client.cancelQueries({ queryKey: queryKeys.sourcePlugins });
      const previousPlugins = client.getQueryData<SourcePlugin[]>(queryKeys.sourcePlugins);
      client.setQueryData<SourcePlugin[]>(queryKeys.sourcePlugins, (plugins = []) =>
        plugins.map((current) =>
          current.id === plugin.id
            ? {
                ...current,
                enabled,
                status: enabled ? 'initializing' : 'disabled'
              }
            : current
        )
      );
      return { previousPlugins };
    },
    onSuccess: () => {
      toast({ kind: 'success', title: t('sources.updated') });
    },
    onError: (error, _variables, context) => {
      if (context?.previousPlugins) {
        client.setQueryData(queryKeys.sourcePlugins, context.previousPlugins);
      }
      toast({
        kind: 'error',
        title: t('sources.updateFailed'),
        description: errorMessage(error)
      });
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: queryKeys.sourcePlugins });
    }
  });
  return { query, credentials, networkProfiles, challenges, reload, toggle };
}
