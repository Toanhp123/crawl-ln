import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { SourcePlugin } from '../../../entities/source-plugin';
import { useI18n } from '../../../shared/i18n';
import { Button, ConfirmDialog, Switch } from '../../../shared/ui';
import { useRemoveSourcePlugin, useToggleSourcePlugin } from '../model/use-source-plugin-actions';

export function SourcePluginEnableSwitch({ plugin }: { plugin: SourcePlugin }) {
  const { t } = useI18n();
  const toggle = useToggleSourcePlugin();
  const owns = toggle.variables?.plugin.id === plugin.id;
  return (
    <Switch
      checked={plugin.enabled}
      label={t('manageSourcePlugins.toggle', { name: plugin.name })}
      actionState={owns ? toggle.status : 'idle'}
      disabled={toggle.isPending && !owns}
      onCheckedChange={(enabled) => toggle.mutate({ plugin, enabled })}
    />
  );
}

export function RemoveSourcePluginButton({ pluginId }: { pluginId: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const remove = useRemoveSourcePlugin(() => setOpen(false));
  return (
    <>
      <Button variant="danger" leadingIcon={<Trash2 size={17} />} onClick={() => setOpen(true)}>
        {t('manageSourcePlugins.remove')}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t('manageSourcePlugins.removeTitle')}
        confirmText={t('manageSourcePlugins.remove')}
        danger
        actionState={remove.status}
        onConfirm={() => remove.mutate(pluginId)}
      />
    </>
  );
}
