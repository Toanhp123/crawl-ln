import { BACKUP_SETTINGS_APPLIED_EVENT } from '../../../shared/events/backup-settings';

export { BACKUP_SETTINGS_APPLIED_EVENT };

const SETTINGS_KEYS = [
  'novel-tool-theme',
  'novel-tool-accent',
  'novel-tool-density',
  'novel-tool-app-font',
  'novel-tool-language',
  'novel-tool-reader'
] as const;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function collectBackupSettings(
  storage: StorageLike = localStorage
): Record<string, unknown> {
  return Object.fromEntries(
    SETTINGS_KEYS.map((key) => [key, storage.getItem(key)]).filter((entry) => entry[1] !== null)
  );
}

export function applyBackupSettings(
  settings: Record<string, unknown>,
  storage: StorageLike = localStorage,
  target: Pick<Window, 'dispatchEvent'> | null = typeof window === 'undefined' ? null : window
): void {
  for (const key of SETTINGS_KEYS) {
    const value = settings[key];
    if (typeof value === 'string') storage.setItem(key, value);
  }
  target?.dispatchEvent(new Event(BACKUP_SETTINGS_APPLIED_EVENT));
}

export function encodeSettingsHeader(settings: Record<string, unknown>): string {
  const bytes = new TextEncoder().encode(JSON.stringify(settings));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
