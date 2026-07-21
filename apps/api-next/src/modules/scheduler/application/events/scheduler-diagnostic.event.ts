import type { SchedulerDiagnostic } from '../../domain/scheduler.models.js';

export const SCHEDULER_DIAGNOSTIC_RECORDED = 'scheduler.diagnostic.recorded' as const;

export interface SchedulerDiagnosticRecordedPayload {
  diagnostic: SchedulerDiagnostic;
  retentionLimit: number;
}
