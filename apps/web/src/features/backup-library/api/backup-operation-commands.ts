import type { BackupOperationSummary, StartRestoreOperationRequest } from '@novel-tool/shared';
import { http, requestDownload, type DownloadArtifact } from '../../../shared/api';

export type StartBackupOperationRequest = {
  kind: 'backup';
  encryption: { enabled: true; password: string } | { enabled: false };
  confirmation: { unencryptedAccepted: boolean };
  settings: Record<string, unknown>;
};

export function startBackupOperation(
  input: StartBackupOperationRequest,
  idempotencyKey: string,
  signal?: AbortSignal
) {
  return http<BackupOperationSummary>('/api/backups/operations', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(input),
    signal
  });
}

export function cancelBackupOperation(operationId: string) {
  return http<BackupOperationSummary>(
    `/api/backups/operations/${encodeURIComponent(operationId)}/cancel`,
    { method: 'POST', body: '{}' }
  );
}

export function issueBackupDownloadToken(operationId: string, artifactId: string) {
  return http<{ token: string; expiresAt: string }>(
    `/api/backups/operations/${encodeURIComponent(operationId)}/download-token`,
    {
      method: 'POST',
      body: JSON.stringify({ artifactId })
    }
  );
}

export function downloadBackupToken(
  token: string,
  fallbackFilename: string
): Promise<DownloadArtifact> {
  return requestDownload(
    fetch,
    `/api/backups/downloads/${encodeURIComponent(token)}`,
    { method: 'GET' },
    fallbackFilename
  );
}

export function startRestoreOperation(
  sessionId: string,
  sessionToken: string,
  input: StartRestoreOperationRequest,
  idempotencyKey: string,
  signal?: AbortSignal
) {
  return http<BackupOperationSummary>(
    `/api/backups/restore-sessions/${encodeURIComponent(sessionId)}/restore`,
    {
      method: 'POST',
      headers: {
        'Idempotency-Key': idempotencyKey,
        'Session-Token': sessionToken
      },
      body: JSON.stringify(input),
      signal
    }
  );
}
