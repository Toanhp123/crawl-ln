import type { CrawlerTaskPort } from '../ports/crawler-task.port.js';
import { CrawlerConflictError, CrawlerNotFoundError } from '../errors/crawler.error.js';
import type { ClockPort } from '../../../../shared/ports/clock.port.js';
import type { LoggerPort } from '../../../../shared/ports/logger.port.js';
import type { CrawlQueuePort } from '../ports/crawl-queue.port.js';
import { CrawlJobRunnerService } from './crawl-job-runner.service.js';

export { chooseFetchedChapterTitle } from './crawl-job-runner.service.js';

export class CrawlQueueService implements CrawlQueuePort {
  private readonly runningNovelIds = new Set<string>();
  private readonly enqueuedTaskIds = new Set<string>();
  private readonly runningTaskIds = new Set<string>();
  private readonly cancelledTaskIds = new Set<string>();
  private readonly pauseRequestedTaskIds = new Set<string>();
  private readonly controllers = new Map<string, AbortController>();
  private readonly activeProcesses = new Set<Promise<void>>();
  private readonly processByTaskId = new Map<string, Promise<void>>();
  private stopping = false;
  private maintenance = false;

  constructor(
    private readonly tasks: CrawlerTaskPort,
    private readonly runner: CrawlJobRunnerService,
    private readonly clock: ClockPort,
    private readonly logger: LoggerPort
  ) {}

  isRunning(novelId: string): boolean {
    return this.runningNovelIds.has(novelId);
  }

  enqueue(taskId: string): void {
    if (this.stopping) throw new CrawlerConflictError('Crawler queue is shutting down');
    if (this.maintenance) throw new CrawlerConflictError('Crawler queue is in maintenance mode');
    if (this.enqueuedTaskIds.has(taskId) || this.runningTaskIds.has(taskId)) return;
    this.enqueuedTaskIds.add(taskId);
    this.cancelledTaskIds.delete(taskId);
    this.pauseRequestedTaskIds.delete(taskId);
    this.controllers.set(taskId, new AbortController());
    const process = this.process(taskId).catch((error) =>
      this.handleBackgroundFailure(taskId, error)
    );
    this.activeProcesses.add(process);
    this.processByTaskId.set(taskId, process);
    void process.finally(() => {
      this.activeProcesses.delete(process);
      this.processByTaskId.delete(taskId);
    });
  }

  async cancel(taskId: string): Promise<void> {
    this.cancelledTaskIds.add(taskId);
    this.pauseRequestedTaskIds.delete(taskId);
    this.controllers.get(taskId)?.abort();
    const activeProcess = this.processByTaskId.get(taskId);
    if (activeProcess) await activeProcess;
    const task = await this.requireTask(taskId);
    if (task.status === 'cancelled') return;
    await this.tasks.update(this.tasks.cancel(task, this.now()));
  }

  isCancelled(taskId: string): boolean {
    return this.cancelledTaskIds.has(taskId);
  }

  async pause(taskId: string): Promise<void> {
    const task = await this.requireTask(taskId);
    if (!['running', 'resuming', 'queued'].includes(task.status))
      throw new CrawlerConflictError(`Cannot pause a ${task.status} crawl job`);

    // Persist the transitional state before waking the runner. Otherwise the runner can
    // finish the pause and then be overwritten by this method's stale `running` snapshot.
    await this.tasks.update(this.tasks.markPausing(task, this.now()));
    this.pauseRequestedTaskIds.add(taskId);
    this.controllers.get(taskId)?.abort();

    const activeProcess = this.processByTaskId.get(taskId);
    if (activeProcess) await activeProcess;

    const latest = await this.requireTask(taskId);
    if (latest.status === 'pausing') {
      await this.tasks.update(this.tasks.markPaused(latest, this.now()));
    }
  }

  async resume(taskId: string): Promise<void> {
    const task = await this.requireTask(taskId);
    if (task.status !== 'paused')
      throw new CrawlerConflictError(`Cannot resume a ${task.status} crawl job`);
    if (this.isRunning(task.novelId)) throw new CrawlerConflictError('Novel is already crawling');
    await this.tasks.update(this.tasks.markResuming(task, this.now()));
    this.enqueue(taskId);
  }

  beginMaintenance(): void {
    if (
      this.activeProcesses.size > 0 ||
      this.enqueuedTaskIds.size > 0 ||
      this.runningTaskIds.size > 0
    ) {
      throw new CrawlerConflictError(
        'Wait for active crawl tasks to finish before restoring a backup'
      );
    }
    this.maintenance = true;
  }

  endMaintenance(): void {
    this.maintenance = false;
  }

  async stop(): Promise<void> {
    if (this.stopping) {
      await Promise.allSettled([...this.activeProcesses]);
      return;
    }
    this.stopping = true;
    for (const taskId of [...this.enqueuedTaskIds, ...this.runningTaskIds]) {
      this.pauseRequestedTaskIds.add(taskId);
      this.controllers.get(taskId)?.abort();
    }
    await Promise.allSettled([...this.activeProcesses]);
  }

  private async process(taskId: string): Promise<void> {
    const task = await this.tasks.findById(taskId);
    if (!task) {
      this.enqueuedTaskIds.delete(taskId);
      return;
    }
    if (this.runningNovelIds.has(task.novelId)) {
      this.enqueuedTaskIds.delete(taskId);
      throw new CrawlerConflictError('Novel is already crawling');
    }
    this.enqueuedTaskIds.delete(taskId);
    this.runningTaskIds.add(taskId);
    this.runningNovelIds.add(task.novelId);

    try {
      await this.runner.run(taskId, {
        isCancelled: (id) => this.cancelledTaskIds.has(id),
        isPauseRequested: (id) => this.pauseRequestedTaskIds.has(id),
        signal: (id) => this.controllers.get(id)?.signal
      });
    } finally {
      this.runningTaskIds.delete(taskId);
      this.runningNovelIds.delete(task.novelId);
      this.cancelledTaskIds.delete(taskId);
      this.pauseRequestedTaskIds.delete(taskId);
      this.controllers.delete(taskId);
    }
  }

  private async handleBackgroundFailure(taskId: string, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : 'Unknown crawler error';
    this.logger.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
    try {
      await this.runner.markFailed(taskId, message);
    } catch (markError) {
      this.logger.error(
        markError instanceof Error ? (markError.stack ?? markError.message) : String(markError)
      );
    }
  }

  private async requireTask(id: string) {
    const task = await this.tasks.findById(id);
    if (!task) throw new CrawlerNotFoundError('Crawl job not found');
    return task;
  }

  private now(): string {
    return this.clock.now().toISOString();
  }
}
