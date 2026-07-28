import { ArrowUpCircle, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SourcePlugin, SourcePluginUsageConflict } from '../../../entities/source-plugin';
import { useI18n } from '../../../shared/i18n';
import { Button, ConfirmDialog, Modal, Switch } from '../../../shared/ui';
import { resolveSourcePluginToggleRequest } from '../model/resolve-source-plugin-toggle-request';
import {
  getSourcePluginActivationState,
  isSourcePluginEnableSwitchDisabled
} from '../model/source-plugin-activation-state';
import {
  useActivateLatestSourcePlugin,
  useRemoveSourcePlugin,
  useToggleSourcePlugin
} from '../model/use-source-plugin-actions';

function SourcePluginUsageConflictModal({
  conflict,
  onOpenChange
}: {
  conflict: SourcePluginUsageConflict | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();

  return (
    <Modal
      open={Boolean(conflict)}
      onOpenChange={onOpenChange}
      title={t('manageSourcePlugins.usageConflictTitle')}
      description={
        conflict
          ? t(
              conflict.operation === 'disable'
                ? 'manageSourcePlugins.disableUsageConflict'
                : 'manageSourcePlugins.removeUsageConflict',
              { count: conflict.blockingJobCount }
            )
          : undefined
      }
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('common.close')}
          </Button>
          <Button
            onClick={() => {
              onOpenChange(false);
              navigate('/activity');
            }}
          >
            {t('manageSourcePlugins.goToTasks')}
          </Button>
        </div>
      }
    />
  );
}

export function SourcePluginEnableSwitch({
  plugin,
  compact = false
}: {
  plugin: SourcePlugin;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [usageConflict, setUsageConflict] = useState<SourcePluginUsageConflict | null>(null);
  const toggle = useToggleSourcePlugin(setUsageConflict);
  const owns = toggle.variables?.plugin.id === plugin.id;

  const handleCheckedChange = (enabled: boolean) => {
    const request = resolveSourcePluginToggleRequest(plugin, enabled);
    if (request.kind === 'review-permissions') {
      setApprovalOpen(true);
      return;
    }
    toggle.mutate({ plugin, enabled: request.enabled });
  };

  return (
    <>
      <Switch
        checked={plugin.enabled}
        label={compact ? undefined : t('manageSourcePlugins.toggle', { name: plugin.name })}
        aria-label={t('manageSourcePlugins.toggle', { name: plugin.name })}
        className={compact ? 'w-auto border-0 p-0 hover:bg-transparent' : undefined}
        actionState={owns ? toggle.status : 'idle'}
        disabled={isSourcePluginEnableSwitchDisabled(plugin, {
          compact,
          togglePending: toggle.isPending,
          toggleOwnsPlugin: owns
        })}
        onCheckedChange={handleCheckedChange}
      />
      <Modal
        open={approvalOpen}
        onOpenChange={setApprovalOpen}
        title={t('manageSourcePlugins.approvalTitle')}
        description={t('manageSourcePlugins.approvalRequired')}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setApprovalOpen(false)}>
              {t('common.close')}
            </Button>
            <Button
              onClick={() => {
                setApprovalOpen(false);
                navigate(`/sources/${encodeURIComponent(plugin.id)}`);
              }}
            >
              {t('manageSourcePlugins.reviewPermissions')}
            </Button>
          </div>
        }
      />
      <SourcePluginUsageConflictModal
        conflict={usageConflict}
        onOpenChange={(open) => {
          if (!open) setUsageConflict(null);
        }}
      />
    </>
  );
}

export function ActivateLatestSourcePluginButton({ plugin }: { plugin: SourcePlugin }) {
  const { t } = useI18n();
  const action = useActivateLatestSourcePlugin();
  const activation = getSourcePluginActivationState(plugin);

  if (!activation.hasUpgrade) return null;

  return (
    <Button
      variant="secondary"
      leadingIcon={<ArrowUpCircle size={17} />}
      actionState={action.status}
      disabled={!activation.canActivateLatest}
      onClick={() => action.mutate({ pluginId: plugin.id, version: activation.targetVersion })}
    >
      {t('manageSourcePlugins.activateLatest')}
    </Button>
  );
}

export function RemoveSourcePluginButton({ pluginId }: { pluginId: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [usageConflict, setUsageConflict] = useState<SourcePluginUsageConflict | null>(null);
  const remove = useRemoveSourcePlugin(
    () => setOpen(false),
    (conflict) => {
      setOpen(false);
      setUsageConflict(conflict);
    }
  );
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
      <SourcePluginUsageConflictModal
        conflict={usageConflict}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setUsageConflict(null);
        }}
      />
    </>
  );
}
