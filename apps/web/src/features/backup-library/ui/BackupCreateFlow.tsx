import { ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useI18n } from '../../../shared/i18n';
import { Button, Field, InlineNotice, Input, Text } from '../../../shared/ui';
import { collectBackupSettings } from '../lib/settings';
import {
  createBackupIdempotencyKey,
  validateBackupCreateForm,
  type BackupCreateValidationError
} from '../model/backup-operation-validation';
import type { BackupOperationController } from '../model/use-backup-operation';

export function BackupCreateFlow({ controller }: { controller: BackupOperationController }) {
  const { t, errorMessage } = useI18n();
  const [encryptionEnabled, setEncryptionEnabled] = useState(true);
  const [password, setPassword] = useState('');
  const [confirmationPassword, setConfirmationPassword] = useState('');
  const [unencryptedAccepted, setUnencryptedAccepted] = useState(false);
  const [validationError, setValidationError] = useState<BackupCreateValidationError | null>(null);
  const [submissionKey, setSubmissionKey] = useState<string | null>(null);

  const resetSubmission = () => setSubmissionKey(null);
  const submit = () => {
    const validation = validateBackupCreateForm({
      encryptionEnabled,
      password,
      confirmationPassword,
      unencryptedAccepted
    });
    setValidationError(validation);
    if (validation) return;

    const idempotencyKey = submissionKey ?? createBackupIdempotencyKey();
    setSubmissionKey(idempotencyKey);
    controller.start.mutate(
      {
        idempotencyKey,
        input: {
          kind: 'backup',
          encryption: encryptionEnabled ? { enabled: true, password } : { enabled: false },
          confirmation: { unencryptedAccepted },
          settings: collectBackupSettings()
        }
      },
      {
        onSuccess: () => {
          setPassword('');
          setConfirmationPassword('');
          setSubmissionKey(null);
          setValidationError(null);
        }
      }
    );
  };

  return (
    <div className="space-y-3">
      <Text variant="title">{t('backup.createTitle')}</Text>
      <label className="flex items-start gap-3 type-body-sm text-text">
        <input
          type="checkbox"
          checked={encryptionEnabled}
          disabled={controller.start.isPending}
          onChange={(event) => {
            setEncryptionEnabled(event.target.checked);
            setValidationError(null);
            resetSubmission();
          }}
        />
        <span>{t('backup.encryptionEnabled')}</span>
      </label>

      {encryptionEnabled ? (
        <>
          <Field label={t('backup.password')} hint={t('backup.passwordHint')}>
            <Input
              type="password"
              autoComplete="new-password"
              value={password}
              disabled={controller.start.isPending}
              onChange={(event) => {
                setPassword(event.target.value);
                setValidationError(null);
                resetSubmission();
              }}
            />
          </Field>
          <Field label={t('backup.passwordConfirm')}>
            <Input
              type="password"
              autoComplete="new-password"
              value={confirmationPassword}
              disabled={controller.start.isPending}
              onChange={(event) => {
                setConfirmationPassword(event.target.value);
                setValidationError(null);
                resetSubmission();
              }}
            />
          </Field>
        </>
      ) : (
        <InlineNotice tone="warning">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={unencryptedAccepted}
              disabled={controller.start.isPending}
              onChange={(event) => {
                setUnencryptedAccepted(event.target.checked);
                setValidationError(null);
                resetSubmission();
              }}
            />
            <span>{t('backup.unencryptedWarning')}</span>
          </label>
        </InlineNotice>
      )}

      {validationError ? (
        <InlineNotice tone="danger">{t(`backup.validation.${validationError}`)}</InlineNotice>
      ) : null}
      {controller.activeConflict ? (
        <InlineNotice>{t('backup.activeConflict')}</InlineNotice>
      ) : controller.start.isError ? (
        <InlineNotice tone="danger">{errorMessage(controller.start.error)}</InlineNotice>
      ) : null}
      {controller.isActive ? <InlineNotice>{t('backup.activeOperation')}</InlineNotice> : null}

      <Button
        full
        actionState={controller.start.status}
        feedbackPolicy="longRunning"
        leadingIcon={<ShieldCheck size={16} />}
        disabled={controller.isActive}
        onClick={submit}
      >
        {t('backup.createAction')}
      </Button>
    </div>
  );
}
