import { useMutation, useQueryClient } from '@tanstack/react-query';
import { sourcePluginInvalidation } from '../../../entities/source-plugin';
import { getPublicErrorDescription } from '../../../shared/api';
import { useI18n } from '../../../shared/i18n';
import { toast } from '../../../shared/ui';
import { testSourcePlugin } from '../api/test-source-plugin';
export function useTestSourcePlugin(pluginId: string) {
  const client = useQueryClient();
  const { t } = useI18n();
  return useMutation({
    mutationFn: () => testSourcePlugin(pluginId),
    onSuccess: () => toast({ kind: 'success', title: t('testSourcePlugin.completed') }),
    onError: (error) =>
      toast({
        kind: 'error',
        title: t('testSourcePlugin.failed'),
        description: getPublicErrorDescription(error)
      }),
    onSettled: () => sourcePluginInvalidation.invalidateAll(client)
  });
}
