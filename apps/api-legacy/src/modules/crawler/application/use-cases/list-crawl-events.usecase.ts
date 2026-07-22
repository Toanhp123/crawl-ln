import type { CrawlEventRepository } from '../../domain/repositories/crawl-event.repository.js';
import type { CrawlerTaskPort } from '../ports/crawler-task.port.js';
import { CrawlerNotFoundError } from '../errors/crawler.error.js';
export class ListCrawlEventsUseCase {
  constructor(
    private readonly tasks: CrawlerTaskPort,
    private readonly events: CrawlEventRepository
  ) {}
  async execute(id: string, limit = 100) {
    if (!(await this.tasks.findById(id))) throw new CrawlerNotFoundError('Crawl job not found');
    return this.events.findByTaskId(id, limit);
  }
}
