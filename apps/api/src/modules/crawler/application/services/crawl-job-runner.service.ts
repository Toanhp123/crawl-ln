import type { Chapter } from '../models/crawler-contracts.js';
import type { CrawlerNovelPort } from '../ports/crawler-novel.port.js';
import type { CrawlerTaskPort } from '../ports/crawler-task.port.js';
import { CrawlerNotFoundError } from '../errors/crawler.error.js';
import type { ClockPort } from '../../../../shared/ports/clock.port.js';
import type { IdGeneratorPort } from '../../../../shared/ports/id-generator.port.js';
import { FetchChapterUseCase } from '../use-cases/fetch-chapter.usecase.js';
import type { CrawlerConfigPort } from '../ports/crawler-config.port.js';
import type { CrawlAuditPublisherPort } from '../ports/crawl-audit-publisher.port.js';
import { createCrawlEvent } from '../../domain/events/crawl-event.entity.js';
import { CrawlProgressService } from './crawl-progress.service.js';
import type { CrawlPersistencePort } from '../ports/crawl-persistence.port.js';

export type CrawlRunControl = {
  isCancelled(taskId: string): boolean;
  isPauseRequested(taskId: string): boolean;
  signal(taskId: string): AbortSignal | undefined;
};

type FetchOutcome = { succeeded: boolean; failedBeforeRun: boolean; chapter: Chapter };

export function computeRetryDelayMs(
  attempt: number,
  baseDelayMs = 1000,
  maxDelayMs = 15000,
  random = Math.random
): number {
  const exponential = Math.min(maxDelayMs, baseDelayMs * 2 ** Math.max(0, attempt - 1));
  const jitter = Math.floor(exponential * 0.2 * random());
  return exponential + jitter;
}

