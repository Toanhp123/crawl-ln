import type { BackupRestoreResult } from '@novel-tool/shared';
import {
  readApiSuccess,
  requestDownload,
  type DownloadArtifact,
  type FetchLike
} from '../../../shared/api';
import { encodeSettingsHeader } from '../lib/settings';
import {
  validateRestoreResult,
  type RestoreMode,
  type SettingsMode
} from '../model/restore-validation';
import { API_BASE_URL } from '../../../shared/config/api';

export interface CreateBackupInput {
  password?: string;
  settings?: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface RestoreBackupInput {
  content: Blob;
  password?: string;
  mode: RestoreMode;
  settingsMode: SettingsMode;
  currentSettings?: Record<string, unknown>;
  signal?: AbortSignal;
}

export function createBackupClient(fetcher: FetchLike = fetch) {
  return {
    create(input: CreateBackupInput = {}): Promise<DownloadArtifact> {
      return requestDownload(
        fetcher,
        '/api/backups',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...(input.password ? { password: input.password } : {}),
            ...(input.settings ? { settings: input.settings } : {})
          }),
          signal: input.signal
        },
        'novel-tool-backup.nvt'
      );
    },
    async restore(input: RestoreBackupInput): Promise<BackupRestoreResult> {
      const response = await fetcher(`${API_BASE_URL}/api/backups/restore`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-Restore-Mode': input.mode,
          'X-Settings-Mode': input.settingsMode,
          ...(input.password ? { 'X-Backup-Password': input.password } : {}),
          ...(input.currentSettings
            ? { 'X-Current-Settings': encodeSettingsHeader(input.currentSettings) }
            : {})
        },
        body: input.content,
        signal: input.signal
      });
      return validateRestoreResult(await readApiSuccess<unknown>(response));
    }
  };
}

const backupClient = createBackupClient();
export const createLibraryBackup = backupClient.create;
export const restoreLibraryBackup = backupClient.restore;
