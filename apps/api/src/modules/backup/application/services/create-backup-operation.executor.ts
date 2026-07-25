import type { BackupSettings } from '../../domain/backup.models.js';
import type { BackupFileStore } from '../ports/backup-file-store.port.js';
import type { BackupArtifactService } from './backup-artifact.service.js';
import type {
  BackupOperationExecutionContext,
  BackupOperationExecutor
} from './backup-operation-coordinator.js';
import type { CreateBackupCommandHandler } from '../commands/create-backup.command.js';

export interface CreateBackupOperationSecret {
  password?: string;
  settings: BackupSettings;
}

type CreateBackupCommand = Pick<CreateBackupCommandHandler, 'execute'>;
type CreateBackupArtifacts = Pick<BackupArtifactService, 'createFromOperation'>;
type CreateBackupFiles = Pick<BackupFileStore, 'writeOperationFile' | 'removeOperationRoot'>;

type BackupStage = 'collecting' | 'archiving' | 'encrypting' | 'finalizing';

export class CreateBackupOperationExecutor implements BackupOperationExecutor<CreateBackupOperationSecret> {
  constructor(
    private readonly command: CreateBackupCommand,
    private readonly artifacts: CreateBackupArtifacts,
    private readonly files: CreateBackupFiles
  ) {}

  static progressTotal(encrypted: boolean): number {
    return encrypted ? 4 : 3;
  }

  async execute(
    context: BackupOperationExecutionContext,
    secret: CreateBackupOperationSecret
  ): Promise<{
    result: { filename: string; sizeBytes: number; encrypted: boolean; expiresAt: string };
    resultArtifactId: string;
  }> {
    const stages: BackupStage[] = secret.password
      ? ['collecting', 'archiving', 'encrypting', 'finalizing']
      : ['collecting', 'archiving', 'finalizing'];
    const transition = (stage: BackupStage, cancellable = true) => {
      const stageIndex = stages.indexOf(stage);
      context.transition({
        stage,
        progressCurrent: stageIndex + 1,
        progressTotal: stages.length,
        cancellable
      });
    };

    try {
      const created = await this.command.execute(
        { password: secret.password, settings: secret.settings },
        {
          onStage(stage) {
            context.throwIfCancellationRequested();
            transition(stage);
          },
          throwIfCancelled() {
            context.throwIfCancellationRequested();
          }
        }
      );
      context.throwIfCancellationRequested();
      const sourcePath = await this.files.writeOperationFile(
        context.operationId,
        'backup.nvt',
        created.content
      );
      context.throwIfCancellationRequested();
      transition('finalizing');
      context.throwIfCancellationRequested();
      transition('finalizing', false);
      const artifact = await this.artifacts.createFromOperation({
        operationId: context.operationId,
        kind: 'user-backup',
        sourcePath,
        filename: created.filename,
        encrypted: created.encrypted
      });
      return {
        result: {
          filename: artifact.filename,
          sizeBytes: artifact.sizeBytes,
          encrypted: artifact.encrypted,
          expiresAt: artifact.expiresAt
        },
        resultArtifactId: artifact.id
      };
    } finally {
      secret.password = undefined;
      await this.files.removeOperationRoot(context.operationId).catch(() => undefined);
    }
  }
}
