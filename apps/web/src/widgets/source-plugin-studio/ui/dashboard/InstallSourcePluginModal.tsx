import { InstallSourcePluginForm } from '../../../../features/install-source-plugin';
import { useI18n } from '../../../../shared/i18n';
import { Modal } from '../../../../shared/ui';

export function InstallSourcePluginModal({
  open,
  onOpenChange,
  onInstalled
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInstalled: () => void;
}) {
  const { t } = useI18n();

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={t('pluginStudio.installPackage')}
      description={t('installSourcePlugin.description')}
      className="md:[--modal-width:40rem]"
    >
      <InstallSourcePluginForm
        surface="plain"
        onInstalled={() => {
          onOpenChange(false);
          onInstalled();
        }}
      />
    </Modal>
  );
}
