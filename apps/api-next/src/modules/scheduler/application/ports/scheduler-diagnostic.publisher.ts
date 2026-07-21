import type { SchedulerDiagnostic } from '../../domain/scheduler.models.js';

export interface SchedulerDiagnosticPublisher {
  publish(diagnostic: SchedulerDiagnostic, retentionLimit: number): Promise<void>;
}
