import type { BackupOperationSummary } from '@novel-tool/shared';
import { useI18n } from '../../../shared/i18n';
import { Button, InlineNotice, Text } from '../../../shared/ui';
import type { BackupOperationController } from '../model/use-backup-operation';
import type { RestoreWizardController } from '../model/use-restore-wizard';

export function RestoreResultStep({
  operation,
  operationController,
  wizard
}: {
  operation: BackupOperationSummary;
  operationController: BackupOperationController;
  wizard: RestoreWizardController;
}) {
  const { t, number } = useI18n();
  const result = operation.result;
  const impact = result?.impact;
  const stale = operation.error?.code === 'RESTORE_PLAN_STALE';
  const safetyRetry =
    operation.mode === 'replace' &&
    operation.state === 'failed' &&
    operation.stage === 'safety-backup';
  return (
    <section className="space-y-3" aria-labelledby="restore-result-title">
      <Text id="restore-result-title" as="h4" variant="section">
        {t('backup.restore.resultTitle')}
      </Text>
      <InlineNotice
        tone={
          operation.state === 'succeeded'
            ? 'success'
            : operation.state === 'cancelled'
              ? 'warning'
              : 'danger'
        }
      >
        {operation.state === 'succeeded'
          ? t('backup.operationSucceeded')
          : operation.state === 'interrupted'
            ? t('backup.restore.interruptedDescription')
            : operation.state === 'cancelled'
              ? t('backup.operationCancelled')
              : t('backup.operationFailed', { code: operation.error?.code ?? 'INTERNAL_ERROR' })}
      </InlineNotice>
      {impact ? (
        <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2">
          <div className="contents">
            <dt className="type-body-sm text-muted">{t('backup.restore.modeTitle')}</dt>
            <dd className="type-body-sm">
              {t(`backup.mode.${result?.restoreMode ?? operation.mode}`)}
            </dd>
          </div>
          <div className="contents">
            <dt className="type-body-sm text-muted">{t('backup.restore.chaptersAdded')}</dt>
            <dd className="type-body-sm">{number(impact.chaptersAdded)}</dd>
          </div>
          <div className="contents">
            <dt className="type-body-sm text-muted">{t('backup.restore.settingsOutcome')}</dt>
            <dd className="type-body-sm">{t(`backup.settings.${impact.settingsOutcome}`)}</dd>
          </div>
        </dl>
      ) : null}
      {result?.safetyArtifactId ? (
        <InlineNotice
          tone="warning"
          title={t('backup.restore.safetyBackupTitle')}
          action={
            <Button
              size="sm"
              variant="secondary"
              actionState={operationController.download.status}
              onClick={() =>
                operationController.download.mutate({
                  operationId: operation.id,
                  artifactId: result.safetyArtifactId!,
                  filename: `novel-tool-safety-${operation.id}.nvt`
                })
              }
            >
              {t('backup.downloadArtifact')}
            </Button>
          }
        >
          {t('backup.restore.safetyBackupUnencrypted')}
        </InlineNotice>
      ) : null}
      {operation.error ? (
        <Text as="code" variant="caption">
          {operation.error.code}
        </Text>
      ) : null}
      {stale ? (
        <Button
          full
          actionState={wizard.busy ? 'pending' : 'idle'}
          onClick={() => void wizard.replan()}
        >
          {t('backup.restore.replanAction')}
        </Button>
      ) : safetyRetry ? (
        <Button
          full
          actionState={wizard.busy ? 'pending' : 'idle'}
          onClick={() => void wizard.retryPreparation()}
        >
          {t('common.retry')}
        </Button>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={wizard.reset}>
          {t('backup.restore.startAnother')}
        </Button>
      </div>
    </section>
  );
}
