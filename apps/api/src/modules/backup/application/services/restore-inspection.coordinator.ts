import type { LoggerPort } from '../../../../platform/events/outbox-dispatcher.js';
import type { RestoreInspectionService } from './restore-inspection.service.js';

export class RestoreInspectionCoordinator {
  private readonly pending = new Map<string, Promise<void>>();

  constructor(
    private readonly inspection: RestoreInspectionService,
    private readonly logger: LoggerPort
  ) {}

  schedule(sessionId: string): void {
    if (this.pending.has(sessionId)) return;
    queueMicrotask(() => {
      if (this.pending.has(sessionId)) return;
      const work = this.inspection
        .complete(sessionId)
        .then(() => undefined)
        .catch((error) => {
          this.logger.error('backup.restore-inspection.failed', {
            sessionId,
            errorClass: error instanceof Error ? error.name : typeof error
          });
        })
        .finally(() => {
          if (this.pending.get(sessionId) === work) this.pending.delete(sessionId);
        });
      this.pending.set(sessionId, work);
    });
  }

  async wait(sessionId: string): Promise<void> {
    await this.pending.get(sessionId);
  }
}
