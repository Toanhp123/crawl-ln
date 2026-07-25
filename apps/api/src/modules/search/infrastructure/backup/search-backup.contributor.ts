import { z } from 'zod';
import type {
  BackupContributor,
  BackupContributorImpact,
  BackupImportContext
} from '../../../../platform/backup/backup-contributor.js';
import type { SearchLibrarySourcePort } from '../../application/ports/search-library-source.port.js';
import type { SearchSqliteRepository } from '../sqlite/search-sqlite.repository.js';

const searchBackupSchema = z.object({ formatVersion: z.literal(1) }).strict();

export class SearchBackupContributor implements BackupContributor {
  readonly module = 'search';
  readonly fingerprintTables = [] as const;

  constructor(
    private readonly source: SearchLibrarySourcePort,
    private readonly repository: SearchSqliteRepository,
    private readonly clock: { now(): Date }
  ) {}

  exportMergeData(): Promise<unknown> {
    return Promise.resolve({ formatVersion: 1 });
  }

  async importMergeData(
    data: unknown,
    _context: BackupImportContext
  ): Promise<BackupContributorImpact> {
    searchBackupSchema.parse(data);
    const documents = await this.source.listDocuments();
    const result = this.repository.replaceAllForRestore(documents, this.clock.now().toISOString());
    return {
      module: this.module,
      counts: { indexedDocuments: result.indexedDocuments }
    };
  }
}
