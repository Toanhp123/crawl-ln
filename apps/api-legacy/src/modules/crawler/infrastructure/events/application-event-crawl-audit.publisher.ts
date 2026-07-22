import type { ApplicationEventBusPort } from '../../../../shared/events/application-event-bus.port.js';
import {
  CRAWL_AUDIT_EVENT,
  type CrawlAuditEvent
} from '../../application/events/crawl-audit.event.js';
import type { CrawlAuditPublisherPort } from '../../application/ports/crawl-audit-publisher.port.js';
import type { CrawlEvent } from '../../domain/events/crawl-event.entity.js';

export class ApplicationEventCrawlAuditPublisher implements CrawlAuditPublisherPort {
  constructor(private readonly events: ApplicationEventBusPort) {}

  publish(record: CrawlEvent): Promise<void> {
    const event: CrawlAuditEvent = { name: CRAWL_AUDIT_EVENT, record };
    return this.events.publish(event);
  }
}
