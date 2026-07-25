export type RestoreMode = 'replace' | 'merge';
export type SettingsMode = 'keep-current' | 'use-backup';

export const REPLACE_CONFIRMATION_PHRASE = 'THAY THẾ DỮ LIỆU';

export function requiresRestoreConfirmation(_mode: RestoreMode): boolean {
  return true;
}
