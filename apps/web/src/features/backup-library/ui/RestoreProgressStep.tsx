import type { BackupOperationSummary } from '@novel-tool/shared';
import { useI18n } from '../../../shared/i18n';
import { Button, InlineNotice, Text } from '../../../shared/ui';
import type { BackupOperationController } from '../model/use-backup-operation';

function stageKey(mode: 'merge' | 'replace' | null, stage: string): string {
  const prefix = mode === 'replace' ? 'backup.restore.replaceStage' : 'backup.restore.mergeStage';
  return `${prefix}.${stage}`;
}

export function RestoreProgressStep({
  operation,
  controller
}: {
  operation: BackupOperationSummary;
  controller: BackupOperationController;
}) {
  const { t } = useI18n();
  const elapsed = Math.max(
    0,
    Math.round((Date.now() - new Date(operation.startedAt).getTime()) / 1000)
  );
  return (
    <section className="space-y-3" aria-labelledby="restore-progress-title">
      <Text id="restore-progress-title" as="h4" variant="section">
        {t('backup.operation.restore')}
      </Text>
      <InlineNotice>{t(stageKey(operation.mode, operation.stage))}</InlineNotice>
      <div className="flex justify-between gap-3">
        <Text variant="bodySm">
          {t('backup.progressStep', {
            current: operation.progress.current,
            total: operation.progress.total
          })}
        </Text>
        <Text variant="caption" tone="muted">
          {t('backup.elapsed', { seconds: elapsed })}
        </Text>
      </div>
      <Text as="p" variant="supporting" tone="muted">
        {t('backup.closeDoesNotCancel')}
      </Text>
      {operation.cancellable ? (
        <Button
          full
          variant="danger"
          actionState={controller.cancel.status}
          onClick={() => controller.cancel.mutate(operation.id)}
        >
          {t('backup.cancel')}
        </Button>
      ) : operation.state === 'queued' || operation.state === 'running' ? (
        <InlineNotice tone="warning">{t('backup.restore.notCancellable')}</InlineNotice>
      ) : null}
    </section>
  );
}
