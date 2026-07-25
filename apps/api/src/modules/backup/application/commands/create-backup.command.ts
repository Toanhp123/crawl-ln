import type { BackupArtifact, BackupSettings } from '../../domain/backup.models.js';
import type { BackupArchiveCreateHooks, BackupArchivePort } from '../ports/backup-archive.port.js';
import type { BackupStorePort } from '../ports/backup-store.port.js';
import type { BackupContributorCoordinator } from '../services/backup-contributor-coordinator.js';

export interface CreateBackupCommandHooks extends BackupArchiveCreateHooks {
  onStage?(stage: 'collecting' | 'archiving' | 'encrypting'): void;
}

export class CreateBackupCommandHandler {
  constructor(
    private readonly store: BackupStorePort,
    private readonly contributors: BackupContributorCoordinator,
    private readonly archive: BackupArchivePort,
    private readonly clock: { now(): Date }
  ) {}

  async execute(
    input: { password?: string; settings?: BackupSettings } = {},
    hooks: CreateBackupCommandHooks = {}
  ): Promise<BackupArtifact> {
    hooks.throwIfCancelled?.();
    hooks.onStage?.('collecting');
    const database = await this.store.createDatabaseSnapshot();
    hooks.throwIfCancelled?.();
    const snapshot = {
      database,
      contributors: await this.contributors.exportAll(),
      settings: input.settings ?? {}
    };
    const created = await this.archive.create(snapshot, input.password, hooks);
    const stamp = this.clock.now().toISOString().replace(/[:.]/g, '-');
    return {
      filename: `novel-tool-backup-${stamp}.nvt`,
      contentType: 'application/vnd.novel-tool.backup',
      content: created.content,
      encrypted: created.manifest.encrypted
    };
  }
}
