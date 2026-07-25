import type { BackupOperationSummary } from '@novel-tool/shared';
import { Download } from 'lucide-react';
import { useI18n } from '../../../shared/i18n';
import { Button, InlineNotice, Text } from '../../../shared/ui';
import type { BackupOperationController } from '../model/use-backup-operation';

function formatBytes(value: number): string {
  if (value < 1_024) return `${value} B`;
  if (value < 1_024 * 1_024) return `${(value / 1_024).toFixed(1)} KB`;
  return `${(value / (1_024 * 1_024)).toFixed(1)} MB`;
}

export function BackupOperationResult({
  operation,
  controller
}: {
  operation: BackupOperationSummary;
  controller: BackupOperationController;
}) {
  const { t, date, errorMessage } = useI18n();
  const result = operation.result;
  const expired = result?.expiresAt ? new Date(result.expiresAt).getTime() <= Date.now() : true;
  const canDownload =
    operation.state === 'succeeded' &&
    operation.kind === 'backup' &&
    Boolean(result?.artifactId && result.filename) &&
    !expired;

  return (
    <div className="space-y-3" data-backup-operation-state={operation.state}>
      <Text variant="title">{t('backup.resultTitle')}</Text>
      {operation.state === 'succeeded' ? (
        <InlineNotice tone="success">{t('backup.operationSucceeded')}</InlineNotice>
      ) : operation.state === 'cancelled' ? (
        <InlineNotice tone="warning">{t('backup.operationCancelled')}</InlineNotice>
      ) : operation.state === 'interrupted' ? (
        <InlineNotice tone="warning">{t('backup.operationInterrupted')}</InlineNotice>
      ) : (
        <InlineNotice tone="danger">
          {t('backup.operationFailed', { code: operation.error?.code ?? 'INTERNAL_ERROR' })}
        </InlineNotice>
      )}

      {result?.filename ? (
        <Text>{t('backup.resultFilename', { value: result.filename })}</Text>
      ) : null}
      {result?.sizeBytes !== undefined ? (
        <Text>{t('backup.resultSize', { value: formatBytes(result.sizeBytes) })}</Text>
      ) : null}
      {result?.encrypted !== undefined ? (
        <Text>
          {t('backup.resultEncryption', {
            value: t(result.encrypted ? 'backup.encrypted' : 'backup.unencrypted')
          })}
        </Text>
      ) : null}
      {result?.expiresAt ? (
        <Text>{t('backup.resultExpiry', { value: date(result.expiresAt) })}</Text>
      ) : null}
      {expired && result?.artifactId ? (
        <InlineNotice tone="warning">{t('backup.artifactExpired')}</InlineNotice>
      ) : null}
      {controller.download.isError ? (
        <InlineNotice tone="danger">{errorMessage(controller.download.error)}</InlineNotice>
      ) : null}
      {operation.kind === 'backup' && result?.artifactId && result.filename ? (
        <Button
          full
          disabled={!canDownload}
          actionState={controller.download.status}
          leadingIcon={<Download size={16} />}
          onClick={() =>
            controller.download.mutate({
              operationId: operation.id,
              artifactId: result.artifactId!,
              filename: result.filename!
            })
          }
        >
          {t('backup.downloadArtifact')}
        </Button>
      ) : null}
    </div>
  );
}
