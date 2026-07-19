import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listSourcePlugins,
  reloadSourcePlugins,
  setSourcePluginEnabled,
  type SourcePlugin
} from '@/features/manage-source-plugins/api/sourcePlugins';
import { useI18n } from '@/shared/i18n/I18nProvider';
import { toast } from '@/shared/ui';

export const sourcePluginsKey = ['source-plugins'] as const;

export function useSourcesPage() {
  const client = useQueryClient();
  const { t, errorMessage } = useI18n();
  const query = useQuery({
    queryKey: sourcePluginsKey,
    queryFn: ({ signal }) => listSourcePlugins(signal)
  });
  const reload = useMutation({
    mutationFn: reloadSourcePlugins,
    onSuccess: (data) => {
      client.setQueryData(sourcePluginsKey, data);
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
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      setSourcePluginEnabled(id, enabled),
    onMutate: async ({ id, enabled }) => {
      await client.cancelQueries({ queryKey: sourcePluginsKey });
      const previousPlugins = client.getQueryData<SourcePlugin[]>(sourcePluginsKey);
      client.setQueryData<SourcePlugin[]>(sourcePluginsKey, (plugins) =>
        plugins?.map((plugin) =>
          plugin.manifest.id === id
            ? {
                ...plugin,
                enabled,
                status: enabled
                  ? plugin.status === 'disabled'
                    ? 'active'
                    : plugin.status
                  : 'disabled'
              }
            : plugin
        )
      );
      return { previousPlugins };
    },
    onSuccess: (updatedPlugin) => {
      client.setQueryData<SourcePlugin[]>(sourcePluginsKey, (plugins) =>
        plugins?.map((plugin) =>
          plugin.manifest.id === updatedPlugin.manifest.id ? updatedPlugin : plugin
        )
      );
      toast({ kind: 'success', title: t('sources.updated') });
    },
    onError: (error, _variables, context) => {
      if (context?.previousPlugins) {
        client.setQueryData(sourcePluginsKey, context.previousPlugins);
      }
      toast({
        kind: 'error',
        title: t('sources.updateFailed'),
        description: errorMessage(error)
      });
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: sourcePluginsKey });
    }
  });
  return { query, reload, toggle };
}
