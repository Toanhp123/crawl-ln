import type { SourceReaderPluginDescriptor } from '@novel-tool/shared';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useI18n } from '@/shared/i18n/I18nProvider';
import { Button, ConfirmDialog, Switch } from '@/shared/ui';
import { useRemoveSourcePlugin, useToggleSourcePlugin } from '../model/useSourcePluginActions';

export function SourcePluginEnableSwitch({
  plugin,
  compact = false
}: {
  plugin: SourceReaderPluginDescriptor;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const toggle = useToggleSourcePlugin();
  const owns = toggle.variables?.plugin.id === plugin.id;
  return (
    <Switch
      checked={plugin.enabled}
      aria-label={t('sources.toggleLabel', { name: plugin.name })}
      label={compact ? undefined : t('sources.toggleLabel', { name: plugin.name })}
      actionState={owns ? toggle.status : 'idle'}
      disabled={toggle.isPending && !owns}
      onCheckedChange={(enabled) => toggle.mutate({ plugin, enabled })}
    />
  );
}

export function RemoveSourcePluginButton({
  pluginId,
  onRemoved
}: {
  pluginId: string;
  onRemoved?: () => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const remove = useRemoveSourcePlugin(() => {
    setOpen(false);
    onRemoved?.();
  });
  return (
    <>
      <Button variant="danger" leadingIcon={<Trash2 size={17} />} onClick={() => setOpen(true)}>
        {t('sources.plugins.remove')}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t('sources.plugins.removeTitle')}
        description={t('sources.plugins.removeDescription')}
        confirmText={t('sources.plugins.remove')}
        danger
        actionState={remove.status}
        onConfirm={() => remove.mutate(pluginId)}
      />
    </>
  );
}
