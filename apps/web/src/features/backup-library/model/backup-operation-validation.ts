import type { BackupCurrentOperationResult, BackupOperationSummary } from '@novel-tool/shared';
import { z } from 'zod';

const progressSchema = z
  .object({
    current: z.number().int().nonnegative(),
    total: z.number().int().nonnegative()
  })
  .strict()
  .refine((progress) => progress.total === 0 || progress.current <= progress.total, {
    message: 'Backup operation progress exceeds its total'
  });

const errorSchema = z
  .object({
    code: z.string().min(1).max(100),
    retryable: z.boolean(),
    details: z.record(z.unknown()).nullable()
  })
  .strict();

const operationRestoreImpactSchema = z
  .object({
    novelsNew: z.number().int().nonnegative(),
    novelsExisting: z.number().int().nonnegative(),
    chaptersAdded: z.number().int().nonnegative(),
    chaptersSkipped: z.number().int().nonnegative(),
    sourceRemaps: z.number().int().nonnegative(),
    tasksRestored: z.number().int().nonnegative(),
    schedulerPoliciesRestored: z.number().int().nonnegative(),
    searchDocumentsRebuilt: z.number().int().nonnegative(),
    settingsOutcome: z.enum(['keep-current', 'use-backup']),
    replaceAll: z.literal(true).optional(),
    novelsTotal: z.number().int().nonnegative().optional(),
    chaptersTotal: z.number().int().nonnegative().optional(),
    tasksTotal: z.number().int().nonnegative().optional(),
    schedulerPoliciesTotal: z.number().int().nonnegative().optional(),
    searchDocumentsTotal: z.number().int().nonnegative().optional()
  })
  .strict();

const resultSchema = z
  .object({
    filename: z.string().min(1).max(500).optional(),
    sizeBytes: z.number().int().nonnegative().optional(),
    encrypted: z.boolean().optional(),
    artifactId: z.string().min(1).max(200).optional(),
    safetyArtifactId: z.string().min(1).max(200).optional(),
    expiresAt: z.string().datetime().optional(),
    restoreMode: z.enum(['merge', 'replace']).optional(),
    settingsPolicy: z.enum(['keep-current', 'use-backup']).optional(),
    impact: operationRestoreImpactSchema.optional(),
    settingsPending: z.boolean().optional()
  })
  .strict();

export const backupOperationSummarySchema: z.ZodType<BackupOperationSummary> = z
  .object({
    id: z.string().min(1).max(200),
    kind: z.enum(['backup', 'restore']),
    mode: z.enum(['merge', 'replace']).nullable(),
    state: z.enum(['queued', 'running', 'succeeded', 'failed', 'interrupted', 'cancelled']),
    stage: z.string().min(1).max(100),
    cancellable: z.boolean(),
    progress: progressSchema,
    startedAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    finishedAt: z.string().datetime().nullable(),
    error: errorSchema.nullable(),
    result: resultSchema.nullable()
  })
  .strict();

const currentOperationSchema: z.ZodType<BackupCurrentOperationResult> = z
  .object({ operation: backupOperationSummarySchema.nullable() })
  .strict();

export function validateBackupOperation(value: unknown): BackupOperationSummary {
  return backupOperationSummarySchema.parse(value);
}

export function validateCurrentBackupOperation(value: unknown): BackupCurrentOperationResult {
  return currentOperationSchema.parse(value);
}

export function operationFromActiveConflictDetails(value: unknown): BackupOperationSummary | null {
  const parsed = z
    .object({
      retryable: z.boolean().optional(),
      operation: backupOperationSummarySchema
    })
    .passthrough()
    .safeParse(value);
  return parsed.success ? parsed.data.operation : null;
}

export type BackupIdempotencyRandomSource = {
  randomUUID?(): string;
  getRandomValues?(bytes: Uint8Array): Uint8Array;
};

export function createBackupIdempotencyKey(
  randomSource: BackupIdempotencyRandomSource | null = globalThis.crypto
): string {
  if (typeof randomSource?.randomUUID === 'function') return randomSource.randomUUID();
  if (typeof randomSource?.getRandomValues === 'function') {
    const bytes = randomSource.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  }
  return [
    Date.now().toString(36),
    Math.random().toString(36).slice(2),
    Math.random().toString(36).slice(2)
  ].join('-');
}

