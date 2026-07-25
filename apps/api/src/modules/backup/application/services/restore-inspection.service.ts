import { createHash } from 'node:crypto';
import type { BackupArchivePort } from '../ports/backup-archive.port.js';
import type { BackupControlRepository } from '../ports/backup-control.repository.js';
import type { BackupFileStore } from '../ports/backup-file-store.port.js';
import {
  BackupBadRequestError,
  BackupOperationError,
  BackupPasswordInvalidError
} from '../errors/backup.error.js';
import type { BackupManifest } from '../../domain/backup.models.js';
import {
  createOpaqueToken,
  tokenMatches,
  RESTORE_PASSWORD_ATTEMPTS,
  restoreSessionExpiry,
  type RestoreSessionRecord
} from '../../domain/restore-session.models.js';
import {
  computeServerPartialFingerprint,
  type RestorePreparationService,
  type RestoreSessionAuthenticatedView
} from './restore-preparation.service.js';
import type { BackupInventoryReader } from './backup-inventory.reader.js';
import type { BackupSchemaMigrator } from './backup-schema-migrator.js';

export interface RestoreInspectionResult extends RestoreSessionAuthenticatedView {
  inspectionToken: string | null;
}

export class RestoreInspectionService {
  private readonly issuedTokens = new Map<string, string>();

  constructor(
    private readonly repository: BackupControlRepository,
    private readonly files: BackupFileStore,
    private readonly archive: BackupArchivePort,
    private readonly preparation: RestorePreparationService,
    private readonly schemaMigrator: BackupSchemaMigrator,
    private readonly inventoryReader: BackupInventoryReader,
    private readonly clock: { now(): Date }
  ) {}

  requestComplete(sessionId: string, sessionToken: string): RestoreSessionAuthenticatedView {
    const session = this.preparation.requireAuthenticated(sessionId, sessionToken);
    this.assertCompleteUpload(session);
    if (session.state !== 'uploaded') {
      throw new BackupOperationError(
        'RESTORE_SESSION_STATE_INVALID',
        409,
        'Restore session is not ready to begin inspection',
        false,
        { sessionId, state: session.state }
      );
    }
    return this.preparation.toAuthenticatedView(session);
  }

  async complete(sessionId: string): Promise<RestoreInspectionResult> {
    let session = this.requireSession(sessionId);
    this.assertCompleteUpload(session);
    if (session.state !== 'uploaded') {
      throw new BackupOperationError(
        'RESTORE_SESSION_STATE_INVALID',
        409,
        'Restore session is not ready to begin inspection',
        false,
        { sessionId, state: session.state }
      );
    }

    session = this.preparation.updateAuthenticated(session, {
      state: 'hashing',
      stage: 'hashing',
      ...this.activityPatch(session)
    });
    try {
      const archivePath = this.files.uploadArchivePath(session.id);
      const checksum = await this.hashFile(archivePath);
      const fingerprint = await computeServerPartialFingerprint(this.files, session);
      if (fingerprint !== session.fileFingerprint) {
        await this.preparation.invalidateAndClean(session, 'RESTORE_FILE_FINGERPRINT_MISMATCH');
        throw new BackupOperationError(
          'RESTORE_FILE_FINGERPRINT_MISMATCH',
          422,
          'Restore file does not match the selected upload',
          false
        );
      }

      session = this.preparation.updateAuthenticated(session, {
        archiveChecksum: checksum,
        stage: 'detecting-encryption',
        ...this.activityPatch(session)
      });
      const content = await this.files.readBuffer(archivePath);
      const manifest = await this.archive.readManifest(content);
      session = this.preparation.updateAuthenticated(session, {
        encrypted: manifest.encrypted,
        ...this.activityPatch(session)
      });
      if (manifest.encrypted) {
        session = this.preparation.updateAuthenticated(session, {
          state: 'awaiting-password',
          stage: 'awaiting-password',
          ...this.activityPatch(session)
        });
        return this.result(session, null);
      }
      return await this.inspect(session, content, manifest);
    } catch (error) {
      if (
        error instanceof BackupOperationError &&
        error.code === 'RESTORE_FILE_FINGERPRINT_MISMATCH'
      ) {
        throw error;
      }
      return await this.failArchive(session, error);
    }
  }

