import { useState } from 'react';
import { ApiError } from '../../../shared/api';
import { useI18n } from '../../../shared/i18n';
import { Button, Field, InlineNotice, Input, Text } from '../../../shared/ui';
import { MAX_RESTORE_FILE_BYTES, type RestoreWizardController } from '../model/use-restore-wizard';

export function RestoreChooseFileStep({ controller }: { controller: RestoreWizardController }) {
  const { t, errorMessage } = useI18n();
  const [replacementFile, setReplacementFile] = useState<File | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const choose = async (file: File, replaceExisting: boolean) => {
    setLocalError(null);
    if (file.size <= 0 || file.size > MAX_RESTORE_FILE_BYTES) {
      setLocalError(t('backup.restore.fileSizeInvalid'));
      return;
    }
    try {
      await controller.chooseFile(file, replaceExisting);
      setReplacementFile(null);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'RESTORE_SESSION_EXISTS') {
        setReplacementFile(file);
        return;
      }
      setLocalError(errorMessage(error));
    }
  };

  return (
    <section className="space-y-3" aria-labelledby="restore-choose-title">
      <Text id="restore-choose-title" as="h4" variant="section">
        {t('backup.restore.chooseFileTitle')}
      </Text>
      <Text as="p" variant="supporting" tone="muted">
        {t('backup.restore.chooseFileHint')}
      </Text>
      <Field label={t('backup.restore.fileLabel')}>
        <Input
          type="file"
          accept=".nvt,application/vnd.novel-tool.backup"
          disabled={controller.busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void choose(file, false);
            event.currentTarget.value = '';
          }}
        />
      </Field>
      {replacementFile ? (
        <InlineNotice
          tone="warning"
          title={t('backup.restore.sessionExistsTitle')}
          action={
            <Button
              size="sm"
              variant="danger"
              actionState={controller.busy ? 'pending' : 'idle'}
              onClick={() => void choose(replacementFile, true)}
            >
              {t('backup.restore.replaceSession')}
            </Button>
          }
        >
          {t('backup.restore.sessionExistsDescription')}
        </InlineNotice>
      ) : null}
      {localError ? <InlineNotice tone="danger">{localError}</InlineNotice> : null}
    </section>
  );
}