export type BackupCreateValidationInput = {
  encryptionEnabled: boolean;
  password: string;
  confirmationPassword: string;
  unencryptedAccepted: boolean;
};

export type BackupCreateValidationError =
  'password-too-short' | 'password-mismatch' | 'unencrypted-confirmation-required';

export function validateBackupCreateForm(
  input: BackupCreateValidationInput
): BackupCreateValidationError | null {
  if (input.encryptionEnabled) {
    if (input.password.length < 8) return 'password-too-short';
    if (input.password !== input.confirmationPassword) return 'password-mismatch';
    return null;
  }
  return input.unencryptedAccepted ? null : 'unencrypted-confirmation-required';
}

export type RestoreSessionState =
  | 'uploading'
  | 'uploaded'
  | 'hashing'
  | 'awaiting-password'
  | 'inspecting'
  | 'ready'
  | 'locked'
  | 'consumed'
  | 'cancelled'
  | 'expired'
  | 'invalid';

export type RestoreSettingsPolicy = 'keep-current' | 'use-backup';

export interface RestoreInventory {
  createdAt: string;
  appVersion: string;
  schemaVersion: number;
  archiveSizeBytes: number;
  encrypted: boolean;
  library: {
    novels: number;
    analyzedNovels: number;
    chapters: number;
    fetchedChapters: number;
  };
  sources: { plugins: number; credentials: number; networkProfiles: number };
  ingestion: { tasks: number; events: number };
  scheduler: { policies: number; diagnostics: number };
  search: { indexedDocuments: number };
  settings: { groups: string[]; count: number };
}

export interface RestoreCompatibility {
  formatVersion: number;
  sourceSchemaVersion: number;
  targetSchemaVersion: number;
  minimumSupportedSchemaVersion: number;
  upgradedFrom: number | null;
  compatible: boolean;
}

export interface RestoreImpact {
  novelsNew: number;
  novelsExisting: number;
  chaptersAdded: number;
  chaptersSkipped: number;
  sourceRemaps: number;
  tasksRestored: number;
  schedulerPoliciesRestored: number;
  searchDocumentsRebuilt: number;
  settingsOutcome: RestoreSettingsPolicy;
  replaceAll?: true;
  novelsTotal?: number;
  chaptersTotal?: number;
  tasksTotal?: number;
  schedulerPoliciesTotal?: number;
  searchDocumentsTotal?: number;
}

export interface RestorePlan {
  mode: 'merge' | 'replace';
  settingsPolicy: RestoreSettingsPolicy;
  archiveChecksum: string;
  targetFingerprint: string | null;
  contributorImpact: Record<string, Record<string, number>>;
  impact: RestoreImpact;
  createdAt: string;
}

export interface RestoreSessionPublic {
  id: string;
  state: RestoreSessionState;
  stage: string;
  originalFilename: string;
  expectedBytes: number;
  receivedBytes: number;
  expiresAt: string;
  absoluteExpiresAt: string;
  lockedOperationId: string | null;
}

export interface RestoreSessionAuthenticated extends RestoreSessionPublic {
  encrypted: boolean | null;
  passwordFailures: number;
  attemptsRemaining: number;
  inventory: RestoreInventory | null;
  compatibility: RestoreCompatibility | null;
  mergePlan: RestorePlan | null;
  mergePlanFingerprint: string | null;
  selectedMode: 'merge' | 'replace' | null;
  settingsPolicy: RestoreSettingsPolicy | null;
  inspectionToken?: string | null;
}

export interface RestorePlanResponse extends RestoreSessionAuthenticated {
  plan: RestorePlan;
  planFingerprint: string;
  inspectionToken: string;
  pendingSettings: Record<string, unknown> | null;
}

