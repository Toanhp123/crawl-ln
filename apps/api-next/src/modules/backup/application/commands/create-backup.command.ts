import type { BackupArtifact, BackupSettings } from '../../domain/backup.models.js';
import type { BackupArchivePort } from '../ports/backup-archive.port.js';
import type { BackupStorePort } from '../ports/backup-store.port.js';
import type { BackupContributorCoordinator } from '../services/backup-contributor-coordinator.js';

export class CreateBackupCommandHandler {
  constructor(
    private readonly store: BackupStorePort,
    private readonly contributors: BackupContributorCoordinator,
    private readonly archive: BackupArchivePort,
    private readonly clock: { now(): Date }
  ) {}

  async execute(
    input: { password?: string; settings?: BackupSettings } = {}
  ): Promise<BackupArtifact> {
    const snapshot = {
      database: await this.store.createDatabaseSnapshot(),
      contributors: await this.contributors.exportAll(),
      settings: input.settings ?? {}
    };
    const created = await this.archive.create(snapshot, input.password?.trim() || undefined);
    const stamp = this.clock.now().toISOString().replace(/[:.]/g, '-');
    return {
      filename: `novel-tool-backup-${stamp}.nvt`,
      contentType: 'application/vnd.novel-tool.backup',
      content: created.content,
      encrypted: created.manifest.encrypted
    };
  }
}
