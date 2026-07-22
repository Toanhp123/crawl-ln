import type { ClockPort } from '../../../../shared/ports/clock.port.js';
import type { BackupSettings, BackupArtifact } from '../../domain/backup.js';
import type { BackupArchivePort } from '../ports/backup-archive.port.js';
import type { BackupStorePort } from '../ports/backup-store.port.js';

export class CreateBackupUseCase {
  constructor(
    private readonly store: BackupStorePort,
    private readonly archive: BackupArchivePort,
    private readonly clock: ClockPort
  ) {}

  async execute(
    input: { password?: string; settings?: BackupSettings } = {}
  ): Promise<BackupArtifact> {
    const snapshot = await this.store.createSnapshot(input.settings ?? {});
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
