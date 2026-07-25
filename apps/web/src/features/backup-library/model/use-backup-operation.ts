import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { BackupCurrentOperationResult, BackupOperationSummary } from '@novel-tool/shared';
import {
  backupOperationKeys,
  useCurrentBackupOperationQuery
} from '../../../entities/backup-operation';
import {
  cancelBackupOperation,
  downloadBackupToken,
  issueBackupDownloadToken,
  startBackupOperation,
  type StartBackupOperationRequest
} from '../api/backup-operation-commands';
import { ApiError, saveDownloadArtifact } from '../../../shared/api';
import { useConnectionStatus } from '../../../shared/realtime';
import {
  operationFromActiveConflictDetails,
  validateBackupOperation,
  validateCurrentBackupOperation
} from './backup-operation-validation';

export type StartBackupOperationMutation = {
  input: StartBackupOperationRequest;
  idempotencyKey: string;
};

export type DownloadBackupOperationMutation = {
  operationId: string;
  artifactId: string;
  filename: string;
};

export function useBackupOperation() {
  const client = useQueryClient();
  const connectionState = useConnectionStatus();
  const currentQuery = useCurrentBackupOperationQuery({
    connectionState,
    select: validateCurrentBackupOperation
  });

  const setCurrent = (operation: BackupOperationSummary) => {
    client.setQueryData<BackupCurrentOperationResult>(backupOperationKeys.current(), {
      operation
    });
    client.setQueryData(backupOperationKeys.detail(operation.id), operation);
  };

  const start = useMutation({
    mutationFn: async ({ input, idempotencyKey }: StartBackupOperationMutation) =>
      validateBackupOperation(await startBackupOperation(input, idempotencyKey)),
    onSuccess: async (operation) => {
      setCurrent(operation);
      await client.invalidateQueries({ queryKey: backupOperationKeys.all });
    },
    onError: async (error) => {
      if (!(error instanceof ApiError) || error.code !== 'BACKUP_OPERATION_ACTIVE') return;
      const operation = operationFromActiveConflictDetails(error.details);
      if (operation) setCurrent(operation);
    }
  });

  const cancel = useMutation({
    mutationFn: async (operationId: string) =>
      validateBackupOperation(await cancelBackupOperation(operationId)),
    onSuccess: async (operation) => {
      setCurrent(operation);
      await client.invalidateQueries({ queryKey: backupOperationKeys.all });
    }
  });

  const download = useMutation({
    mutationFn: async ({ operationId, artifactId, filename }: DownloadBackupOperationMutation) => {
      const issued = await issueBackupDownloadToken(operationId, artifactId);
      const artifact = await downloadBackupToken(issued.token, filename);
      saveDownloadArtifact(artifact);
    }
  });

  const operation = currentQuery.data?.operation ?? null;
  const isActive = operation?.state === 'queued' || operation?.state === 'running';
  const activeConflict =
    start.error instanceof ApiError && start.error.code === 'BACKUP_OPERATION_ACTIVE';

  return {
    operation,
    isActive,
    connectionState,
    currentQuery,
    start,
    cancel,
    download,
    activeConflict
  };
}

export type BackupOperationController = ReturnType<typeof useBackupOperation>;
