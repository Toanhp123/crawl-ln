import type {
  BackupRestoreMode,
  BackupRestoreResult,
  BackupSettingsMode
} from '@novel-tool/shared';

export type RestoreMode = BackupRestoreMode;
export type SettingsMode = BackupSettingsMode;
export type RestoreResult = BackupRestoreResult;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validateRestoreResult(value: unknown): RestoreResult {
  if (!isRecord(value)) throw new Error('Invalid backup restore response');
  const validMode = value.mode === 'replace' || value.mode === 'merge';
  const validRestored =
    isRecord(value.restored) && Object.values(value.restored).every(Number.isFinite);
  const validSettings = value.settings === null || isRecord(value.settings);
  const validSafety = value.safetyBackupPath === null || typeof value.safetyBackupPath === 'string';
  if (!validMode || !validRestored || !validSettings || !validSafety) {
    throw new Error('Invalid backup restore response');
  }
  return value as unknown as RestoreResult;
}

export function requiresRestoreConfirmation(_mode: RestoreMode): boolean {
  return true;
}
