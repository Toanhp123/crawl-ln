import { FlaskConical } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { testSourcePlugin } from '@/entities/source-plugin';
import { queryKeys } from '@/shared/api/queryKeys';
import { useI18n } from '@/shared/i18n/I18nProvider';
import { Button, toast } from '@/shared/ui';
export function TestSourcePluginButton({ pluginId }: { pluginId: string }) {
  const { t, errorMessage } = useI18n();
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => testSourcePlugin(pluginId),
    onSuccess: () => {
      toast({ kind: 'success', title: t('sources.plugins.testPassed') });
      void client.invalidateQueries({ queryKey: queryKeys.sourceReader.plugin(pluginId) });
      void client.invalidateQueries({ queryKey: queryKeys.sourceReader.pluginHealth(pluginId) });
      void client.invalidateQueries({ queryKey: queryKeys.sourceReader.plugins() });
    },
    onError: (error) =>
      toast({ kind: 'error', title: t('sources.updateFailed'), description: errorMessage(error) })
  });
  return (
    <Button
      variant="secondary"
      leadingIcon={<FlaskConical size={17} />}
      actionState={mutation.status}
      onClick={() => mutation.mutate()}
    >
      {t('sources.plugins.test')}
    </Button>
  );
}
