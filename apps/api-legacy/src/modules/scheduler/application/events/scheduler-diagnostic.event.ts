import type { NovelUpdateDiagnostic } from '../models/scheduler-contracts.js';

export const SCHEDULER_DIAGNOSTIC_EVENT = 'scheduler.diagnostic.recorded' as const;

export type NovelUpdateDiagnosticEvent = {
  readonly name: typeof SCHEDULER_DIAGNOSTIC_EVENT;
  readonly diagnostic: NovelUpdateDiagnostic;
  readonly retentionLimit: number;
};
