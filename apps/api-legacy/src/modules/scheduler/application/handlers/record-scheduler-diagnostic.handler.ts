import type { SchedulerDiagnosticsRepository } from '../ports/scheduler-diagnostics.repository.js';
import type { NovelUpdateDiagnosticEvent } from '../events/scheduler-diagnostic.event.js';

export class RecordSchedulerDiagnosticHandler {
  constructor(private readonly repository: SchedulerDiagnosticsRepository) {}

  async handle(event: NovelUpdateDiagnosticEvent): Promise<void> {
    await this.repository.add(event.diagnostic);
    await this.repository.pruneByNovel(event.diagnostic.novelId, event.retentionLimit);
  }
}
