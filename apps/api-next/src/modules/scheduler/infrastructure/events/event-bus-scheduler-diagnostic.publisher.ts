import type { EventBus } from '../../../../platform/events/event-bus.js';
import {
  SCHEDULER_DIAGNOSTIC_RECORDED,
  type SchedulerDiagnosticRecordedPayload
} from '../../application/events/scheduler-diagnostic.event.js';
import type { SchedulerDiagnosticPublisher } from '../../application/ports/scheduler-diagnostic.publisher.js';
import type { SchedulerDiagnostic } from '../../domain/scheduler.models.js';

export class EventBusSchedulerDiagnosticPublisher implements SchedulerDiagnosticPublisher {
  constructor(
    private readonly events: EventBus,
    private readonly clock: { now(): Date },
    private readonly ids: { randomId(): string }
  ) {}

  publish(diagnostic: SchedulerDiagnostic, retentionLimit: number): Promise<void> {
    return this.events.publish({
      id: this.ids.randomId(),
      type: SCHEDULER_DIAGNOSTIC_RECORDED,
      occurredAt: this.clock.now().toISOString(),
      payload: { diagnostic, retentionLimit } satisfies SchedulerDiagnosticRecordedPayload
    });
  }
}
