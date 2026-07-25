import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import type { BackupControlRepository } from '../ports/backup-control.repository.js';
import type { BackupMergePlanner } from './backup-merge-planner.js';
import type { BackupFileStore } from '../ports/backup-file-store.port.js';
import { BackupOperationError } from '../errors/backup.error.js';
import {
  canTransitionRestoreSession,
  createOpaqueToken,
  isPartialRestoreFingerprint,
  isTerminalRestoreSession,
  RESTORE_PARTIAL_FINGERPRINT_BYTES,
  RESTORE_SESSION_ABSOLUTE_MS,
  RESTORE_UPLOAD_CHUNK_BYTES,
  RESTORE_UPLOAD_MAX_BYTES,
  restoreSessionExpiry,
  tokenMatches,
  type BackupCompatibility,
  type BackupInventory,
  type BackupMergePlan,
  type BackupRestorePlan,
  type RestoreMode,
  type RestoreSettingsPolicy,
  type CreateRestoreSessionRecord,
  type RestoreSessionPatch,
  type RestoreSessionRecord,
  type RestoreSessionState
} from '../../domain/restore-session.models.js';

export interface CreateRestoreSessionInput {
  filename: string;
  size: number;
  fingerprint: `sha256-partial-v1:${string}`;
  replaceExisting: boolean;
}

export interface AppendRestoreChunkInput {
  sessionId: string;
  sessionToken: string;
  offset: number;
  content: Buffer;
}

export interface CreateRestorePlanInput {
  mode: RestoreMode;
  settingsPolicy: RestoreSettingsPolicy;
}

export interface RestorePlanResponse extends RestoreSessionAuthenticatedView {
  plan: BackupRestorePlan;
  planFingerprint: string;
  inspectionToken: string;
  pendingSettings: Record<string, unknown> | null;
}

export interface RestoreSessionPublicView {
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

export interface RestoreSessionAuthenticatedView extends RestoreSessionPublicView {
  encrypted: boolean | null;
  passwordFailures: number;
  attemptsRemaining: number;
  inventory: BackupInventory | null;
  compatibility: BackupCompatibility | null;
  mergePlan: BackupMergePlan | null;
  mergePlanFingerprint: string | null;
  selectedMode: 'merge' | 'replace' | null;
  settingsPolicy: 'keep-current' | 'use-backup' | null;
}

export interface RestorePreparationServiceOptions {
  clock: { now(): Date };
  ids: { randomId(): string };
  onChanged?(reason: string): void;
}

export class RestorePreparationService {
  private readonly appendLocks = new Map<string, Promise<void>>();

  constructor(
    private readonly repository: BackupControlRepository,
    private readonly files: BackupFileStore,
    private readonly options: RestorePreparationServiceOptions,
    private readonly planner?: BackupMergePlanner
  ) {}