  async unlock(sessionId: string, password: string): Promise<RestoreInspectionResult> {
    let session = this.requireSession(sessionId);
    if (session.state !== 'awaiting-password') {
      throw new BackupOperationError(
        'RESTORE_SESSION_STATE_INVALID',
        409,
        'Restore session is not awaiting a password',
        false,
        { sessionId, state: session.state }
      );
    }
    if (typeof password !== 'string' || password.length === 0 || password.length > 1024) {
      throw new BackupOperationError(
        'BACKUP_PASSWORD_INVALID',
        401,
        'Backup password is invalid',
        true,
        { attemptsRemaining: Math.max(0, RESTORE_PASSWORD_ATTEMPTS - session.passwordFailures) }
      );
    }

    session = this.preparation.updateAuthenticated(session, {
      state: 'inspecting',
      stage: 'verifying-archive',
      ...this.activityPatch(session)
    });
    try {
      const content = await this.files.readBuffer(this.files.uploadArchivePath(session.id));
      const manifest = await this.archive.readManifest(content);
      return await this.inspect(session, content, manifest, password);
    } catch (error) {
      if (error instanceof BackupPasswordInvalidError) {
        const failures = session.passwordFailures + 1;
        const attemptsRemaining = Math.max(0, RESTORE_PASSWORD_ATTEMPTS - failures);
        if (attemptsRemaining === 0) {
          await this.preparation.invalidateAndClean(
            this.preparation.updateAuthenticated(session, { passwordFailures: failures }),
            'BACKUP_PASSWORD_INVALID'
          );
          this.issuedTokens.delete(session.id);
        } else {
          this.preparation.updateAuthenticated(session, {
            state: 'awaiting-password',
            stage: 'awaiting-password',
            passwordFailures: failures,
            ...this.activityPatch(session)
          });
        }
        throw new BackupOperationError(
          'BACKUP_PASSWORD_INVALID',
          401,
          'Backup password is invalid',
          attemptsRemaining > 0,
          { attemptsRemaining }
        );
      }
      return await this.failArchive(session, error);
    }
  }

  inspectionToken(sessionId: string): string | null {
    const session = this.requireSession(sessionId);
    if (session.state !== 'ready') return null;
    const existing = this.issuedTokens.get(sessionId);
    if (
      existing &&
      session.inspectionTokenHash &&
      tokenMatches(existing, session.inspectionTokenHash)
    ) {
      return existing;
    }
    if (existing) this.issuedTokens.delete(sessionId);
    if (session.mergePlan) return null;
    const token = createOpaqueToken();
    this.repository.updateRestoreSession(sessionId, {
      inspectionTokenHash: token.hash,
      ...this.activityPatch(session)
    });
    this.issuedTokens.set(sessionId, token.plaintext);
    return token.plaintext;
  }

  async recoverInterruptedInspections(): Promise<string[]> {
    const session = this.repository.findCurrentRestoreSession();
    if (!session) return [];

    if (session.state === 'ready') {
      const required = ['database.sqlite', 'contributors.json', 'settings.json', 'manifest.json'];
      const complete = (
        await Promise.all(
          required.map((name) => this.files.exists(this.files.validatedPath(session.id, name)))
        )
      ).every(Boolean);
      if (!complete) await this.preparation.invalidateAndClean(session, 'BACKUP_STAGING_INVALID');
      return [];
    }

    if (session.state === 'hashing' || session.state === 'inspecting') {
      await this.files.removePath(this.files.validatedRoot(session.id));
      if (session.encrypted) {
        this.preparation.updateAuthenticated(session, {
          state: 'awaiting-password',
          stage: 'awaiting-password',
          ...this.activityPatch(session)
        });
        return [];
      }
      const recovered = this.preparation.updateAuthenticated(session, {
        state: 'uploaded',
        stage: 'uploaded',
        inspectionTokenHash: null,
        ...this.activityPatch(session)
      });
      return recovered.receivedBytes === recovered.expectedBytes ? [recovered.id] : [];
    }

    if (session.state === 'uploaded' && session.receivedBytes === session.expectedBytes) {
      return [session.id];
    }
    return [];
  }

