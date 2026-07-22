import type { CrawlTask } from '../models/crawler-contracts.js';
import type { CrawlerTaskPort } from '../ports/crawler-task.port.js';
import type { CrawlerNovelPort } from '../ports/crawler-novel.port.js';
import type { ClockPort } from '../../../../shared/ports/clock.port.js';
import type { IdGeneratorPort } from '../../../../shared/ports/id-generator.port.js';
import type { CrawlQueuePort } from '../ports/crawl-queue.port.js';
import type { CrawlerConfigPort } from '../ports/crawler-config.port.js';
import type { CrawlAuditPublisherPort } from '../ports/crawl-audit-publisher.port.js';
import { createCrawlEvent } from '../../domain/events/crawl-event.entity.js';
import { CrawlerConflictError, CrawlerNotFoundError } from '../errors/crawler.error.js';

export class CreateCrawlJobUseCase {
  constructor(
    private readonly novels: CrawlerNovelPort,
    private readonly tasks: CrawlerTaskPort,
    private readonly auditEvents: CrawlAuditPublisherPort,
    private readonly queue: CrawlQueuePort,
    private readonly ids: IdGeneratorPort,
    private readonly clock: ClockPort,
    private readonly config: CrawlerConfigPort
  ) {}

  async execute(novelId: string): Promise<CrawlTask> {
    const result = await this.novels.findById(novelId);
    if (!result) throw new CrawlerNotFoundError('Novel not found');
    if (this.queue.isRunning(novelId) || (await this.tasks.hasActiveForNovel(novelId))) {
      throw new CrawlerConflictError('Novel already has an active crawl task');
    }

    const now = this.clock.now().toISOString();
    const pending = result.chapters.filter((chapter) => chapter.status !== 'fetched');
    if (!pending.length) throw new CrawlerConflictError('No pending chapters to crawl');

    const task = this.tasks.createQueued({
      id: this.ids.randomId(),
      novelId,
      totalChapters: pending.length,
      now
    });

    await this.tasks.create(
      task,
      pending.map((chapter) => chapter.id)
    );

    try {
      this.queue.enqueue(task.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to enqueue crawl task';
      await this.tasks.update(this.tasks.fail(task, message, this.clock.now().toISOString()));
      throw error;
    }

    try {
      await this.auditEvents.publish(
        createCrawlEvent({
          id: this.ids.randomId(),
          taskId: task.id,
          type: 'task_created',
          level: 'info',
          message: 'Task created and added to queue',
          createdAt: now
        })
      );
    } catch {
      // Audit persistence is best effort and must not invalidate a queued task.
    }
    return task;
  }
}
