import type { CrawlEvent } from '../../domain/events/crawl-event.entity.js';

export interface CrawlAuditPublisherPort {
  publish(record: CrawlEvent): Promise<void>;
}
