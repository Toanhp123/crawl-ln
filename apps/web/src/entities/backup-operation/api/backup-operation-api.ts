import type { BackupCurrentOperationResult, BackupOperationSummary } from '@novel-tool/shared';
import { http } from '../../../shared/api';

export function getCurrentBackupOperation(signal?: AbortSignal) {
  return http<BackupCurrentOperationResult>('/api/backups/operations/current', { signal });
}

export function getBackupOperation(operationId: string, signal?: AbortSignal) {
  return http<BackupOperationSummary>(
    `/api/backups/operations/${encodeURIComponent(operationId)}`,
    { signal }
  );
}
