import { useMutation, useQueryClient } from '@tanstack/react-query';
import { sourcePluginInvalidation, type SourcePlugin } from '../../../entities/source-plugin';
import { getPublicErrorDescription } from '../../../shared/api';
import { useI18n } from '../../../shared/i18n';
import { toast } from '../../../shared/ui';
import { activateLatestSourcePlugin, removeSourcePlugin } from '../api/manage-source-plugins';
import { createPluginToggleAction } from './create-plugin-toggle-action';
import {
  getSourcePluginUsageConflict,
  type SourcePluginUsageConflict
} from './source-plugin-usage-conflict';

export function useToggleSourcePlugin(
  onUsageConflict?: (conflict: SourcePluginUsageConflict) => void
) {
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
    onError: (error) => {
      const conflict = getSourcePluginUsageConflict(error);
      if (conflict && onUsageConflict) {
        onUsageConflict(conflict);
        return;
      }
      toast({
        kind: 'error',
        title: t('manageSourcePlugins.failed'),
        description: getPublicErrorDescription(error)
      });
    }
  });
}

export function useRemoveSourcePlugin(
  onRemoved?: () => void,
  onUsageConflict?: (conflict: SourcePluginUsageConflict) => void
) {
  const client = useQueryClient();
  const { t } = useI18n();
  return useMutation({
    mutationFn: removeSourcePlugin,
    onSuccess: () => {
      toast({ kind: 'success', title: t('manageSourcePlugins.removed') });
      onRemoved?.();
    },
    onError: (error) => {
      const conflict = getSourcePluginUsageConflict(error);
      if (conflict && onUsageConflict) {
        onUsageConflict(conflict);
        return;
      }
      toast({
        kind: 'error',
        title: t('manageSourcePlugins.failed'),
        description: getPublicErrorDescription(error)
      });
    },
    onSettled: () => sourcePluginInvalidation.invalidateAll(client)
  });
}

export function useActivateLatestSourcePlugin() {
  const client = useQueryClient();
  const { t } = useI18n();
  return useMutation({
    mutationFn: ({ pluginId, version }: { pluginId: string; version: string }) =>
      activateLatestSourcePlugin(pluginId, version),
    onSuccess: () => toast({ kind: 'success', title: t('manageSourcePlugins.latestActivated') }),
    onError: (error) =>
      toast({
        kind: 'error',
        title: t('manageSourcePlugins.failed'),
        description: getPublicErrorDescription(error)
      }),
    onSettled: () => sourcePluginInvalidation.invalidateAll(client)
  });
}
