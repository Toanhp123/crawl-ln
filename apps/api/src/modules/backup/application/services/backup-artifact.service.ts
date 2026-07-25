import { createHash, randomBytes } from 'node:crypto';
import { dirname } from 'node:path';
import type { BackupControlRepository } from '../ports/backup-control.repository.js';
import type { BackupFileStore } from '../ports/backup-file-store.port.js';
import { BackupOperationError } from '../errors/backup.error.js';
import type {
  BackupArtifactKind,
  BackupArtifactRecord
} from '../../domain/backup-operation.models.js';

const artifactRetentionMs = 24 * 60 * 60 * 1_000;
const downloadTokenLifetimeMs = 10 * 60 * 1_000;

export interface BackupArtifactServiceOptions {
  clock: { now(): Date };
  ids: { randomId(): string };
}

export class BackupArtifactService {
  constructor(
    private readonly repository: BackupControlRepository,
    private readonly files: BackupFileStore,
    private readonly options: BackupArtifactServiceOptions
  ) {}

  async createFromOperation(input: {
    operationId: string;
    kind: BackupArtifactKind;
    sourcePath: string;
    filename: string;
    encrypted: boolean;
  }): Promise<BackupArtifactRecord> {
    if (!this.repository.findOperation(input.operationId)) {
      throw new BackupOperationError(
        'BACKUP_OPERATION_NOT_FOUND',
        404,
        'Backup operation was not found',
        false,
        { operationId: input.operationId }
      );
    }
    const artifactId = this.options.ids.randomId();
    let promotedPath: string | undefined;
    try {
      promotedPath = await this.files.promoteArtifact({
        sourcePath: input.sourcePath,
        artifactId,
        filename: input.filename
      });
      const [{ size }, sha256] = await Promise.all([
        this.files.stat(promotedPath),
        this.sha256(promotedPath)
      ]);
      const createdAt = this.now();
      return this.repository.createArtifact({
        id: artifactId,
        operationId: input.operationId,
        kind: input.kind,
        path: promotedPath,
        filename: this.sanitizeFilename(input.filename),
        sizeBytes: size,
        sha256,
        encrypted: input.encrypted,
        createdAt,
        expiresAt: new Date(new Date(createdAt).getTime() + artifactRetentionMs).toISOString(),
        downloadTokenHash: null,
        downloadTokenExpiresAt: null,
        downloadTokenConsumedAt: null
      });
    } catch (error) {
      if (promotedPath) await this.files.removePath(dirname(promotedPath)).catch(() => undefined);
      throw error;
    }
  }

  async issueDownloadToken(
    operationId: string,
    artifactId: string
  ): Promise<{ token: string; expiresAt: string }> {
    const artifact = this.repository.findArtifact(artifactId);
    if (!artifact || artifact.operationId !== operationId) throw this.invalidTokenError();
    const now = this.now();
    if (artifact.expiresAt <= now) {
      throw new BackupOperationError(
        'BACKUP_ARTIFACT_EXPIRED',
        410,
        'Backup artifact has expired',
        false,
        { operationId, artifactId }
      );
    }
    const token = randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(new Date(now).getTime() + downloadTokenLifetimeMs).toISOString();
    this.repository.updateArtifactToken(artifactId, {
      downloadTokenHash: tokenHash,
      downloadTokenExpiresAt: expiresAt,
      downloadTokenConsumedAt: null
    });
    return { token, expiresAt };
  }

  acceptDownloadToken(token: string): BackupArtifactRecord {
    const artifact = this.repository.consumeArtifactToken(this.hashToken(token), this.now());
    if (!artifact) throw this.invalidTokenError();
    return artifact;
  }

  private async sha256(path: string): Promise<string> {
    const hash = createHash('sha256');
    const stream = this.files.openReadStream(path) as NodeJS.ReadableStream & AsyncIterable<Buffer>;
    for await (const chunk of stream) hash.update(chunk);
    return hash.digest('hex');
  }

  private sanitizeFilename(filename: string): string {
    const normalized = filename.replaceAll('\\', '/');
    const candidate = normalized
      .split('/')
      .at(-1)
      ?.replace(/[\u0000-\u001f\u007f"\\]/g, '_')
      .trim();
    if (!candidate || candidate === '.' || candidate === '..') return 'backup.nvt';
    return candidate;
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }

  private invalidTokenError(): BackupOperationError {
    return new BackupOperationError(
      'BACKUP_DOWNLOAD_TOKEN_INVALID',
      410,
      'Backup download token is invalid or expired',
      false
    );
  }

  private now(): string {
    return this.options.clock.now().toISOString();
  }
}