const restoreStateSchema = z.enum([
  'uploading',
  'uploaded',
  'hashing',
  'awaiting-password',
  'inspecting',
  'ready',
  'locked',
  'consumed',
  'cancelled',
  'expired',
  'invalid'
]);
const restoreSettingsPolicySchema = z.enum(['keep-current', 'use-backup']);
const countSchema = z.number().int().nonnegative().finite();
const isoSchema = z.string().datetime();
const tokenSchema = z
  .string()
  .min(16)
  .max(512)
  .regex(/^[A-Za-z0-9_-]+$/);
const checksumSchema = z.string().regex(/^[a-f0-9]{64}$/);
const planFingerprintSchema = z.string().regex(/^sha256-plan-v1:[a-f0-9]{64}$/);

const restoreInventorySchema: z.ZodType<RestoreInventory> = z
  .object({
    createdAt: isoSchema,
    appVersion: z.string().min(1).max(200),
    schemaVersion: countSchema,
    archiveSizeBytes: countSchema,
    encrypted: z.boolean(),
    library: z
      .object({
        novels: countSchema,
        analyzedNovels: countSchema,
        chapters: countSchema,
        fetchedChapters: countSchema
      })
      .strict(),
    sources: z
      .object({
        plugins: countSchema,
        credentials: countSchema,
        networkProfiles: countSchema
      })
      .strict(),
    ingestion: z.object({ tasks: countSchema, events: countSchema }).strict(),
    scheduler: z.object({ policies: countSchema, diagnostics: countSchema }).strict(),
    search: z.object({ indexedDocuments: countSchema }).strict(),
    settings: z.object({ groups: z.array(z.string().min(1).max(100)), count: countSchema }).strict()
  })
  .strict();

const restoreCompatibilitySchema: z.ZodType<RestoreCompatibility> = z
  .object({
    formatVersion: countSchema,
    sourceSchemaVersion: countSchema,
    targetSchemaVersion: countSchema,
    minimumSupportedSchemaVersion: countSchema,
    upgradedFrom: countSchema.nullable(),
    compatible: z.boolean()
  })
  .strict();

const restoreImpactSchema: z.ZodType<RestoreImpact> = z
  .object({
    novelsNew: countSchema,
    novelsExisting: countSchema,
    chaptersAdded: countSchema,
    chaptersSkipped: countSchema,
    sourceRemaps: countSchema,
    tasksRestored: countSchema,
    schedulerPoliciesRestored: countSchema,
    searchDocumentsRebuilt: countSchema,
    settingsOutcome: restoreSettingsPolicySchema,
    replaceAll: z.literal(true).optional(),
    novelsTotal: countSchema.optional(),
    chaptersTotal: countSchema.optional(),
    tasksTotal: countSchema.optional(),
    schedulerPoliciesTotal: countSchema.optional(),
    searchDocumentsTotal: countSchema.optional()
  })
  .strict();

const contributorImpactSchema = z.record(z.record(countSchema));

const restorePlanSchema: z.ZodType<RestorePlan> = z
  .object({
    mode: z.enum(['merge', 'replace']),
    settingsPolicy: restoreSettingsPolicySchema,
    archiveChecksum: checksumSchema,
    targetFingerprint: checksumSchema.nullable(),
    contributorImpact: contributorImpactSchema,
    impact: restoreImpactSchema,
    createdAt: isoSchema
  })
  .strict();

const restoreSessionPublicShape = {
  id: z.string().min(1).max(200),
  state: restoreStateSchema,
  stage: z.string().min(1).max(100),
  originalFilename: z
    .string()
    .min(1)
    .max(255)
    .refine((value) => !/[\\/]/.test(value)),
  expectedBytes: countSchema,
  receivedBytes: countSchema,
  expiresAt: isoSchema,
  absoluteExpiresAt: isoSchema,
  lockedOperationId: z.string().min(1).max(200).nullable()
} as const;

const restoreSessionPublicSchema: z.ZodType<RestoreSessionPublic> = z
  .object(restoreSessionPublicShape)
  .strict()
  .refine((session) => session.receivedBytes <= session.expectedBytes, {
    message: 'Restore upload response exceeds expected bytes'
  });

