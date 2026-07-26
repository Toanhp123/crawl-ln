import { FlaskConical } from 'lucide-react';
import { useI18n } from '../../../shared/i18n';
import { Button } from '../../../shared/ui';
import { useTestSourcePlugin } from '../model/use-test-source-plugin';
export function TestSourcePluginButton({
  pluginId,
  disabled = false
}: {
  pluginId: string;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const action = useTestSourcePlugin(pluginId);
  return (
    <Button
      variant="secondary"
      leadingIcon={<FlaskConical size={17} />}
      actionState={action.status}
      disabled={disabled}
      onClick={() => action.mutate()}
    >
      {t('testSourcePlugin.test')}
    </Button>
  );
}
