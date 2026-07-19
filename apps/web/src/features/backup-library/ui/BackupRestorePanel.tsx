import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Download, FileArchive, ShieldCheck, Upload } from 'lucide-react';
import {
  Button,
  Card,
  Field,
  FilterChip,
  Input,
  InlineNotice,
  Progress,
  Panel,
  Text,
  toast,
  useAsyncAction
} from '@/shared/ui';
import type { TranslationKey } from '@/shared/i18n/I18nProvider';
import { useMaintenanceOperation } from '@/shared/maintenance/MaintenanceProvider';
import {
  createLibraryBackup,
  restoreLibraryBackup,
  type RestoreMode,
  type SettingsMode
} from '../api/backupLibrary';

type RestoreStep = 'select' | 'review' | 'restoring' | 'complete';

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function BackupRestorePanel({ t }: { t: (key: TranslationKey) => string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [password, setPassword] = useState('');
  const [restorePassword, setRestorePassword] = useState('');
  const [mode, setMode] = useState<RestoreMode>('replace');
  const [settingsMode, setSettingsMode] = useState<SettingsMode>('keep-current');
  const [busy, setBusy] = useState<'backup' | 'restore' | null>(null);
  const backupAction = useAsyncAction();
  const restoreAction = useAsyncAction();
  const [backupStage, setBackupStage] = useState<'idle' | 'preparing' | 'saving' | 'complete'>(
    'idle'
  );
  const [restoreStep, setRestoreStep] = useState<RestoreStep>('select');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [lastBackup, setLastBackup] = useState<{ filename: string; size: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const backupController = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const maintenance = useMaintenanceOperation();

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      backupController.current?.abort();
    };
  }, []);

  const startBackup = () => {
    backupController.current?.abort();
    const controller = new AbortController();
    backupController.current = controller;
    return controller;
  };

  const backup = async () => {
    setBusy('backup');
    setBackupStage('preparing');
    setError(null);
    try {
      await backupAction.run(async () => {
        const controller = startBackup();
        const result = await createLibraryBackup(password, controller.signal);
        if (mounted.current) {
          setBackupStage('saving');
          setLastBackup(result);
          setBackupStage('complete');
          toast({ kind: 'success', title: t('backup.created') });
        }
      });
    } catch (cause) {
      if (mounted.current) {
        setBackupStage('idle');
        setError(cause instanceof Error ? cause.message : t('common.error'));
      }
    } finally {
      backupController.current = null;
      if (mounted.current) setBusy(null);
    }
  };

  const chooseFile = (file: File | null) => {
    setSelectedFile(file);
    setError(null);
    setRestoreStep(file ? 'review' : 'select');
  };

  const confirmRestore = async () => {
    if (!selectedFile) {
      setError(t('backup.fileRequired'));
      return;
    }
    setBusy('restore');
    setRestoreStep('restoring');
    setError(null);
    try {
      await restoreAction.run(async () => {
        await maintenance.runMaintenance(
          t('backup.restoring'),
          () =>
            restoreLibraryBackup({
              file: selectedFile,
              password: restorePassword,
              mode,
              settingsMode
            }),
          { reloadOnSuccess: true }
        );
        if (mounted.current) {
          setRestoreStep('complete');
          toast({ kind: 'success', title: t('backup.restored') });
        }
      });
    } catch (cause) {
      if (mounted.current) {
        setRestoreStep('review');
        setError(cause instanceof Error ? cause.message : t('common.error'));
      }
    } finally {
      if (mounted.current) setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}

      <Card className="space-y-4">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-surface2 text-primary">
            <ShieldCheck size={20} />
          </span>
          <div>
            <Text as="h3" variant="title">
              {t('backup.createTitle')}
            </Text>
            <Text variant="supporting" tone="muted">
              {t('backup.createDescription')}
            </Text>
          </div>
        </div>
        {lastBackup ? (
          <InlineNotice tone="success">
            {lastBackup.filename} · {formatBytes(lastBackup.size)}
          </InlineNotice>
        ) : null}
        <Field label={t('backup.passwordOptional')}>
          <Input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
          />
        </Field>
        {busy === 'backup' ? (
          <div className="space-y-2">
            <Progress value={backupStage === 'preparing' ? 35 : 80} />
            <Text variant="supporting" tone="muted">
              {backupStage === 'preparing' ? t('backup.preparing') : t('backup.saving')}
            </Text>
          </div>
        ) : null}
        <Button
          onClick={backup}
          disabled={busy === 'restore'}
          actionState={backupAction.state}
          feedbackPolicy="longRunning"
          leadingIcon={<Download size={17} />}
          className="w-full"
        >
          {t('backup.createAction')}
        </Button>
      </Card>

      <Card className="space-y-4">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-surface2 text-primary">
            <Upload size={20} />
          </span>
          <div>
            <Text as="h3" variant="title">
              {t('backup.restoreTitle')}
            </Text>
            <Text variant="supporting" tone="muted">
              {t('backup.restoreDescription')}
            </Text>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          {(['select', 'review', 'complete'] as const).map((step, index) => (
            <div key={step} className="space-y-1">
              <span
                className={`mx-auto grid h-7 w-7 place-items-center rounded-full type-caption font-bold ${restoreStep === step || (restoreStep === 'restoring' && step === 'review') ? 'bg-primary text-on-primary' : 'bg-surface2 text-muted'}`}
              >
                {index + 1}
              </span>
              <Text variant="caption" tone="muted">
                {t(`backup.step.${step}` as TranslationKey)}
              </Text>
            </div>
          ))}
        </div>

        {restoreStep === 'select' ? (
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-[var(--radius-lg)] border border-dashed border-border bg-surface2 p-6 text-center">
            <FileArchive size={30} className="text-primary" />
            <Text variant="label">{t('backup.chooseFile')}</Text>
            <Text variant="caption" tone="muted">
              .nvt · {t('backup.maxSize')}
            </Text>
            <input
              ref={fileRef}
              type="file"
              accept=".nvt,application/vnd.novel-tool.backup"
              className="sr-only"
              onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
            />
          </label>
        ) : null}

        {restoreStep === 'review' && selectedFile ? (
          <div className="space-y-4">
            <Panel tone="subtle" padding="sm">
              <Text variant="label">{selectedFile.name}</Text>
              <Text variant="caption" tone="muted">
                {formatBytes(selectedFile.size)} ·{' '}
                {new Date(selectedFile.lastModified).toLocaleString()}
              </Text>
            </Panel>
            <Field label={t('backup.passwordIfEncrypted')}>
              <Input
                type="password"
                value={restorePassword}
                onChange={(event) => setRestorePassword(event.target.value)}
              />
            </Field>
            <div>
              <Text variant="label" tone="muted" className="mb-2">
                {t('backup.restoreMode')}
              </Text>
              <div className="flex gap-2">
                <FilterChip selected={mode === 'replace'} onClick={() => setMode('replace')}>
                  {t('backup.replace')}
                </FilterChip>
                <FilterChip selected={mode === 'merge'} onClick={() => setMode('merge')}>
                  {t('backup.merge')}
                </FilterChip>
              </div>
            </div>
            <div>
              <Text variant="label" tone="muted" className="mb-2">
                {t('backup.settingsMode')}
              </Text>
              <div className="flex flex-wrap gap-2">
                <FilterChip
                  selected={settingsMode === 'keep-current'}
                  onClick={() => setSettingsMode('keep-current')}
                >
                  {t('backup.keepSettings')}
                </FilterChip>
                <FilterChip
                  selected={settingsMode === 'use-backup'}
                  onClick={() => setSettingsMode('use-backup')}
                >
                  {t('backup.useBackupSettings')}
                </FilterChip>
              </div>
            </div>
            {mode === 'replace' ? (
              <InlineNotice tone="warning">{t('backup.replaceWarning')}</InlineNotice>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => chooseFile(null)}>
                {t('common.cancel')}
              </Button>
              <Button
                onClick={confirmRestore}
                disabled={busy === 'backup'}
                actionState={restoreAction.state}
                feedbackPolicy="longRunning"
              >
                {t('backup.confirmRestore')}
              </Button>
            </div>
          </div>
        ) : null}

        {restoreStep === 'restoring' ? (
          <div className="space-y-3 py-5 text-center">
            <Progress value={65} />
            <Text variant="supporting" tone="muted">
              {t('backup.restoring')}
            </Text>
          </div>
        ) : null}
        {restoreStep === 'complete' ? (
          <div className="flex flex-col items-center gap-2 py-5 text-center">
            <CheckCircle2 size={36} className="text-success" />
            <Text variant="title">{t('backup.restoreComplete')}</Text>
            <Text variant="supporting" tone="muted">
              {t('backup.restored')}
            </Text>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