  async create(input: CreateRestoreSessionInput): Promise<{
    sessionId: string;
    sessionToken: string;
    receivedBytes: number;
    expiresAt: string;
    absoluteExpiresAt: string;
  }> {
    this.validateCreateInput(input);
    const active = this.repository.findActiveOperation();
    if (active) {
      throw new BackupOperationError(
        'BACKUP_OPERATION_ACTIVE',
        409,
        'Another backup or restore operation is already running',
        true,
        {
          operation: {
            id: active.id,
            kind: active.kind,
            mode: active.mode,
            state: active.state,
            stage: active.stage
          }
        }
      );
    }

    const existing = this.repository.findCurrentRestoreSession();
    if (existing) {
      if (!input.replaceExisting) {
        throw new BackupOperationError(
          'RESTORE_SESSION_EXISTS',
          409,
          'A restore preparation session already exists',
          true,
          { session: this.toPublicView(existing) }
        );
      }
      if (existing.state === 'locked') {
        throw new BackupOperationError(
          'RESTORE_SESSION_LOCKED',
          409,
          'The restore session is locked by an active operation',
          false,
          { sessionId: existing.id, operationId: existing.lockedOperationId }
        );
      }
      this.invalidateSession(existing, 'cancelled', 'replaced');
      await this.files.removeSessionRoot(existing.id);
    }

    const now = this.options.clock.now();
    const absolute = new Date(now.getTime() + RESTORE_SESSION_ABSOLUTE_MS);
    const expires = restoreSessionExpiry(now, absolute);
    const token = createOpaqueToken();
    const id = this.options.ids.randomId();
    const record: CreateRestoreSessionRecord = {
      id,
      sessionTokenHash: token.hash,
      inspectionTokenHash: null,
      state: 'uploading',
      stage: 'uploading',
      originalFilename: this.sanitizeFilename(input.filename),
      expectedBytes: input.size,
      receivedBytes: 0,
      fileFingerprint: input.fingerprint,
      archiveChecksum: null,
      encrypted: null,
      passwordFailures: 0,
      inventory: null,
      compatibility: null,
      mergePlan: null,
      mergePlanFingerprint: null,
      selectedMode: null,
      settingsPolicy: null,
      temporaryRoot: `restore-session:${id}`,
      createdAt: now.toISOString(),
      lastActivityAt: now.toISOString(),
      expiresAt: expires.toISOString(),
      absoluteExpiresAt: absolute.toISOString(),
      lockedOperationId: null
    };

    await this.files.initializeSession(id);
    try {
      this.repository.createRestoreSession(record);
    } catch (error) {
      await this.files.removeSessionRoot(id).catch(() => undefined);
      const current = this.repository.findCurrentRestoreSession();
      if (current) {
        throw new BackupOperationError(
          'RESTORE_SESSION_EXISTS',
          409,
          'A restore preparation session already exists',
          true,
          { session: this.toPublicView(current) }
        );
      }
      throw error;
    }
    this.notify('backup.restore-session.created');
    return {
      sessionId: id,
      sessionToken: token.plaintext,
      receivedBytes: 0,
      expiresAt: record.expiresAt,
      absoluteExpiresAt: record.absoluteExpiresAt
    };
  }

  current(): RestoreSessionPublicView | null {
    const session = this.repository.findCurrentRestoreSession();
    return session ? this.toPublicView(session) : null;
  }

  read(sessionId: string, sessionToken: string): RestoreSessionAuthenticatedView {
    const session = this.authenticate(sessionId, sessionToken);
    return this.toAuthenticatedView(this.touchRecord(session));
  }

  async append(input: AppendRestoreChunkInput): Promise<{
    receivedBytes: number;
    expectedBytes: number;
    state: RestoreSessionState;
  }> {
    return this.serialize(input.sessionId, async () => {
      const session = this.authenticate(input.sessionId, input.sessionToken);
      this.assertNotExpired(session);
      if (session.state !== 'uploading') {
        throw new BackupOperationError(
          'RESTORE_SESSION_STATE_INVALID',
          409,
          'Restore session is not accepting upload chunks',
          false,
          { sessionId: session.id, state: session.state, receivedBytes: session.receivedBytes }
        );
      }
      if (!Number.isSafeInteger(input.offset) || input.offset < 0) {
        throw new BackupOperationError(
          'RESTORE_UPLOAD_INVALID',
          422,
          'Upload offset is invalid',
          false
        );
      }
      if (input.offset !== session.receivedBytes) {
        throw new BackupOperationError(
          'OFFSET_MISMATCH',
          409,
          'Upload offset does not match the server offset',
          true,
          {
            receivedBytes: session.receivedBytes,
            expectedOffset: session.receivedBytes
          }
        );
      }
      const remaining = session.expectedBytes - session.receivedBytes;
      if (input.content.length < 1 || input.content.length > RESTORE_UPLOAD_CHUNK_BYTES) {
        throw new BackupOperationError(
          'RESTORE_UPLOAD_INVALID',
          413,
          'Restore upload chunk must contain between 1 byte and 8 MiB',
          false,
          { maxChunkBytes: RESTORE_UPLOAD_CHUNK_BYTES }
        );
      }
      if (input.content.length > remaining) {
        throw new BackupOperationError(
          'RESTORE_UPLOAD_INVALID',
          422,
          'Restore upload exceeds the declared file size',
          false,
          { receivedBytes: session.receivedBytes, expectedBytes: session.expectedBytes }
        );
      }
      if (
        input.content.length !== RESTORE_UPLOAD_CHUNK_BYTES &&
        input.content.length !== remaining
      ) {
        throw new BackupOperationError(
          'RESTORE_UPLOAD_INVALID',
          422,
          'Only the final restore upload chunk may be smaller than 8 MiB',
          false,
          { remainingBytes: remaining, chunkBytes: input.content.length }
        );
      }

      const nextOffset = await this.files.appendUploadChunk(
        session.id,
        session.receivedBytes,
        input.content
      );
      const completed = nextOffset === session.expectedBytes;
      const updated = this.updateSession(session, {
        ...(completed ? { state: 'uploaded' as const, stage: 'uploaded' } : {}),
        receivedBytes: nextOffset,
        ...this.activityPatch(session)
      });
      this.notify('backup.restore-session.upload-progress');
      return {
        receivedBytes: updated.receivedBytes,
        expectedBytes: updated.expectedBytes,
        state: updated.state
      };
    });
  }

