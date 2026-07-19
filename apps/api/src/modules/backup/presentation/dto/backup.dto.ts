import { z } from 'zod';
export const createBackupRequestDto = z.object({
  password: z.string().max(256).optional(),
  settings: z.record(z.unknown()).optional()
});
export const restoreHeadersDto = z.object({
  mode: z.enum(['replace', 'merge']).default('replace'),
  settingsMode: z.enum(['keep-current', 'use-backup']).default('keep-current'),
  password: z.string().max(256).optional(),
  currentSettings: z.string().optional()
});