  private async inspect(
    initial: RestoreSessionRecord,
    content: Buffer,
    manifest: BackupManifest,
    password?: string
  ): Promise<RestoreInspectionResult> {
    let session = initial;
    if (session.state !== 'inspecting') {
      session = this.preparation.updateAuthenticated(session, {
        state: 'inspecting',
        stage: 'verifying-archive',
        ...this.activityPatch(session)
      });
    }
    await this.files.removePath(this.files.validatedRoot(session.id));
    const opened = await this.archive.open(content, password);

    session = this.preparation.updateAuthenticated(session, {
      stage: 'extracting',
      ...this.activityPatch(session)
    });
    const databasePath = await this.files.writeInspectionFile(
      session.id,
      'database.sqlite',
      opened.database
    );
    await this.files.writeInspectionFile(
      session.id,
      'contributors.json',
      Buffer.from(JSON.stringify(opened.contributors))
    );
    await this.files.writeInspectionFile(
      session.id,
      'settings.json',
      Buffer.from(JSON.stringify(opened.settings ?? {}))
    );
    await this.files.writeInspectionFile(
      session.id,
      'manifest.json',
      Buffer.from(JSON.stringify(opened.manifest))
    );

    session = this.preparation.updateAuthenticated(session, {
      stage: 'migrating-staging',
      ...this.activityPatch(session)
    });
    const migration = this.schemaMigrator.migrate(databasePath, opened.manifest.schemaVersion);
    session = this.preparation.updateAuthenticated(session, {
      stage: 'integrity-check',
      ...this.activityPatch(session)
    });
    session = this.preparation.updateAuthenticated(session, {
      stage: 'inventory',
      ...this.activityPatch(session)
    });
    const { inventory, compatibility } = this.inventoryReader.read({
      databasePath,
      manifest: opened.manifest,
      archiveSizeBytes: content.length,
      contributors: opened.contributors,
      settings: opened.settings,
      migration
    });
    const token = createOpaqueToken();
    this.issuedTokens.set(session.id, token.plaintext);
    session = this.preparation.updateAuthenticated(session, {
      state: 'ready',
      stage: 'ready',
      inspectionTokenHash: token.hash,
      inventory,
      compatibility,
      ...this.activityPatch(session)
    });
    return this.result(session, token.plaintext);
  }

  private async failArchive(session: RestoreSessionRecord, error: unknown): Promise<never> {
    if (error instanceof BackupPasswordInvalidError) throw error;
    if (error instanceof BackupOperationError) {
      await this.preparation.invalidateAndClean(this.refresh(session), error.code);
      throw error;
    }
    await this.preparation.invalidateAndClean(this.refresh(session), 'BACKUP_ARCHIVE_UNSAFE');
    if (error instanceof BackupBadRequestError) {
      throw new BackupOperationError('BACKUP_ARCHIVE_UNSAFE', 422, error.message, false);
    }
    throw new BackupOperationError(
      'BACKUP_ARCHIVE_UNSAFE',
      422,
      'Backup archive is invalid',
      false
    );
  }

  private result(
    session: RestoreSessionRecord,
    inspectionToken: string | null
  ): RestoreInspectionResult {
    return { ...this.preparation.toAuthenticatedView(session), inspectionToken };
  }

  private assertCompleteUpload(session: RestoreSessionRecord): void {
    if (session.receivedBytes !== session.expectedBytes) {
      throw new BackupOperationError(
        'RESTORE_UPLOAD_INCOMPLETE',
        409,
        'Restore upload is incomplete',
        true,
        { receivedBytes: session.receivedBytes, expectedBytes: session.expectedBytes }
      );
    }
  }

  private requireSession(sessionId: string): RestoreSessionRecord {
    const session = this.repository.findRestoreSession(sessionId);
    if (!session) {
      throw new BackupOperationError(
        'RESTORE_SESSION_NOT_FOUND',
        404,
        'Restore session was not found',
        false,
        { sessionId }
      );
    }
    return session;
  }

  private refresh(session: RestoreSessionRecord): RestoreSessionRecord {
    return this.repository.findRestoreSession(session.id) ?? session;
  }

  private activityPatch(session: RestoreSessionRecord): {
    lastActivityAt: string;
    expiresAt: string;
  } {
    const now = this.clock.now();
    return {
      lastActivityAt: now.toISOString(),
      expiresAt: restoreSessionExpiry(now, new Date(session.absoluteExpiresAt)).toISOString()
    };
  }

  private async hashFile(path: string): Promise<string> {
    const hash = createHash('sha256');
    const stream = this.files.openReadStream(path) as NodeJS.ReadableStream & AsyncIterable<Buffer>;
    for await (const chunk of stream) hash.update(chunk);
    return hash.digest('hex');
  }
}