  async createPlan(
    sessionId: string,
    sessionToken: string,
    input: CreateRestorePlanInput
  ): Promise<RestorePlanResponse> {
    const session = this.authenticate(sessionId, sessionToken);
    if (session.state !== 'ready') {
      throw new BackupOperationError(
        'RESTORE_SESSION_STATE_INVALID',
        409,
        'Restore session is not ready to create a plan',
        false,
        { sessionId, state: session.state }
      );
    }
    const active = this.repository.findActiveOperation();
    if (active) {
      throw new BackupOperationError(
        'BACKUP_OPERATION_ACTIVE',
        409,
        'Another backup or restore operation is already running',
        true,
        { operation: { id: active.id, kind: active.kind, mode: active.mode, stage: active.stage } }
      );
    }
    if (!this.planner || !session.archiveChecksum || !session.inventory) {
      throw new BackupOperationError(
        'RESTORE_PLAN_UNAVAILABLE',
        409,
        'Restore planning is unavailable for this session',
        false,
        { sessionId }
      );
    }

    const contributors = await this.readStagedRecord(session.id, 'contributors.json');
    const settings = await this.readStagedRecord(session.id, 'settings.json');
    const planned = await this.planner.createPlan({
      mode: input.mode,
      settingsPolicy: input.settingsPolicy,
      archiveChecksum: session.archiveChecksum,
      stagedContributors: contributors,
      inventory: session.inventory
    });
    const token = createOpaqueToken();
    const updated = this.repository.updateRestoreSession(session.id, {
      mergePlan: planned.plan,
      mergePlanFingerprint: planned.fingerprint,
      selectedMode: input.mode,
      settingsPolicy: input.settingsPolicy,
      inspectionTokenHash: token.hash,
      ...this.activityPatch(session)
    });
    this.notify('backup.restore-session.plan-created');
    return {
      ...this.toAuthenticatedView(updated),
      plan: planned.plan,
      planFingerprint: planned.fingerprint,
      inspectionToken: token.plaintext,
      pendingSettings: input.settingsPolicy === 'use-backup' ? settings : null
    };
  }

  touch(sessionId: string, sessionToken: string): RestoreSessionAuthenticatedView {
    const session = this.authenticate(sessionId, sessionToken);
    return this.toAuthenticatedView(this.touchRecord(session));
  }

