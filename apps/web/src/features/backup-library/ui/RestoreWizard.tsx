import { useEffect, useMemo } from 'react';
import { useI18n } from '../../../shared/i18n';
import { Card, InlineNotice } from '../../../shared/ui';
import { applyBackupSettings } from '../lib/settings';
import type { BackupOperationController } from '../model/use-backup-operation';
import { RESTORE_WIZARD_STEPS } from '../model/restore-wizard-state';
import { useRestoreWizard } from '../model/use-restore-wizard';
import { RestoreChooseFileStep } from './RestoreChooseFileStep';
import { RestoreConfirmationStep } from './RestoreConfirmationStep';
import { RestoreImpactStep } from './RestoreImpactStep';
import { RestoreInventoryStep } from './RestoreInventoryStep';
import { RestoreOptionsStep } from './RestoreOptionsStep';
import { RestoreProgressStep } from './RestoreProgressStep';
import { RestoreResultStep } from './RestoreResultStep';
import { RestoreUploadStep } from './RestoreUploadStep';
import { RestoreWizardHeader } from './RestoreWizardHeader';

const titles: Record<(typeof RESTORE_WIZARD_STEPS)[number], string> = {
  'choose-file': 'backup.restore.chooseFileTitle',
  'upload-validate': 'backup.restore.uploadTitle',
  inventory: 'backup.restore.inventoryTitle',
  options: 'backup.restore.optionsTitle',
  impact: 'backup.restore.impactTitle',
  confirmation: 'backup.confirmTitle',
  progress: 'backup.operation.restore',
  result: 'backup.restore.resultTitle'
};

export function RestoreWizard({
  operationController
}: {
  operationController: BackupOperationController;
}) {
  const { t } = useI18n();
  const wizard = useRestoreWizard({ visible: true });
  const operation = operationController.operation;
  const activeRestore =
    operation?.kind === 'restore' &&
    (operation.state === 'queued' || operation.state === 'running');
  const restoreOperation =
    operation?.kind === 'restore' && (activeRestore || operation.id === wizard.state.operationId)
      ? operation
      : null;

  useEffect(() => {
    void wizard.recover().catch(() => undefined);
  }, []);
  useEffect(() => {
    if (restoreOperation)
      wizard.setOperation({ id: restoreOperation.id, state: restoreOperation.state });
  }, [restoreOperation?.id, restoreOperation?.state]);

  useEffect(() => {
    if (!restoreOperation || restoreOperation.state !== 'succeeded') return;
    if (restoreOperation.result?.settingsPending && wizard.state.pendingSettings) {
      applyBackupSettings(wizard.state.pendingSettings);
    }
    if (restoreOperation.mode === 'replace' && wizard.prepareReplaceReload(restoreOperation.id)) {
      window.location.reload();
    }
  }, [restoreOperation?.id, restoreOperation?.state]);

  const step = restoreOperation
    ? restoreOperation.state === 'queued' || restoreOperation.state === 'running'
      ? 'progress'
      : 'result'
    : wizard.state.step;
  const current = RESTORE_WIZARD_STEPS.indexOf(step) + 1;
  const canGoBack = !restoreOperation && !wizard.state.operationId && current > 1;
  const content = useMemo(() => {
    if (step === 'choose-file') return <RestoreChooseFileStep controller={wizard} />;
    if (step === 'upload-validate') return <RestoreUploadStep controller={wizard} />;
    if (step === 'inventory') return <RestoreInventoryStep controller={wizard} />;
    if (step === 'options') return <RestoreOptionsStep controller={wizard} />;
    if (step === 'impact') return <RestoreImpactStep controller={wizard} />;
    if (step === 'confirmation') return <RestoreConfirmationStep controller={wizard} />;
    if (step === 'progress' && restoreOperation)
      return <RestoreProgressStep operation={restoreOperation} controller={operationController} />;
    if (step === 'result' && restoreOperation)
      return (
        <RestoreResultStep
          operation={restoreOperation}
          operationController={operationController}
          wizard={wizard}
        />
      );
    return <InlineNotice>{t('backup.restore.reconnecting')}</InlineNotice>;
  }, [operationController, restoreOperation, step, t, wizard]);

  return (
    <Card className="space-y-4" data-restore-wizard>
      <RestoreWizardHeader
        current={current}
        total={8}
        title={t(titles[step])}
        canGoBack={canGoBack}
        onBack={wizard.back}
      />
      {content}
    </Card>
  );
}
