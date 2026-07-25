import { useMemo, useState } from 'react';
import { useI18n } from '../../../shared/i18n';
import { Button, Field, InlineNotice, Input, Progress, Text } from '../../../shared/ui';
import type { RestoreWizardController } from '../model/use-restore-wizard';

function bytes(value: number): string {
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${Math.round(value / (1024 * 1024))} MB`;
}

const inspectionLabels: Record<string, string> = {
  uploaded: 'backup.restore.stage.uploaded',
  hashing: 'backup.restore.stage.hashing',
  inspecting: 'backup.restore.stage.inspecting',
  'reading-manifest': 'backup.restore.stage.inspecting',
  'verifying-archive': 'backup.restore.stage.inspecting',
  'migrating-staging': 'backup.restore.stage.migrating',
  'reading-inventory': 'backup.restore.stage.inventory'
};

export function RestoreUploadStep({ controller }: { controller: RestoreWizardController }) {
  const { t, errorMessage } = useI18n();
  const session = controller.state.session;
  const receivedBytes = session?.receivedBytes ?? controller.state.acknowledgedBytes;
  const expectedBytes = session?.expectedBytes ?? controller.state.size ?? 0;
  const percent = expectedBytes ? (receivedBytes / expectedBytes) * 100 : 0;
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [networkState, setNetworkState] = useState<'idle' | 'paused' | 'reconnecting'>('idle');
  const stageLabel = useMemo(
    () => t(inspectionLabels[session?.stage ?? ''] ?? 'backup.restore.stage.genericInspection'),
    [session?.stage, t]
  );

  const startUpload = async () => {
    setLocalError(null);
    const abort = new AbortController();
    try {
      setNetworkState('reconnecting');
      await controller.upload(abort.signal);
      setNetworkState('idle');
    } catch (error) {
      setNetworkState(error instanceof TypeError ? 'paused' : 'idle');
      setLocalError(errorMessage(error));
    }
  };

  const submitPassword = async () => {
    const value = password;
    setPassword('');
    setLocalError(null);
    try {
      await controller.unlock(value);
    } catch (error) {
      setLocalError(errorMessage(error));
    }
  };

  const partialWithoutFile =
    !controller.selectedFile && receivedBytes > 0 && receivedBytes < expectedBytes;
  const reselect = async (file: File) => {
    const matched = await controller.reselectFile(file);
    if (!matched) setLocalError(t('backup.restore.fileMismatch'));
    else setLocalError(null);
  };

  return (
    <section className="space-y-3" aria-labelledby="restore-upload-title">
      <Text id="restore-upload-title" as="h4" variant="section">
        {t('backup.restore.uploadTitle')}
      </Text>
      <div className="space-y-1">
        <div className="flex justify-between gap-3">
          <Text variant="bodySm">
            {networkState === 'paused'
              ? t('backup.restore.uploadPaused')
              : networkState === 'reconnecting'
                ? t('backup.restore.reconnecting')
                : t('backup.restore.uploadProgress', { percent: Math.round(percent) })}
          </Text>
          <Text variant="caption" tone="muted">
            {bytes(receivedBytes)} / {bytes(expectedBytes)}
          </Text>
        </div>
        <Progress value={percent} label={t('backup.restore.uploadProgressLabel')} />
      </div>

      {partialWithoutFile ? (
        <InlineNotice
          tone="warning"
          title={t('backup.restore.serverBytesSaved', {
            received: bytes(receivedBytes),
            total: bytes(expectedBytes)
          })}
        >
          <Field label={t('backup.restore.reselectFile')}>
            <Input
              type="file"
              accept=".nvt,application/vnd.novel-tool.backup"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void reselect(file);
                event.currentTarget.value = '';
              }}
            />
          </Field>
        </InlineNotice>
      ) : null}

      {session?.state === 'awaiting-password' ? (
        <div className="space-y-2">
          <Field
            label={t('backup.restore.unlockPassword')}
            hint={t('backup.restore.attemptsRemaining', { count: session.attemptsRemaining })}
          >
            <Input
              type="password"
              value={password}
              disabled={session.attemptsRemaining === 0 || controller.busy}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>
          <Button
            full
            disabled={!password || session.attemptsRemaining === 0}
            actionState={controller.busy ? 'pending' : 'idle'}
            onClick={() => void submitPassword()}
          >
            {t('backup.restore.unlockAction')}
          </Button>
        </div>
      ) : session && ['uploaded', 'hashing', 'inspecting'].includes(session.state) ? (
        <InlineNotice>{stageLabel}</InlineNotice>
      ) : controller.selectedFile ? (
        <Button
          full
          actionState={controller.busy ? 'pending' : 'idle'}
          onClick={() => void startUpload()}
        >
          {receivedBytes > 0 ? t('backup.restore.resumeUpload') : t('backup.restore.uploadAction')}
        </Button>
      ) : null}

      {localError ? <InlineNotice tone="danger">{localError}</InlineNotice> : null}
    </section>
  );
}
