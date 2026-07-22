import { Download, Upload } from 'lucide-react';
import { useState } from 'react';
import { useI18n } from '../../../shared/i18n';
import {
  Button,
  Card,
  ConfirmDialog,
  Field,
  FilterChip,
  InlineNotice,
  Input,
  Stack,
  Text
} from '../../../shared/ui';
import { collectBackupSettings } from '../lib/settings';
import {
  requiresRestoreConfirmation,
  type RestoreMode,
  type SettingsMode
} from '../model/restore-validation';
import { useCreateLibraryBackup, useRestoreLibraryBackup } from '../model/use-backup-library';

export function BackupLibraryPanel() {
  const { t } = useI18n();
  const createBackup = useCreateLibraryBackup();
  const restoreBackup = useRestoreLibraryBackup();
  const [password, setPassword] = useState('');
  const [restorePassword, setRestorePassword] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<RestoreMode>('replace');
  const [settingsMode, setSettingsMode] = useState<SettingsMode>('keep-current');
  const [confirming, setConfirming] = useState(false);

  const restore = () => {
    if (!file) return;
    restoreBackup.mutate(
      {
        content: file,
        password: restorePassword || undefined,
        mode,
        settingsMode,
        currentSettings: collectBackupSettings()
      },
      {
        onSuccess: () => {
          setRestorePassword('');
          setFile(null);
          setConfirming(false);
        }
      }
    );
  };

  return (
    <Stack gap="md">
      <Card className="space-y-3">
        <Text variant="title">{t('backup.createTitle')}</Text>
        <Field label={t('backup.passwordOptional')}>
          <Input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>
        <Button
          full
          actionState={createBackup.status}
          feedbackPolicy="longRunning"
          leadingIcon={<Download size={16} />}
          onClick={() =>
            createBackup.mutate(
              { password: password || undefined, settings: collectBackupSettings() },
              { onSuccess: () => setPassword('') }
            )
          }
        >
          {t('backup.createAction')}
        </Button>
      </Card>
      <Card className="space-y-3">
        <Text variant="title">{t('backup.restoreTitle')}</Text>
        <Input
          type="file"
          accept=".nvt,application/vnd.novel-tool.backup"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
        <Field label={t('backup.passwordOptional')}>
          <Input
            type="password"
            value={restorePassword}
            onChange={(event) => setRestorePassword(event.target.value)}
          />
        </Field>
        <div className="flex flex-wrap gap-2">
          {(['replace', 'merge'] as const).map((value) => (
            <FilterChip key={value} selected={mode === value} onClick={() => setMode(value)}>
              {t(`backup.mode.${value}`)}
            </FilterChip>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {(['keep-current', 'use-backup'] as const).map((value) => (
            <FilterChip
              key={value}
              selected={settingsMode === value}
              onClick={() => setSettingsMode(value)}
            >
              {t(`backup.settings.${value}`)}
            </FilterChip>
          ))}
        </div>
        {mode === 'replace' ? (
          <InlineNotice tone="warning">{t('backup.replaceWarning')}</InlineNotice>
        ) : null}
        {restoreBackup.isPending ? <InlineNotice>{t('backup.maintenance')}</InlineNotice> : null}
        <Button
          full
          variant="secondary"
          disabled={!file}
          actionState={restoreBackup.status}
          feedbackPolicy="longRunning"
          leadingIcon={<Upload size={16} />}
          onClick={() => setConfirming(requiresRestoreConfirmation(mode))}
        >
          {t('backup.restoreAction')}
        </Button>
      </Card>
      <ConfirmDialog
        open={confirming}
        title={t('backup.confirmTitle')}
        description={t(`backup.confirm.${mode}`)}
        confirmText={t('backup.confirmAction')}
        cancelText={t('common.cancel')}
        danger={mode === 'replace'}
        actionState={restoreBackup.status}
        onOpenChange={setConfirming}
        onConfirm={restore}
      />
    </Stack>
  );
}
