import { useMutation, useQueryClient } from '@tanstack/react-query';
import { sourcePluginInvalidation } from '../../../entities/source-plugin';
import { useI18n } from '../../../shared/i18n';
import { toast } from '../../../shared/ui';
import { installSourcePlugin } from '../api/install-source-plugin';

export function useInstallSourcePlugin(onInstalled?: () => void) {
  const client = useQueryClient();
  const { errorMessage, t } = useI18n();
  return useMutation({
    mutationFn: installSourcePlugin,
    onSuccess: async () => {
      await sourcePluginInvalidation.invalidateAll(client);
      toast({ kind: 'success', title: t('installSourcePlugin.installed') });
      onInstalled?.();
    },
    onError: (error) =>
      toast({
        kind: 'error',
        title: t('installSourcePlugin.failed'),
        description: errorMessage(error)
      })
  });
}
