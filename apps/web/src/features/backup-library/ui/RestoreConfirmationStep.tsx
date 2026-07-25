import { useEffect, useState } from 'react';
import { ApiError } from '../../../shared/api';
import { useI18n } from '../../../shared/i18n';
import { Button, Field, InlineNotice, Input, Text } from '../../../shared/ui';
import { collectBackupSettings } from '../lib/settings';
import { REPLACE_CONFIRMATION_PHRASE } from '../model/restore-validation';
import type { RestoreWizardController } from '../model/use-restore-wizard';

export function RestoreConfirmationStep({ controller }: { controller: RestoreWizardController }) {
  const { t, errorMessage } = useI18n();
  const mode = controller.state.mode;
  const [typedPhrase, setTypedPhrase] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  useEffect(() => () => setTypedPhrase(''), []);
  const valid = mode === 'merge' || typedPhrase === REPLACE_CONFIRMATION_PHRASE;
  const start = async () => {
    setLocalError(null);
    try {
      await controller.startRestore(
        mode === 'replace' ? { accepted: true, typedPhrase } : { accepted: true },
        collectBackupSettings()
      );
    } catch (error) {
      if (error instanceof ApiError && error.code === 'BACKUP_OPERATION_ACTIVE') return;
      setLocalError(errorMessage(error));
    }
  };
  return (
    <section className="space-y-3" aria-labelledby="restore-confirm-title">
      <Text id="restore-confirm-title" as="h4" variant="section">
        {t('backup.confirmTitle')}
      </Text>
      <InlineNotice tone={mode === 'replace' ? 'danger' : 'warning'}>
        {mode === 'replace'
          ? t('backup.restore.replaceConfirmationDescription')
          : t('backup.restore.mergeConfirmationDescription')}
      </InlineNotice>
      {mode === 'replace' ? (
        <Field label={t('backup.restore.typePhrase', { phrase: REPLACE_CONFIRMATION_PHRASE })}>
          <Input
            value={typedPhrase}
            autoComplete="off"
            onChange={(event) => setTypedPhrase(event.target.value)}
          />
        </Field>
      ) : null}
      {localError ? <InlineNotice tone="danger">{localError}</InlineNotice> : null}
      <Button
        full
        variant={mode === 'replace' ? 'danger' : 'primary'}
        disabled={!valid}
        actionState={controller.busy ? 'pending' : 'idle'}
        onClick={() => void start()}
      >
        {mode === 'replace' ? t('backup.restore.replaceAction') : t('backup.restore.mergeAction')}
      </Button>
    </section>
  );
}
