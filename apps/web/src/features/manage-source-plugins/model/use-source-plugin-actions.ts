import { useMutation, useQueryClient } from '@tanstack/react-query';
import { sourcePluginInvalidation, type SourcePlugin } from '../../../entities/source-plugin';
import { getPublicErrorDescription } from '../../../shared/api';
import { useI18n } from '../../../shared/i18n';
import { toast } from '../../../shared/ui';
import { removeSourcePlugin } from '../api/manage-source-plugins';
import { createPluginToggleAction } from './create-plugin-toggle-action';

export function useToggleSourcePlugin() {
  const client = useQueryClient();
  const { t } = useI18n();
  const action = createPluginToggleAction();
  return useMutation({
    mutationFn: ({ plugin, enabled }: { plugin: SourcePlugin; enabled: boolean }) =>
      action.execute(client, {
        pluginId: plugin.id,
        version: plugin.latestVersion,
        enabled
      }),
    onSuccess: (_data, input) =>
      toast({
        kind: 'success',
        title: t(input.enabled ? 'manageSourcePlugins.enabled' : 'manageSourcePlugins.disabled')
      }),
    onError: (error) =>
      toast({
        kind: 'error',
        title: t('manageSourcePlugins.failed'),
        description: getPublicErrorDescription(error)
      })
  });
}

export function useRemoveSourcePlugin(onRemoved?: () => void) {
  const client = useQueryClient();
  const { t } = useI18n();
  return useMutation({
    mutationFn: removeSourcePlugin,
    onSuccess: () => {
      toast({ kind: 'success', title: t('manageSourcePlugins.removed') });
      onRemoved?.();
    },
    onError: (error) =>
      toast({
        kind: 'error',
        title: t('manageSourcePlugins.failed'),
        description: getPublicErrorDescription(error)
      }),
    onSettled: () => sourcePluginInvalidation.invalidateAll(client)
  });
}
