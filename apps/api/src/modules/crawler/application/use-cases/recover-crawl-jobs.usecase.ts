import type { CrawlTask } from '../models/crawler-contracts.js';
import type { CrawlerTaskPort } from '../ports/crawler-task.port.js';
import type { CrawlAuditPublisherPort } from '../ports/crawl-audit-publisher.port.js';
import type { ClockPort } from '../../../../shared/ports/clock.port.js';
import type { IdGeneratorPort } from '../../../../shared/ports/id-generator.port.js';
import { createCrawlEvent } from '../../domain/events/crawl-event.entity.js';

export class RecoverCrawlJobsUseCase {
  constructor(
    private readonly tasks: CrawlerTaskPort,
    private readonly auditEvents: CrawlAuditPublisherPort,
    private readonly clock: ClockPort,
    private readonly ids: IdGeneratorPort
  ) {}

  async execute(limit = 200): Promise<CrawlTask[]> {
    const recovered: CrawlTask[] = [];
    const batchSize = Math.max(1, limit);

    while (true) {
      const candidates = await this.tasks.findInterrupted(batchSize);
      if (!candidates.length) break;

      for (const task of candidates) {
        const now = this.clock.now().toISOString();
        const paused = this.tasks.markPaused(task, now);
        await this.tasks.update(paused);
        try {
          await this.auditEvents.publish(
            createCrawlEvent({
              id: this.ids.randomId(),
              taskId: task.id,
              type: 'recovered_paused',
              level: 'warning',
              message: 'Server restarted; task moved to paused',
              createdAt: now
            })
          );
        } catch {
          // Recovery must not leave a task active merely because audit persistence failed.
        }
        recovered.push(paused);
      }
    }

    return recovered;
  }
}
