import type { CrawlEvent } from '../../domain/events/crawl-event.entity.js';

export const CRAWL_AUDIT_EVENT = 'crawler.audit.recorded' as const;

export type CrawlAuditEvent = {
  readonly name: typeof CRAWL_AUDIT_EVENT;
  readonly record: CrawlEvent;
};
