import type { CrawlTask } from '../models/crawler-contracts.js';
import type { CrawlerTaskPort } from '../ports/crawler-task.port.js';
import type { CrawlQueuePort } from '../ports/crawl-queue.port.js';
import { CrawlerConflictError, CrawlerNotFoundError } from '../errors/crawler.error.js';

export class CancelCrawlJobUseCase {
  constructor(
    private readonly tasks: CrawlerTaskPort,
    private readonly queue: CrawlQueuePort
  ) {}

  async execute(taskId: string): Promise<CrawlTask> {
    const task = await this.tasks.findById(taskId);
    if (!task) throw new CrawlerNotFoundError('Crawl job not found');
    if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
      throw new CrawlerConflictError(`Cannot cancel a ${task.status} crawl job`);
    }

    await this.queue.cancel(taskId);
    const cancelled = await this.tasks.findById(taskId);
    if (!cancelled) throw new CrawlerNotFoundError('Crawl job not found');
    return cancelled;
  }
}
