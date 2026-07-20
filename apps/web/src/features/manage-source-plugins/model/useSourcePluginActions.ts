import type { SourceReaderPluginDescriptor } from '@novel-tool/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  disableSourcePlugin,
  enableSourcePlugin,
  removeSourcePlugin
} from '@/entities/source-plugin';
import { queryKeys } from '@/shared/api/queryKeys';
import { useI18n } from '@/shared/i18n/I18nProvider';
import { toast } from '@/shared/ui';

export function useToggleSourcePlugin() {
  const client = useQueryClient();
  const { t, errorMessage } = useI18n();
  return useMutation({
    mutationFn: async ({
      plugin,
      enabled
    }: {
      plugin: SourceReaderPluginDescriptor;
      enabled: boolean;
    }) => {
      if (enabled) {
        if (!plugin.activeVersion) throw new Error(t('sources.plugins.activeVersionRequired'));
        await enableSourcePlugin(plugin.id, plugin.activeVersion);
      } else await disableSourcePlugin(plugin.id);
      return enabled;
    },
    onMutate: async ({ plugin, enabled }) => {
      const key = queryKeys.sourceReader.plugins();
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<SourceReaderPluginDescriptor[]>(key);
      client.setQueryData<SourceReaderPluginDescriptor[]>(key, (plugins = []) =>
        plugins.map((current) =>
          current.id === plugin.id
            ? { ...current, enabled, status: enabled ? 'initializing' : 'disabled' }
            : current
        )
      );
      return { previous };
    },
    onSuccess: (enabled) =>
      toast({
        kind: 'success',
        title: t(enabled ? 'sources.plugins.enabled' : 'sources.plugins.disabled')
      }),
    onError: (error, _input, context) => {
      if (context?.previous)
        client.setQueryData(queryKeys.sourceReader.plugins(), context.previous);
      toast({ kind: 'error', title: t('sources.updateFailed'), description: errorMessage(error) });
    },
    onSettled: (_data, _error, input) => {
      void client.invalidateQueries({ queryKey: queryKeys.sourceReader.plugins() });
      void client.invalidateQueries({ queryKey: queryKeys.sourceReader.plugin(input.plugin.id) });
    }
  });
}

export function useRemoveSourcePlugin(onRemoved?: () => void) {
  const client = useQueryClient();
  const { t, errorMessage } = useI18n();
  return useMutation({
    mutationFn: removeSourcePlugin,
    onSuccess: (_data, id) => {
      client.removeQueries({ queryKey: queryKeys.sourceReader.plugin(id) });
      toast({ kind: 'success', title: t('sources.plugins.removed') });
      onRemoved?.();
    },
    onError: (error) =>
      toast({ kind: 'error', title: t('sources.updateFailed'), description: errorMessage(error) }),
    onSettled: () => void client.invalidateQueries({ queryKey: queryKeys.sourceReader.plugins() })
  });
}
