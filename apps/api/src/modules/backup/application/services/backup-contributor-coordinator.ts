import { z } from 'zod';
import {
  BackupIdentityRegistry,
  type BackupContributor,
  type BackupContributorImpact
} from '../../../../platform/backup/backup-contributor.js';
import { BackupBadRequestError } from '../errors/backup.error.js';

const contributorDataSchema = z.record(z.unknown());

function validateContributor(contributor: BackupContributor): BackupContributor {
  if (!contributor || typeof contributor !== 'object') {
    throw new Error('Backup contributor must be an object');
  }
  const module = contributor.module?.trim();
  if (!module) throw new Error('Backup contributor module cannot be blank');
  if (!Array.isArray(contributor.fingerprintTables)) {
    throw new Error(`Backup contributor ${module} must declare fingerprint tables`);
  }
  if (contributor.fingerprintTables.some((table) => typeof table !== 'string' || !table.trim())) {
    throw new Error(`Backup contributor ${module} has an invalid fingerprint table`);
  }
  if (typeof contributor.exportMergeData !== 'function') {
    throw new Error(`Backup contributor ${module} must export merge data`);
  }
  if (typeof contributor.importMergeData !== 'function') {
    throw new Error(`Backup contributor ${module} must import merge data`);
  }
  return contributor;
}

export class BackupContributorCoordinator {
  private readonly contributors: BackupContributor[];

  constructor(contributors: readonly BackupContributor[]) {
    const modules = new Set<string>();
    this.contributors = contributors.map((candidate) => {
      const contributor = validateContributor(candidate);
      const module = contributor.module.trim();
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

  async importAll(
    data: unknown,
    context: { importId: string; onBeforeContributor?(module: string): void }
  ): Promise<Record<string, BackupContributorImpact['counts']>> {
    let parsed: Record<string, unknown>;
    try {
      parsed = contributorDataSchema.parse(data);
    } catch (error) {
      throw new BackupBadRequestError('Invalid backup contributor data', error);
    }

    for (const contributor of this.contributors) {
      if (!Object.prototype.hasOwnProperty.call(parsed, contributor.module)) {
        throw new BackupBadRequestError(
          `Backup contributor data is missing for ${contributor.module}`
        );
      }
    }

    const restored: Record<string, BackupContributorImpact['counts']> = {};
    const importContext = { importId: context.importId, identities: new BackupIdentityRegistry() };
    for (const contributor of this.contributors) {
      context.onBeforeContributor?.(contributor.module);
      let impact: BackupContributorImpact;
      try {
        impact = await contributor.importMergeData(parsed[contributor.module], importContext);
      } catch (error) {
        if (error instanceof BackupBadRequestError) throw error;
        throw new BackupBadRequestError(
          `Invalid backup contributor data for ${contributor.module}`,
          error
        );
      }
      if (
        !impact ||
        impact.module !== contributor.module ||
        !impact.counts ||
        typeof impact.counts !== 'object'
      ) {
        throw new BackupBadRequestError(
          `Backup contributor impact is invalid for ${contributor.module}`
        );
      }
      for (const [key, value] of Object.entries(impact.counts)) {
        if (!Number.isSafeInteger(value) || value < 0) {
          throw new BackupBadRequestError(
            `Backup contributor impact count is invalid for ${contributor.module}.${key}`
          );
        }
      }
      restored[contributor.module] = impact.counts;
    }
    return restored;
  }

  fingerprintTables(): string[] {
    return [...new Set(this.contributors.flatMap((contributor) => contributor.fingerprintTables))]
      .map((table) => table.trim())
      .filter(Boolean)
      .sort();
  }
}
