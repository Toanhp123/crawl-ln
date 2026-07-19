import type { CrawlTask } from '../models/crawler-contracts.js';
import type { CrawlerTaskPort } from '../ports/crawler-task.port.js';
import type { CrawlQueuePort } from '../ports/crawl-queue.port.js';
import { CrawlerNotFoundError } from '../errors/crawler.error.js';
export class ResumeCrawlJobUseCase {
  constructor(
    private readonly tasks: CrawlerTaskPort,
    private readonly queue: CrawlQueuePort
  ) {}
  async execute(id: string): Promise<CrawlTask> {
    if (!(await this.tasks.findById(id))) throw new CrawlerNotFoundError('Crawl job not found');
    await this.queue.resume(id);
    return (await this.tasks.findById(id))!;
  }
}
