import { basename, dirname } from 'node:path';
import type { BackupControlRepository } from '../ports/backup-control.repository.js';
import type { BackupFileStore } from '../ports/backup-file-store.port.js';
import { isActiveBackupOperation } from '../../domain/backup-operation.models.js';

export interface BackupCleanupServiceOptions {
  clock: { now(): Date };
  logger?: { error(message: string, metadata?: Record<string, unknown>): void };
}

export interface BackupCleanupResult {
  artifactsDeleted: number;
  operationsDeleted: number;
  operationRootsDeleted: number;
  sessionsExpired: number;
  sessionRootsDeleted: number;
  failures: Array<{
    kind: 'artifact' | 'operation-root' | 'restore-session';
    id: string;
    errorClass: string;
  }>;
}

export class BackupCleanupService {
  constructor(
    private readonly repository: BackupControlRepository,
    private readonly files: BackupFileStore,
    private readonly options: BackupCleanupServiceOptions
  ) {}

  async run(): Promise<BackupCleanupResult> {
    const now = this.options.clock.now().toISOString();
    const failures: BackupCleanupResult['failures'] = [];
    let artifactsDeleted = 0;
    let operationRootsDeleted = 0;
    let sessionsExpired = 0;
    let sessionRootsDeleted = 0;

    for (const artifact of this.repository.listArtifactsExpiredBefore(now)) {
      try {
        await this.files.removePath(dirname(artifact.path));
        this.repository.deleteArtifact(artifact.id);
        artifactsDeleted += 1;
      } catch (error) {
        this.recordFailure(failures, 'artifact', artifact.id, error);
      }
    }

    for (const session of this.repository.expireRestoreSessions(now)) {
      try {
        await this.files.removeSessionRoot(session.id);
        sessionsExpired += 1;
      } catch (error) {
        this.recordFailure(failures, 'restore-session', session.id, error);
      }
    }

    const operationsDeleted = this.repository.deleteOperationsExpiredBefore(now);
    const managedPaths = await this.files.listManagedPaths();
    const orphanSessionIds = new Set<string>();
    for (const path of managedPaths) {
      const namespace = basename(dirname(path));
      if (namespace === 'uploads' || namespace === 'inspections') {
        const sessionId = basename(path);
        if (!this.repository.findRestoreSession(sessionId)) orphanSessionIds.add(sessionId);
      }
    }
    for (const sessionId of orphanSessionIds) {
      try {
        await this.files.removeSessionRoot(sessionId);
        sessionRootsDeleted += 1;
      } catch (error) {
        this.recordFailure(failures, 'restore-session', sessionId, error);
      }
    }

    for (const path of managedPaths) {
      if (basename(dirname(path)) !== 'operations') continue;
      const operationId = basename(path);
      const operation = this.repository.findOperation(operationId);
      if (operation && isActiveBackupOperation(operation.state)) continue;
      try {
        await this.files.removeOperationRoot(operationId);
        operationRootsDeleted += 1;
      } catch (error) {
        this.recordFailure(failures, 'operation-root', operationId, error);
      }
    }

    return {
      artifactsDeleted,
      operationsDeleted,
      operationRootsDeleted,
      sessionsExpired,
      sessionRootsDeleted,
      failures
    };
  }

  private recordFailure(
    failures: BackupCleanupResult['failures'],
    kind: 'artifact' | 'operation-root' | 'restore-session',
    id: string,
    error: unknown
  ): void {
    const failure = {
      kind,
      id,
      errorClass: error instanceof Error ? error.name : typeof error
    };
    failures.push(failure);
    this.options.logger?.error('backup.cleanup.failed', failure);
  }
}
