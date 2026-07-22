import type { ApplicationEventBusPort } from '../../../../shared/events/application-event-bus.port.js';
import {
  SCHEDULER_DIAGNOSTIC_EVENT,
  type NovelUpdateDiagnosticEvent
} from '../../application/events/scheduler-diagnostic.event.js';
import type { NovelUpdateDiagnostic } from '../../application/models/scheduler-contracts.js';
import type { NovelUpdateDiagnosticPublisherPort } from '../../application/ports/scheduler-diagnostic-publisher.port.js';

export class ApplicationEventNovelUpdateDiagnosticPublisher implements NovelUpdateDiagnosticPublisherPort {
  constructor(private readonly events: ApplicationEventBusPort) {}

  publish(diagnostic: NovelUpdateDiagnostic, retentionLimit: number): Promise<void> {
    const event: NovelUpdateDiagnosticEvent = {
      name: SCHEDULER_DIAGNOSTIC_EVENT,
      diagnostic,
      retentionLimit
    };
    return this.events.publish(event);
  }
}
