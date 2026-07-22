import { FlaskConical } from 'lucide-react';
import { useI18n } from '../../../shared/i18n';
import { Button } from '../../../shared/ui';
import { useTestSourcePlugin } from '../model/use-test-source-plugin';
export function TestSourcePluginButton({ pluginId }: { pluginId: string }) {
  const { t } = useI18n();
  const action = useTestSourcePlugin(pluginId);
  return (
    <Button
      variant="secondary"
      leadingIcon={<FlaskConical size={17} />}
      actionState={action.status}
      onClick={() => action.mutate()}
    >
      {t('testSourcePlugin.test')}
    </Button>
  );
}
