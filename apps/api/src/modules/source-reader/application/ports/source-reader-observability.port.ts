import type { SourceReaderErrorCode } from '../../domain/errors/source-reader.error.js';
import type { SourceCapability } from '../../public/source-reader.models.js';

export type SourceReaderRuntimeMode = 'in-process' | 'isolated';

export interface SourceReaderObservabilityPort {
  invocationStarted(input: {
    requestId: string;
    invocationId: string;
    pluginId: string;
    capability: SourceCapability;
    domain: string;
    runtimeMode: SourceReaderRuntimeMode;
  }): void;
  invocationFinished(input: {
    requestId: string;
    invocationId: string;
    pluginId: string;
    capability: SourceCapability;
    runtimeMode: SourceReaderRuntimeMode;
    result: 'success' | 'failed' | 'skipped';
    durationMs: number;
    failureCode?: SourceReaderErrorCode | string;
  }): void;
  cacheHit(input: { pluginId: string; capability: SourceCapability; stale: boolean }): void;
  fallback(input: { pluginId: string; capability: SourceCapability; failureCode: string }): void;
}
