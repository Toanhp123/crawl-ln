import { z } from 'zod';
import type { RestoreWizardStep } from './restore-wizard-state';
import type { RestoreMode, SettingsMode } from './restore-validation';

export const RESTORE_STORAGE_KEY = 'novel-tool:backup-restore:v1';

export interface RestoreSessionStorage {
  version: 1;
  sessionId: string;
  sessionToken: string;
  inspectionToken?: string;
  operationId?: string;
  step: RestoreWizardStep;
  fingerprint?: string;
  filename?: string;
  size?: number;
  pendingSettings?: Record<string, unknown>;
  replaceReloadedOperationId?: string;
  mode?: RestoreMode;
  settingsPolicy?: SettingsMode;
  acknowledgedBytes?: number;
}

const schema: z.ZodType<RestoreSessionStorage> = z
  .object({
    version: z.literal(1),
    sessionId: z.string().min(1).max(200),
    sessionToken: z.string().min(1).max(512),
    inspectionToken: z.string().min(1).max(512).optional(),
    operationId: z.string().min(1).max(200).optional(),
    step: z.enum([
      'choose-file',
      'upload-validate',
      'inventory',
      'options',
      'impact',
      'confirmation',
      'progress',
      'result'
    ]),
    fingerprint: z
      .string()
      .regex(/^sha256-partial-v1:[a-f0-9]{64}$/)
      .optional(),
    filename: z
      .string()
      .min(1)
      .max(255)
      .refine((value) => !/[\\/]/.test(value))
      .optional(),
    size: z.number().int().positive().finite().optional(),
    pendingSettings: z.record(z.unknown()).optional(),
    replaceReloadedOperationId: z.string().min(1).max(200).optional(),
    mode: z.enum(['merge', 'replace']).optional(),
    settingsPolicy: z.enum(['keep-current', 'use-backup']).optional(),
    acknowledgedBytes: z.number().int().nonnegative().optional()
  })
  .strict();

function containsForbiddenSecret(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsForbiddenSecret);
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value as Record<string, unknown>).some(
    ([key, item]) =>
      /password|download.?token|typed.?phrase/i.test(key) || containsForbiddenSecret(item)
  );
}

function resolveStorage(storage?: Storage): Storage | null {
  if (storage) return storage;
  return typeof window === 'undefined' ? null : window.sessionStorage;
}

export function readStoredRestoreSession(storage?: Storage): RestoreSessionStorage | null {
  const target = resolveStorage(storage);
  if (!target) return null;
  const raw = target.getItem(RESTORE_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    if (parsed.success && !containsForbiddenSecret(parsed.data.pendingSettings)) return parsed.data;
  } catch {
    // Removed below.
  }
  target.removeItem(RESTORE_STORAGE_KEY);
  return null;
}

export function writeStoredRestoreSession(value: RestoreSessionStorage, storage?: Storage): void {
  const target = resolveStorage(storage);
  if (!target) return;
  const parsed = schema.parse(value);
  if (containsForbiddenSecret(parsed.pendingSettings)) {
    throw new Error('Restore session storage cannot contain secrets');
  }
  target.setItem(RESTORE_STORAGE_KEY, JSON.stringify(parsed));
}

export function clearStoredRestoreSession(storage?: Storage): void {
  resolveStorage(storage)?.removeItem(RESTORE_STORAGE_KEY);
}
