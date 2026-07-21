import type { SchedulerDiagnosticRecordedPayload } from '../events/scheduler-diagnostic.event.js';
import type { SchedulerRepository } from '../ports/scheduler.repository.js';

export class RecordSchedulerDiagnosticHandler {
  constructor(private readonly repository: SchedulerRepository) {}

  async handle(payload: SchedulerDiagnosticRecordedPayload): Promise<void> {
    await this.repository.addDiagnostic(payload.diagnostic);
    await this.repository.pruneDiagnostics(payload.diagnostic.novelId, payload.retentionLimit);
  }
}