  async cancel(sessionId: string, sessionToken: string): Promise<RestoreSessionPublicView> {
    const session = this.authenticate(sessionId, sessionToken);
    if (session.state === 'locked') {
      throw new BackupOperationError(
        'RESTORE_SESSION_LOCKED',
        409,
        'The restore session cannot be cancelled while locked',
        false,
        { sessionId: session.id, operationId: session.lockedOperationId }
      );
    }
    if (!isTerminalRestoreSession(session.state)) {
      this.invalidateSession(session, 'cancelled', 'cancelled');
      await this.files.removeSessionRoot(session.id);
      this.notify('backup.restore-session.cancelled');
    }
    return this.toPublicView(this.requireSession(session.id));
  }

  async reconcileUpload(): Promise<void> {
    const session = this.repository.findCurrentRestoreSession();
    if (!session || session.state !== 'uploading') return;
    const path = this.files.uploadArchivePath(session.id);
    if (!(await this.files.exists(path))) {
      if (session.receivedBytes === 0) return;
      await this.invalidateAndClean(session, 'RESTORE_UPLOAD_TRUNCATED');
      return;
    }
    const actual = (await this.files.stat(path)).size;
    if (actual > session.receivedBytes) {
      await this.files.truncateUpload(session.id, session.receivedBytes);
      return;
    }
    if (actual < session.receivedBytes) {
      await this.invalidateAndClean(session, 'RESTORE_UPLOAD_TRUNCATED');
    }
  }

  transition(
    sessionId: string,
    sessionToken: string,
    patch: RestoreSessionPatch & { state: RestoreSessionState; stage: string }
  ): RestoreSessionRecord {
    const session = this.authenticate(sessionId, sessionToken);
    return this.updateSession(session, patch);
  }

  requireAuthenticated(sessionId: string, sessionToken: string): RestoreSessionRecord {
    return this.authenticate(sessionId, sessionToken);
  }

  updateAuthenticated(
    session: RestoreSessionRecord,
    patch: RestoreSessionPatch & { state?: RestoreSessionState }
  ): RestoreSessionRecord {
    return this.updateSession(session, patch);
  }

  async invalidateAndClean(session: RestoreSessionRecord, errorCode: string): Promise<void> {
    const invalidated = this.invalidateSession(session, 'invalid', errorCode);
    await this.files.removeSessionRoot(invalidated.id);
    this.notify('backup.restore-session.invalid');
  }

  requireInspectionToken(session: RestoreSessionRecord, inspectionToken: string): void {
    if (
      !session.inspectionTokenHash ||
      !tokenMatches(inspectionToken, session.inspectionTokenHash)
    ) {
      throw new BackupOperationError(
        'RESTORE_INSPECTION_TOKEN_INVALID',
        401,
        'Restore inspection token is invalid',
        false,
        { sessionId: session.id }
      );
    }
  }

  async loadExecutionData(sessionId: string): Promise<{
    contributors: Record<string, unknown>;
    settings: Record<string, unknown>;
    databasePath: string;
  }> {
    const session = this.requireSession(sessionId);
    if (session.state !== 'locked') {
      throw new BackupOperationError(
        'RESTORE_SESSION_STATE_INVALID',
        409,
        'Restore session is not locked for execution',
        false,
        { sessionId, state: session.state }
      );
    }
    return {
      contributors: await this.readStagedRecord(sessionId, 'contributors.json'),
      settings: await this.readStagedRecord(sessionId, 'settings.json'),
      databasePath: this.files.validatedPath(sessionId, 'database.sqlite')
    };
  }

  unlockExecution(
    sessionId: string,
    input: { clearPlan: boolean; stage?: string }
  ): RestoreSessionRecord {
    const session = this.requireSession(sessionId);
    if (session.state !== 'locked') return session;
    const updated = this.updateSession(session, {
      state: 'ready',
      stage: input.stage ?? 'ready',
      lockedOperationId: null,
      ...(input.clearPlan
        ? {
            mergePlan: null,
            mergePlanFingerprint: null,
            selectedMode: null,
            settingsPolicy: null
          }
        : {}),
      ...this.activityPatch(session)
    });
    this.notify('backup.restore-session.unlocked');
    return updated;
  }

