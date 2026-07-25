import { Card, Stack } from '../../../shared/ui';
import { useBackupOperation } from '../model/use-backup-operation';
import { BackupCreateFlow } from './BackupCreateFlow';
import { BackupOperationProgress } from './BackupOperationProgress';
import { BackupOperationResult } from './BackupOperationResult';
import { RestoreWizard } from './RestoreWizard';

export function BackupLibraryPanel() {
  const controller = useBackupOperation();
  const operation = controller.operation;
  const backupOperation = operation?.kind === 'backup' ? operation : null;
  return (
    <Stack gap="md">
      <Card className="space-y-3">
        <BackupCreateFlow controller={controller} />
      </Card>
      {backupOperation ? (
        <Card className="space-y-3">
          {backupOperation.state === 'queued' || backupOperation.state === 'running' ? (
            <BackupOperationProgress operation={backupOperation} controller={controller} />
          ) : (
            <BackupOperationResult operation={backupOperation} controller={controller} />
          )}
        </Card>
      ) : null}
      <RestoreWizard operationController={controller} />
    </Stack>
  );
}