export function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  if (signal?.aborted) return Promise.reject(createAbortError());
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(createAbortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function createAbortError(): Error {
  const error = new Error('Operation aborted');
  error.name = 'AbortError';
  return error;
}

export function chooseFetchedChapterTitle(existingTitle: string, fetchedTitle: string): string {
  const existing = existingTitle.trim();
  const fetched = fetchedTitle.trim();
  const generic = /^(chapter|chap|chương)(?:\s+\d+)?$/i;
  if (!fetched || generic.test(fetched)) return existing || fetched;
  if (!existing || generic.test(existing)) return fetched;
  return fetched.length > existing.length ? fetched : existing;
}

export class CrawlJobRunnerService {
  constructor(
    private readonly novels: CrawlerNovelPort,
    private readonly tasks: CrawlerTaskPort,
    private readonly auditEvents: CrawlAuditPublisherPort,
    private readonly fetchChapter: FetchChapterUseCase,
    private readonly config: CrawlerConfigPort,
    private readonly clock: ClockPort,
    private readonly ids: IdGeneratorPort,
    private readonly progress: CrawlProgressService,
    private readonly persistence: CrawlPersistencePort
  ) {}

  async run(taskId: string, control: CrawlRunControl): Promise<string | undefined> {
    const task = await this.tasks.findById(taskId);
    if (!task) return undefined;
    this.progress.start(taskId);

    try {
      if (control.isCancelled(taskId)) {
        await this.tasks.update(this.tasks.cancel(task, this.now()));
        await this.safeEvent(taskId, 'cancelled', 'warning', 'Crawl cancelled');
        return task.novelId;
      }
      if (control.isPauseRequested(taskId)) {
        await this.tasks.update(this.tasks.markPaused(task, this.now()));
        await this.safeEvent(taskId, 'paused', 'warning', 'Crawl paused before starting');
        return task.novelId;
      }

      const result = await this.novels.findById(task.novelId);
      if (!result) throw new CrawlerNotFoundError('Novel not found');

      let mutable = this.tasks.markRunning(task, this.now());
      const runningNovel = this.novels.markCrawling(result.novel, this.now());
      await this.persistence.persistStart(mutable, runningNovel);
      const resumed = task.status === 'resuming';
      await this.safeEvent(
        taskId,
        resumed ? 'resumed' : 'started',
        'info',
        resumed ? 'Crawl resumed' : 'Crawl started'
      );

      const queue = await this.createQueue(taskId, result.chapters);
      const snapshot = mutable;
      const pendingCount = queue.filter((chapter) => chapter.status !== 'failed').length;
      mutable = this.tasks.withTotal(
        mutable,
        Math.max(
          snapshot.totalChapters,
          snapshot.fetchedChapters + snapshot.failedChapters + pendingCount
        ),
        this.now()
      );
      await this.tasks.update(mutable);

      let cursor = 0;
      let mutationChain = Promise.resolve();
      const serializeMutation = <T>(operation: () => Promise<T>): Promise<T> => {
        const next = mutationChain.then(operation, operation);
        mutationChain = next.then(
          () => undefined,
          () => undefined
        );
        return next;
      };

      const worker = async () => {
        while (
          cursor < queue.length &&
          !control.isCancelled(taskId) &&
          !control.isPauseRequested(taskId)
        ) {
          const chapter = queue[cursor++];
          if (!chapter) continue;
          await this.safeEvent(
            taskId,
            'chapter_started',
            'info',
            `Chapter ${chapter.index} started`,
            undefined,
            chapter
          );
          const outcome = await this.fetchWithRetry(taskId, chapter, control);
          if (!outcome) break;
          await serializeMutation(async () => {
            const completedAt = this.clock.now();
            const metrics = this.progress.record(
              taskId,
              mutable,
              completedAt.getTime(),
              outcome.succeeded,
              outcome.failedBeforeRun
            );
            const nextTask = this.tasks.recordChapterResult(
              mutable,
              outcome.succeeded,
              outcome.failedBeforeRun,
              metrics,
              completedAt.toISOString()
            );
            await this.persistence.persistChapterResult(outcome.chapter, nextTask);
            mutable = nextTask;
          });
          await this.safeEvent(
            taskId,
            outcome.succeeded ? 'chapter_succeeded' : 'chapter_failed',
            outcome.succeeded ? 'success' : 'error',
            outcome.succeeded
              ? `Chapter ${chapter.index} saved`
              : `Chapter ${chapter.index} failed`,
            undefined,
            chapter
          );
        }
      };

      const workerCount = Math.min(this.config.concurrency, Math.max(queue.length, 1));
      await Promise.all(Array.from({ length: workerCount }, () => worker()));

      if (control.isCancelled(taskId)) {
        mutable = this.tasks.cancel(mutable, this.now());
        await this.safeEvent(taskId, 'cancelled', 'warning', 'Crawl cancelled');
      } else if (control.isPauseRequested(taskId)) {
        mutable = this.tasks.markPaused(mutable, this.now());
        await this.safeEvent(taskId, 'paused', 'warning', 'Crawl paused before the next chapter');
      } else {
        mutable = this.tasks.complete(mutable, this.now());
        const failed = mutable.status === 'failed';
        await this.safeEvent(
          taskId,
          failed ? 'failed' : 'completed',
          failed ? 'error' : 'success',
          failed ? 'Crawl failed' : 'Crawl completed'
        );
      }

      const finalTask = mutable;
      const originalNovel = result.novel;
      const finalNovel =
        finalTask.status === 'failed'
          ? this.novels.markFailed(originalNovel, this.now())
          : finalTask.status === 'completed'
            ? this.novels.markCompleted(originalNovel, this.now())
            : { ...originalNovel, updatedAt: this.now() };
      await this.persistence.persistFinal(finalTask, finalNovel);
      return task.novelId;
    } finally {
      this.progress.finish(taskId);
    }
  }

  async markFailed(taskId: string, message: string): Promise<void> {
    const current = await this.tasks.findById(taskId);
    if (!current || ['completed', 'failed', 'cancelled'].includes(current.status)) return;
    const now = this.now();
    await this.tasks.update(this.tasks.fail(current, message, now));
    await this.safeEvent(taskId, 'failed', 'error', message, now);
  }

  private async createQueue(taskId: string, chapters: Chapter[]): Promise<Chapter[]> {
    const plannedIds = await this.tasks.findChapterIds(taskId);
    const plannedSet = new Set(plannedIds);
    return (
      plannedIds.length
        ? chapters.filter((chapter) => plannedSet.has(chapter.id))
        : chapters.filter((chapter) => chapter.status !== 'fetched')
    ).filter((chapter) => chapter.status !== 'fetched');
  }

  private async fetchWithRetry(
    taskId: string,
    chapter: Chapter,
    control: CrawlRunControl
  ): Promise<FetchOutcome | null> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.config.retry; attempt += 1) {
      if (control.isCancelled(taskId) || control.isPauseRequested(taskId)) return null;
      try {
        if (attempt > 0) {
          await this.safeEvent(
            taskId,
            'chapter_retry',
            'warning',
            `Retry ${attempt} for chapter ${chapter.index}`,
            undefined,
            chapter,
            attempt
          );
          await abortableSleep(
            computeRetryDelayMs(attempt, this.config.retryBaseDelayMs, this.config.retryMaxDelayMs),
            control.signal(taskId)
          );
        }
        const content = await this.fetchChapter.execute(chapter.sourceUrl, control.signal(taskId));
        return {
          succeeded: true,
          failedBeforeRun: chapter.status === 'failed',
          chapter: {
            ...chapter,
            title: chooseFetchedChapterTitle(chapter.title, content.title),
            rawText: content.rawText,
            cleanText: content.cleanText,
            status: 'fetched',
            errorMessage: undefined
          }
        };
      } catch (error) {
        if (control.isCancelled(taskId) || control.isPauseRequested(taskId) || isAbortError(error))
          return null;
        lastError = error;
      }
    }
    return {
      succeeded: false,
      failedBeforeRun: chapter.status === 'failed',
      chapter: {
        ...chapter,
        status: 'failed',
        errorMessage: lastError instanceof Error ? lastError.message : 'Unknown error'
      }
    };
  }

  private async safeEvent(
    taskId: string,
    type: Parameters<typeof createCrawlEvent>[0]['type'],
    level: Parameters<typeof createCrawlEvent>[0]['level'],
    message: string,
    createdAt = this.now(),
    chapter?: Chapter,
    attempt?: number
  ): Promise<void> {
    try {
      await this.auditEvents.publish(
        createCrawlEvent({
          id: this.ids.randomId(),
          taskId,
          type,
          level,
          message,
          createdAt,
          chapterId: chapter?.id,
          chapterIndex: chapter?.index,
          chapterTitle: chapter?.title,
          attempt
        })
      );
    } catch {
      // Crawl state is authoritative; observability failures must not change task outcome.
    }
  }

  private now(): string {
    return this.clock.now().toISOString();
  }
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'AbortError' ||
      error.name === 'CanceledError' ||
      error.message.toLowerCase().includes('canceled'))
  );
}
