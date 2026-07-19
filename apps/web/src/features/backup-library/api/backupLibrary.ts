import type {
  BackupRestoreMode,
  BackupRestoreResult,
  BackupSettingsMode
} from '@novel-tool/shared';
import { API_BASE_URL } from '@/shared/config/api';
import { readApiError } from '@/shared/api/errors';
import { readApiSuccess } from '@/shared/api/http';

export type RestoreMode = BackupRestoreMode;
export type SettingsMode = BackupSettingsMode;
export type RestoreResult = BackupRestoreResult;

const SETTINGS_KEYS = [
  'novel-tool-theme',
  'novel-tool-accent',
  'novel-tool-density',
  'novel-tool-app-font',
  'novel-tool-reader',
  'novel-tool-language'
];

export function collectBackupSettings(): Record<string, unknown> {
  return Object.fromEntries(
    SETTINGS_KEYS.map((key) => [key, localStorage.getItem(key)]).filter(
      ([, value]) => value !== null
    )
  );
}

export function applyBackupSettings(settings: Record<string, unknown>): void {
  for (const key of SETTINGS_KEYS) {
    const value = settings[key];
    if (typeof value === 'string') localStorage.setItem(key, value);
  }
}

function encodeBase64Json(value: Record<string, unknown>): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function filenameFromDisposition(value: string | null): string {
  const match = value?.match(/filename="?([^";]+)"?/i);
  return match?.[1] ?? 'novel-tool-backup.nvt';
}

export async function createLibraryBackup(
  password?: string,
  signal?: AbortSignal
): Promise<{ filename: string; size: number }> {
  const response = await fetch(`${API_BASE_URL}/api/backups`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: password || undefined, settings: collectBackupSettings() }),
    signal
  });
  if (!response.ok) throw await readApiError(response);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  const filename = filenameFromDisposition(response.headers.get('content-disposition'));
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  return { filename, size: blob.size };
}

export async function restoreLibraryBackup(input: {
  file: File;
  password?: string;
  mode: RestoreMode;
  settingsMode: SettingsMode;
  signal?: AbortSignal;
}): Promise<RestoreResult> {
  const currentSettings = encodeBase64Json(collectBackupSettings());
  const response = await fetch(`${API_BASE_URL}/api/backups/restore`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-Restore-Mode': input.mode,
      'X-Settings-Mode': input.settingsMode,
      'X-Current-Settings': currentSettings,
      ...(input.password ? { 'X-Backup-Password': input.password } : {})
    },
    body: input.file,
    signal: input.signal
  });
  if (!response.ok) throw await readApiError(response);
  const result = await readApiSuccess<RestoreResult>(response);
  if (result.settings) applyBackupSettings(result.settings);
  return result;
}
