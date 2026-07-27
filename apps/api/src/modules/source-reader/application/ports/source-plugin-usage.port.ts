export type SourcePluginUsageOperation = 'disable' | 'remove';

export interface SourcePluginUsageRecord {
  jobId: string;
  novelId: string;
  status: string;
  sourceUrls: readonly string[];
  unresolved?: boolean;
}

export interface SourcePluginUsageQueryPort {
  listPotentialUsages(
    operation: SourcePluginUsageOperation
  ): Promise<readonly SourcePluginUsageRecord[]>;
}
