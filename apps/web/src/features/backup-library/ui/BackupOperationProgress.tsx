import type { BackupOperationSummary } from '@novel-tool/shared';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useI18n } from '../../../shared/i18n';
import { Button, InlineNotice, Text } from '../../../shared/ui';
import type { BackupOperationController } from '../model/use-backup-operation';

function elapsedSeconds(startedAt: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1_000));
}

export function BackupOperationProgress({
  operation,
  controller
}: {
  operation: BackupOperationSummary;
  controller: BackupOperationController;
}) {
  const { t } = useI18n();
  const [elapsed, setElapsed] = useState(() => elapsedSeconds(operation.startedAt));
  const active = operation.state === 'queued' || operation.state === 'running';

  useEffect(() => {
    setElapsed(elapsedSeconds(operation.startedAt));
    const timer = window.setInterval(() => setElapsed(elapsedSeconds(operation.startedAt)), 1_000);
    return () => window.clearInterval(timer);
  }, [operation.startedAt]);

  return (
    <div className="space-y-3" data-backup-operation-state={operation.state}>
      <Text variant="title">{t(`backup.operation.${operation.kind}`)}</Text>
      <Text>{t(`backup.stage.${operation.stage}`)}</Text>
      {operation.progress.total > 0 ? (
        <Text variant="supporting">
          {t('backup.progressStep', {
            current: operation.progress.current,
            total: operation.progress.total
          })}
        </Text>
      ) : null}
      <Text variant="supporting">{t('backup.elapsed', { seconds: elapsed })}</Text>
      <InlineNotice>{t('backup.closeDoesNotCancel')}</InlineNotice>
      {active && operation.cancellable ? (
        <Button
          full
          variant="secondary"
          actionState={controller.cancel.status}
          leadingIcon={<X size={16} />}
          onClick={() => controller.cancel.mutate(operation.id)}
        >
          {t('backup.cancel')}
        </Button>
      ) : null}
      {controller.cancel.isError ? (
        <InlineNotice tone="danger">{t('backup.cancelFailed')}</InlineNotice>
      ) : null}
    </div>
  );
}
