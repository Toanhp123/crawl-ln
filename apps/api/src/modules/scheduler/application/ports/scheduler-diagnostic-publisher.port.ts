import type { NovelUpdateDiagnostic } from '../models/scheduler-contracts.js';

export interface NovelUpdateDiagnosticPublisherPort {
  publish(diagnostic: NovelUpdateDiagnostic, retentionLimit: number): Promise<void>;
}
