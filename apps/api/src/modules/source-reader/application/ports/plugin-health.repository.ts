import type { SourceCapability } from '../../public/source-reader.models.js';

export interface PluginHealthRepository {
  record(input: {
    id: string;
    pluginId: string;
    pluginVersion: string;
    capability?: SourceCapability;
    status: 'healthy' | 'failed';
    durationMs: number;
    failureCode?: string;
    checkedAt: string;
  }): Promise<void>;
  recentFailures(input: {
    pluginId: string;
    pluginVersion: string;
    capability: SourceCapability;
    since: string;
  }): Promise<number>;
  recentFailuresByCode(input: {
    pluginId: string;
    pluginVersion: string;
    failureCode: string;
    since: string;
  }): Promise<number>;
}
