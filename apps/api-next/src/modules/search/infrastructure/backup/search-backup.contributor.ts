import { z } from 'zod';
import type {
  BackupContributor,
  BackupImportContext
} from '../../../../platform/backup/backup-contributor.js';
import type { SearchCommands } from '../../public/search.contracts.js';

const searchBackupSchema = z.object({ formatVersion: z.literal(1) }).strict();

export class SearchBackupContributor implements BackupContributor {
  readonly module = 'search';

  constructor(private readonly commands: Pick<SearchCommands, 'rebuild'>) {}

  exportMergeData(): Promise<unknown> {
    return Promise.resolve({ formatVersion: 1 });
  }

  async importMergeData(data: unknown, _context: BackupImportContext): Promise<void> {
    searchBackupSchema.parse(data);
    await this.commands.rebuild();
  }
}
