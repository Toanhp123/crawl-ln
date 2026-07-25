export class BackupIdentityRegistry {
  private readonly identities = new Map<string, Map<string, string>>();

  record(scope: string, sourceId: string, targetId: string): void {
    const scoped = this.identities.get(scope) ?? new Map<string, string>();
    scoped.set(sourceId, targetId);
    this.identities.set(scope, scoped);
  }

  resolve(scope: string, sourceId: string): string | undefined {
    return this.identities.get(scope)?.get(sourceId);
  }
}

export interface BackupImportContext {
  importId: string;
  identities?: BackupIdentityRegistry;
}

export interface BackupContributorImpact {
  module: string;
  counts: Record<string, number>;
  details?: Record<string, number | string | boolean | null>;
}

export interface BackupContributor {
  readonly module: string;
  readonly fingerprintTables: readonly string[];
  exportMergeData(): Promise<unknown>;
  importMergeData(data: unknown, context: BackupImportContext): Promise<BackupContributorImpact>;
}
