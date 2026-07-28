import { PackagePlus, Plus } from 'lucide-react';
import { useI18n } from '../../../shared/i18n';
import { ActionBar, Button, PageHeader } from '../../../shared/ui';

export function PluginStudioDashboardHeader({
  onCreate,
  onInstall
}: {
  onCreate: () => void;
  onInstall: () => void;
}) {
  const { t } = useI18n();

  return (
    <PageHeader
      eyebrow={t('pluginStudio.eyebrow')}
      title={t('pluginStudio.title')}
      description={t('pluginStudio.description')}
      action={
        <ActionBar className="justify-end">
          <Button variant="secondary" leadingIcon={<PackagePlus size={17} />} onClick={onInstall}>
            {t('pluginStudio.installPackage')}
          </Button>
          <Button leadingIcon={<Plus size={17} />} onClick={onCreate}>
            {t('pluginStudio.newProject')}
          </Button>
        </ActionBar>
      }
    />
  );
}
