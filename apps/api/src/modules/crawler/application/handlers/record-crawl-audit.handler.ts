import type { CrawlEventRepository } from '../../domain/repositories/crawl-event.repository.js';
import type { CrawlAuditEvent } from '../events/crawl-audit.event.js';

export class RecordCrawlAuditHandler {
  constructor(private readonly repository: CrawlEventRepository) {}

  handle(event: CrawlAuditEvent): Promise<void> {
    return this.repository.create(event.record);
  }
}