  async consumeExecution(sessionId: string): Promise<RestoreSessionRecord> {
    const session = this.requireSession(sessionId);
    const replacementToken = createOpaqueToken();
    const updated = this.updateSession(session, {
      state: 'consumed',
      stage: 'consumed',
      sessionTokenHash: replacementToken.hash,
      inspectionTokenHash: null,
      lockedOperationId: null,
      ...this.activityPatch(session)
    });
    await this.files.removeSessionRoot(sessionId);
    this.notify('backup.restore-session.consumed');
    return updated;
  }

  async invalidateExecution(sessionId: string, errorCode: string): Promise<void> {
    const session = this.requireSession(sessionId);
    await this.invalidateAndClean(session, errorCode);
  }

  toPublicView(session: RestoreSessionRecord): RestoreSessionPublicView {
    return {
      id: session.id,
      state: session.state,
      stage: session.stage,
      originalFilename: session.originalFilename,
      expectedBytes: session.expectedBytes,
      receivedBytes: session.receivedBytes,
      expiresAt: session.expiresAt,
      absoluteExpiresAt: session.absoluteExpiresAt,
      lockedOperationId: session.lockedOperationId
    };
  }

  toAuthenticatedView(session: RestoreSessionRecord): RestoreSessionAuthenticatedView {
    return {
      ...this.toPublicView(session),
      encrypted: session.encrypted,
      passwordFailures: session.passwordFailures,
      attemptsRemaining: Math.max(0, 5 - session.passwordFailures),
      inventory: session.inventory,
      compatibility: session.compatibility,
      mergePlan: session.mergePlan,
      mergePlanFingerprint: session.mergePlanFingerprint,
      selectedMode: session.selectedMode,
      settingsPolicy: session.settingsPolicy
    };
  }

  private async serialize<T>(sessionId: string, work: () => Promise<T>): Promise<T> {
    const previous = this.appendLocks.get(sessionId) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const tail = previous.then(() => gate);
    this.appendLocks.set(sessionId, tail);
    await previous;
    try {
      return await work();
    } finally {
      release();
      if (this.appendLocks.get(sessionId) === tail) this.appendLocks.delete(sessionId);
    }
  }

  private async readStagedRecord(
    sessionId: string,
    name: 'contributors.json' | 'settings.json'
  ): Promise<Record<string, unknown>> {
    try {
      const parsed: unknown = JSON.parse(
        (await this.files.readBuffer(this.files.validatedPath(sessionId, name))).toString('utf8')
      );
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('Expected a JSON object');
      }
      return parsed as Record<string, unknown>;
    } catch (error) {
      throw new BackupOperationError(
        'BACKUP_STAGING_INVALID',
        422,
        `Backup staging ${name} is invalid`,
        false,
        { sessionId }
      );
    }
  }

  private validateCreateInput(input: CreateRestoreSessionInput): void {
    if (
      !Number.isSafeInteger(input.size) ||
      input.size < 1 ||
      input.size > RESTORE_UPLOAD_MAX_BYTES
    ) {
      throw new BackupOperationError(
        'RESTORE_UPLOAD_INVALID',
        input.size > RESTORE_UPLOAD_MAX_BYTES ? 413 : 422,
        'Restore archive size must be between 1 byte and 512 MiB',
        false,
        { maxBytes: RESTORE_UPLOAD_MAX_BYTES }
      );
    }
    if (!isPartialRestoreFingerprint(input.fingerprint)) {
      throw new BackupOperationError(
        'RESTORE_FINGERPRINT_INVALID',
        422,
        'Restore file fingerprint is invalid',
        false
      );
    }
    if (typeof input.filename !== 'string' || input.filename.trim().length === 0) {
      throw new BackupOperationError(
        'RESTORE_UPLOAD_INVALID',
        422,
        'Restore archive filename is required',
        false
      );
    }
  }

  private sanitizeFilename(value: string): string {
    const normalized = value.replace(/\\/g, '/');
    return (
      basename(normalized)
        .replace(/[\r\n]/g, '_')
        .slice(0, 255) || 'backup.nvt'
    );
  }