const restoreSessionAuthenticatedShape = {
  ...restoreSessionPublicShape,
  encrypted: z.boolean().nullable(),
  passwordFailures: countSchema.max(5),
  attemptsRemaining: countSchema.max(5),
  inventory: restoreInventorySchema.nullable(),
  compatibility: restoreCompatibilitySchema.nullable(),
  mergePlan: restorePlanSchema.nullable(),
  mergePlanFingerprint: planFingerprintSchema.nullable(),
  selectedMode: z.enum(['merge', 'replace']).nullable(),
  settingsPolicy: restoreSettingsPolicySchema.nullable(),
  inspectionToken: tokenSchema.nullable().optional()
} as const;

const restoreSessionAuthenticatedSchema: z.ZodType<RestoreSessionAuthenticated> = z
  .object(restoreSessionAuthenticatedShape)
  .strict()
  .refine((session) => session.receivedBytes <= session.expectedBytes, {
    message: 'Restore upload response exceeds expected bytes'
  });

function assertNoPrivateRestoreFields(value: unknown, path = 'response'): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoPrivateRestoreFields(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (
      /^(?:temporaryRoot|sessionTokenHash|inspectionTokenHash|downloadTokenHash|serverPath)$/i.test(
        key
      )
    ) {
      throw new Error(`Restore response exposes a private server field at ${path}.${key}`);
    }
    if (
      typeof item === 'string' &&
      key !== 'originalFilename' &&
      (/^[A-Za-z]:[\\/]/.test(item) || /^\/(?:tmp|var|home|private|mnt)\//.test(item))
    ) {
      throw new Error(`Restore response exposes a private server path at ${path}.${key}`);
    }
    assertNoPrivateRestoreFields(item, `${path}.${key}`);
  }
}

export function validateRestoreSessionCreate(value: unknown): {
  sessionId: string;
  sessionToken: string;
  receivedBytes: number;
  expiresAt: string;
  absoluteExpiresAt: string;
} {
  assertNoPrivateRestoreFields(value);
  return z
    .object({
      sessionId: z.string().min(1).max(200),
      sessionToken: tokenSchema,
      receivedBytes: countSchema,
      expiresAt: isoSchema,
      absoluteExpiresAt: isoSchema
    })
    .strict()
    .parse(value);
}

export function validateRestoreSessionPublic(value: unknown): RestoreSessionPublic {
  assertNoPrivateRestoreFields(value);
  return restoreSessionPublicSchema.parse(value);
}

export function validateCurrentRestoreSession(value: unknown): {
  session: RestoreSessionPublic | null;
} {
  assertNoPrivateRestoreFields(value);
  return z.object({ session: restoreSessionPublicSchema.nullable() }).strict().parse(value);
}

export function validateRestoreSessionDetail(value: unknown): RestoreSessionAuthenticated {
  assertNoPrivateRestoreFields(value);
  return restoreSessionAuthenticatedSchema.parse(value);
}

export function validateRestoreUploadOffset(value: unknown): {
  receivedBytes: number;
  expectedBytes: number;
  state: RestoreSessionState;
} {
  assertNoPrivateRestoreFields(value);
  return z
    .object({
      receivedBytes: countSchema,
      expectedBytes: countSchema,
      state: restoreStateSchema
    })
    .strict()
    .refine((item) => item.receivedBytes <= item.expectedBytes, {
      message: 'Restore upload response exceeds expected bytes'
    })
    .parse(value);
}

export function validateRestorePasswordFailure(value: unknown): { attemptsRemaining: number } {
  assertNoPrivateRestoreFields(value);
  return z
    .object({ attemptsRemaining: countSchema.max(4) })
    .passthrough()
    .parse(value);
}

export function validateRestorePlanResponse(value: unknown): RestorePlanResponse {
  assertNoPrivateRestoreFields(value);
  return z
    .object({
      ...restoreSessionAuthenticatedShape,
      plan: restorePlanSchema,
      planFingerprint: planFingerprintSchema,
      inspectionToken: tokenSchema,
      pendingSettings: z.record(z.unknown()).nullable()
    })
    .strict()
    .refine((session) => session.receivedBytes <= session.expectedBytes, {
      message: 'Restore upload response exceeds expected bytes'
    })
    .parse(value) as RestorePlanResponse;
}
