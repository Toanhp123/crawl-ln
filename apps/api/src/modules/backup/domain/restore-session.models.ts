import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const RESTORE_SESSION_IDLE_MS = 30 * 60 * 1_000;
export const RESTORE_SESSION_ABSOLUTE_MS = 2 * 60 * 60 * 1_000;
export const RESTORE_UPLOAD_MAX_BYTES = 512 * 1024 * 1024;
export const RESTORE_UPLOAD_CHUNK_BYTES = 8 * 1024 * 1024;
export const RESTORE_PARTIAL_FINGERPRINT_BYTES = 1024 * 1024;
export const RESTORE_PASSWORD_ATTEMPTS = 5;

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

export type RestoreMode = 'merge' | 'replace';
export type RestoreSettingsPolicy = 'keep-current' | 'use-backup';

export interface BackupInventory {
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
  sources: {
    plugins: number;
    credentials: number;
    networkProfiles: number;
  };
  ingestion: { tasks: number; events: number };
  scheduler: { policies: number; diagnostics: number };
  search: { indexedDocuments: number };
  settings: { groups: string[]; count: number };
}

export interface BackupCompatibility {
  formatVersion: number;
  sourceSchemaVersion: number;
  targetSchemaVersion: number;
  minimumSupportedSchemaVersion: number;
  upgradedFrom: number | null;
  compatible: boolean;
}

export interface BackupMergeImpact {
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

export interface BackupRestorePlan {
  mode: RestoreMode;
  settingsPolicy: RestoreSettingsPolicy;
  archiveChecksum: string;
  targetFingerprint: string | null;
  contributorImpact: Record<string, Record<string, number>>;
  impact: BackupMergeImpact;
  createdAt: string;
}

export type BackupMergePlan = BackupRestorePlan;

export interface RestoreSessionRecord {
  id: string;
  sessionTokenHash: string;
  inspectionTokenHash: string | null;
  state: RestoreSessionState;
  stage: string;
  originalFilename: string;
  expectedBytes: number;
  receivedBytes: number;
  fileFingerprint: string;
  archiveChecksum: string | null;
  encrypted: boolean | null;
  passwordFailures: number;
  inventory: BackupInventory | null;
  compatibility: BackupCompatibility | null;
  mergePlan: BackupMergePlan | null;
  mergePlanFingerprint: string | null;
  selectedMode: RestoreMode | null;
  settingsPolicy: RestoreSettingsPolicy | null;
  temporaryRoot: string;
  createdAt: string;
  lastActivityAt: string;
  expiresAt: string;
  absoluteExpiresAt: string;
  lockedOperationId: string | null;
}

export type CreateRestoreSessionRecord = RestoreSessionRecord;

export interface RestoreSessionPatch {
  sessionTokenHash?: string;
  inspectionTokenHash?: string | null;
  state?: RestoreSessionState;
  stage?: string;
  originalFilename?: string;
  expectedBytes?: number;
  receivedBytes?: number;
  fileFingerprint?: string;
  archiveChecksum?: string | null;
  encrypted?: boolean | null;
  passwordFailures?: number;
  inventory?: BackupInventory | null;
  compatibility?: BackupCompatibility | null;
  mergePlan?: BackupMergePlan | null;
  mergePlanFingerprint?: string | null;
  selectedMode?: RestoreMode | null;
  settingsPolicy?: RestoreSettingsPolicy | null;
  temporaryRoot?: string;
  lastActivityAt?: string;
  expiresAt?: string;
  absoluteExpiresAt?: string;
  lockedOperationId?: string | null;
}

const restoreTransitions: Record<RestoreSessionState, readonly RestoreSessionState[]> = {
  uploading: ['uploaded', 'cancelled', 'expired', 'invalid'],
  uploaded: ['hashing', 'cancelled', 'expired', 'invalid'],
  hashing: ['uploaded', 'awaiting-password', 'inspecting', 'invalid', 'expired'],
  'awaiting-password': ['inspecting', 'invalid', 'cancelled', 'expired'],
  inspecting: ['uploaded', 'ready', 'awaiting-password', 'invalid', 'expired'],
  ready: ['ready', 'locked', 'cancelled', 'expired'],
  locked: ['ready', 'consumed', 'invalid'],
  consumed: [],
  cancelled: [],
  expired: [],
  invalid: []
};

export function isTerminalRestoreSession(state: RestoreSessionState): boolean {
  return (
    state === 'consumed' || state === 'cancelled' || state === 'expired' || state === 'invalid'
  );
}

export function canTransitionRestoreSession(
  from: RestoreSessionState,
  to: RestoreSessionState
): boolean {
  return from === to ? from === 'ready' : restoreTransitions[from].includes(to);
}

export function restoreSessionExpiry(now: Date, absoluteExpiresAt: Date): Date {
  const idle = now.getTime() + RESTORE_SESSION_IDLE_MS;
  return new Date(Math.min(idle, absoluteExpiresAt.getTime()));
}

export function createOpaqueToken(): { plaintext: string; hash: string } {
  const plaintext = randomBytes(32).toString('base64url');
  return {
    plaintext,
    hash: createHash('sha256').update(plaintext, 'utf8').digest('hex')
  };
}

export function tokenMatches(plaintext: string, expectedHash: string): boolean {
  if (plaintext.length === 0 || plaintext.length > 512 || !/^[a-f0-9]{64}$/.test(expectedHash)) {
    return false;
  }
  const actual = createHash('sha256').update(plaintext, 'utf8').digest();
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function isPartialRestoreFingerprint(value: string): value is `sha256-partial-v1:${string}` {
  return /^sha256-partial-v1:[a-f0-9]{64}$/.test(value);
}
