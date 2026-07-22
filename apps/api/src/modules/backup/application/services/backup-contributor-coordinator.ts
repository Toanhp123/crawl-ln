import { z } from 'zod';
import {
  BackupIdentityRegistry,
  type BackupContributor
} from '../../../../platform/backup/backup-contributor.js';
import { BackupBadRequestError } from '../errors/backup.error.js';

const contributorDataSchema = z.record(z.unknown());

export class BackupContributorCoordinator {
  private readonly contributors: BackupContributor[];

  constructor(contributors: readonly BackupContributor[]) {
    const modules = new Set<string>();
    this.contributors = contributors.map((contributor) => {
      const module = contributor.module.trim();
      if (!module) throw new Error('Backup contributor module cannot be blank');
      if (modules.has(module)) throw new Error(`Duplicate backup contributor: ${module}`);
      modules.add(module);
      return contributor;
    });
  }

  async exportAll(): Promise<Record<string, unknown>> {
    const exported: Record<string, unknown> = {};
    for (const contributor of this.contributors) {
      exported[contributor.module] = await contributor.exportMergeData();
    }
    return exported;
  }

  async importAll(data: unknown, context: { importId: string }): Promise<Record<string, number>> {
    let parsed: Record<string, unknown>;
    try {
      parsed = contributorDataSchema.parse(data);
    } catch (error) {
      throw new BackupBadRequestError('Invalid backup contributor data', error);
    }

    const restored: Record<string, number> = {};
    const importContext = { ...context, identities: new BackupIdentityRegistry() };
    for (const contributor of this.contributors) {
      if (!Object.prototype.hasOwnProperty.call(parsed, contributor.module)) {
        throw new BackupBadRequestError(
          `Backup contributor data is missing for ${contributor.module}`
        );
      }
      try {
        await contributor.importMergeData(parsed[contributor.module], importContext);
      } catch (error) {
        if (error instanceof BackupBadRequestError) throw error;
        throw new BackupBadRequestError(
          `Invalid backup contributor data for ${contributor.module}`,
          error
        );
      }
      restored[contributor.module] = 1;
    }
    return restored;
  }
}