  private authenticate(sessionId: string, sessionToken: string): RestoreSessionRecord {
    const session = this.requireSession(sessionId);
    if (!tokenMatches(sessionToken, session.sessionTokenHash)) {
      throw new BackupOperationError(
        'RESTORE_SESSION_TOKEN_INVALID',
        401,
        'Restore session token is invalid',
        false
      );
    }
    this.assertNotExpired(session);
    return session;
  }

  private assertNotExpired(session: RestoreSessionRecord): void {
    const now = this.options.clock.now().getTime();
    if (
      session.state === 'expired' ||
      Date.parse(session.expiresAt) <= now ||
      Date.parse(session.absoluteExpiresAt) <= now
    ) {
      throw new BackupOperationError(
        'RESTORE_SESSION_EXPIRED',
        410,
        'Restore session has expired',
        false,
        { sessionId: session.id }
      );
    }
  }

  private requireSession(id: string): RestoreSessionRecord {
    const session = this.repository.findRestoreSession(id);
    if (!session) {
      throw new BackupOperationError(
        'RESTORE_SESSION_NOT_FOUND',
        404,
        'Restore session was not found',
        false,
        { sessionId: id }
      );
    }
    return session;
  }

  private touchRecord(session: RestoreSessionRecord): RestoreSessionRecord {
    if (isTerminalRestoreSession(session.state)) return session;
    return this.repository.updateRestoreSession(session.id, this.activityPatch(session));
  }

  private activityPatch(
    session: RestoreSessionRecord
  ): Pick<RestoreSessionPatch, 'lastActivityAt' | 'expiresAt'> {
    const now = this.options.clock.now();
    return {
      lastActivityAt: now.toISOString(),
      expiresAt: restoreSessionExpiry(now, new Date(session.absoluteExpiresAt)).toISOString()
    };
  }

  private updateSession(
    session: RestoreSessionRecord,
    patch: RestoreSessionPatch
  ): RestoreSessionRecord {
    if (patch.state !== undefined && !canTransitionRestoreSession(session.state, patch.state)) {
      throw new BackupOperationError(
        'RESTORE_SESSION_STATE_INVALID',
        409,
        'Restore session state transition is invalid',
        false,
        { sessionId: session.id, from: session.state, to: patch.state }
      );
    }
    return this.repository.updateRestoreSession(session.id, patch);
  }

  private invalidateSession(
    session: RestoreSessionRecord,
    state: Extract<RestoreSessionState, 'cancelled' | 'invalid'>,
    stage: string
  ): RestoreSessionRecord {
    return this.updateSession(session, {
      state,
      stage,
      sessionTokenHash: createHash('sha256')
        .update(createOpaqueToken().plaintext, 'utf8')
        .digest('hex'),
      inspectionTokenHash: null,
      lockedOperationId: null,
      ...this.activityPatch(session)
    });
  }

  private notify(reason: string): void {
    this.options.onChanged?.(reason);
  }
}

export async function computeServerPartialFingerprint(
  files: BackupFileStore,
  session: RestoreSessionRecord
): Promise<`sha256-partial-v1:${string}`> {
  const content = await files.readBuffer(files.uploadArchivePath(session.id));
  const firstLength = Math.min(RESTORE_PARTIAL_FINGERPRINT_BYTES, content.length);
  const lastLength = Math.min(RESTORE_PARTIAL_FINGERPRINT_BYTES, content.length);
  const size = Buffer.alloc(8);
  size.writeBigUInt64BE(BigInt(session.expectedBytes));
  const digest = createHash('sha256')
    .update(Buffer.from('sha256-partial-v1\0', 'utf8'))
    .update(size)
    .update(content.subarray(0, firstLength))
    .update(content.subarray(content.length - lastLength))
    .digest('hex');
  return `sha256-partial-v1:${digest}`;
}

export { RESTORE_UPLOAD_CHUNK_BYTES } from '../../domain/restore-session.models.js';
