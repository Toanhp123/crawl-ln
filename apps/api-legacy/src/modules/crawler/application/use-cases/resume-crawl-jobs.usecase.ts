import type { CrawlTask } from '../models/crawler-contracts.js';
import type { CrawlerTaskPort } from '../ports/crawler-task.port.js';
import type { CrawlQueuePort } from '../ports/crawl-queue.port.js';
export class ResumeCrawlJobsUseCase {
  constructor(
    private readonly tasks: CrawlerTaskPort,
    private readonly queue: CrawlQueuePort
  ) {}
  async execute(limit = 20): Promise<CrawlTask[]> {
    const candidates = (await this.tasks.findRecoverable(limit)).filter(
      (task) => task.status === 'paused'
    );
    const resumed: CrawlTask[] = [];
    for (const task of candidates) {
      if (this.queue.isRunning(task.novelId)) continue;
      await this.queue.resume(task.id);
      resumed.push((await this.tasks.findById(task.id))!);
    }
    return resumed;
  }
}
