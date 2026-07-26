import type { LibraryApi, LibraryChapter } from '../../../library/public/library.api.js';
import { IngestionJobEntity } from '../../domain/entities/ingestion-job.entity.js';
import { IngestionError } from '../../domain/errors/ingestion.error.js';
import type {
  IngestionEvent,
  IngestionJob,
  IngestionJobChapter
} from '../../domain/ingestion.models.js';
import type { IngestionRepository } from '../../domain/repositories/ingestion.repository.js';
import type { IngestionIdGeneratorPort } from '../ports/id-generator.port.js';

export interface IngestionRunControl {
  isCancelled(jobId: string): boolean;
  isPauseRequested(jobId: string): boolean;
  signal(jobId: string): AbortSignal | undefined;
}

interface RunnerOptions {
  repository: Pick<
    IngestionRepository,
    'findById' | 'findJobChapters' | 'saveJobWithEvent' | 'recordChapterResult'
  >;
  library: LibraryApi;
  fetchChapter: {
    execute(
      chapter: { title: string; sourceUrl: string },
      signal?: AbortSignal
    ): Promise<{ title: string; rawText: string; cleanText: string }>;
  };
  clock: { now(): Date };
  ids: IngestionIdGeneratorPort;
  retry?: number;
  sourceFailureThreshold?: number;
  yieldControl?: () => Promise<void>;
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'AbortError' ||
      error.name === 'CanceledError' ||
      error.message.toLowerCase().includes('canceled') ||
      error.message.toLowerCase().includes('aborted'))
  );
}

const sourceWideFailureCodes = new Set([
  'SOURCE_REQUEST_TIMEOUT',
  'SOURCE_RATE_LIMITED',
  'SOURCE_TEMPORARILY_UNAVAILABLE',
  'UPSTREAM_CHALLENGE_DETECTED',
  'NETWORK_ACCESS_BLOCKED',
  'NETWORK_ROUTE_UNAVAILABLE',
  'NETWORK_ROUTE_OFFLINE',
  'NETWORK_REGION_UNAVAILABLE',
  'PLUGIN_UNAVAILABLE'
]);

interface SourceFailureDescriptor {
  key: string;
  code: string;
  source: string;
}

function sourceFailureDescriptor(
  error: unknown,
  sourceUrl: string
): SourceFailureDescriptor | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const candidate = error as { code?: unknown; retryable?: unknown };
  if (typeof candidate.code !== 'string' || !sourceWideFailureCodes.has(candidate.code)) {
    return undefined;
  }
  if (candidate.retryable !== true && candidate.code !== 'NETWORK_ACCESS_BLOCKED') {
    return undefined;
  }
  let source = 'unknown source';
  try {
    source = new URL(sourceUrl).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    // Chapter URLs were validated during analysis; keep a safe fallback for corrupted records.
  }
  return { key: source, code: candidate.code, source };
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

export class IngestionJobRunnerService {
  private readonly retry: number;
  private readonly sourceFailureThreshold: number;
  private readonly yieldControl: () => Promise<void>;

  constructor(private readonly options: RunnerOptions) {
    this.retry = options.retry ?? 0;
    this.sourceFailureThreshold = Math.max(1, Math.floor(options.sourceFailureThreshold ?? 5));
    this.yieldControl = options.yieldControl ?? yieldToEventLoop;
  }

  async run(jobId: string, control: IngestionRunControl): Promise<string | undefined> {
    const current = await this.options.repository.findById(jobId);
    if (!current) return undefined;
    if (control.isCancelled(jobId)) {
      await this.persistTerminalControl(current, 'cancelled');
      return current.novelId;
    }
    if (control.isPauseRequested(jobId)) {
      await this.persistTerminalControl(current, 'paused');
      return current.novelId;
    }

    const detail = await this.options.library.queries.getNovel(current.novelId);
    if (!detail) throw new IngestionError('INGESTION_NOT_FOUND', 'Library novel was not found');
    let mutable = IngestionJobEntity.fromPrimitives(current).markRunning(this.now()).toPrimitives();
    await this.options.repository.saveJobWithEvent(
      mutable,
      this.event(
        mutable.id,
        current.status === 'resuming' ? 'resumed' : 'started',
        'info',
        current.status === 'resuming' ? 'Ingestion resumed' : 'Ingestion started'
      )
    );
    await this.options.library.commands.setIngestionState({
      commandId: `state:${jobId}:crawling`,
      novelId: mutable.novelId,
      status: 'crawling',
      updatedAt: mutable.updatedAt
    });

    const chaptersById = new Map(detail.chapters.map((chapter) => [chapter.id, chapter]));
    const work = await this.options.repository.findJobChapters(jobId);
    let consecutiveSourceFailureKey: string | undefined;
    let consecutiveSourceFailureCount = 0;
    for (const item of work) {
      if (item.status === 'fetched') continue;
      if (control.isCancelled(jobId) || control.isPauseRequested(jobId)) break;
      const chapter = chaptersById.get(item.chapterId);
      if (!chapter) {
        throw new IngestionError('INGESTION_NOT_FOUND', 'Planned Library chapter was not found', {
          chapterId: item.chapterId
        });
      }
      const outcome = await this.fetchWithRetry(chapter, control, jobId);
      if (!outcome) break;
      const completedAt = this.now();
      const metrics = this.metrics(
        mutable,
        completedAt,
        outcome.succeeded,
        item.status === 'failed'
      );
      const nextJob = IngestionJobEntity.fromPrimitives(mutable)
        .recordChapterResult(outcome.succeeded, item.status === 'failed', metrics, completedAt)
        .toPrimitives();
      const errorMessage = outcome.succeeded ? undefined : outcome.errorMessage;
      const nextWork: IngestionJobChapter = {
        ...item,
        status: outcome.succeeded ? 'fetched' : 'failed',
        attemptCount: item.attemptCount + outcome.attempts,
        errorMessage,
        updatedAt: completedAt
      };
      await this.options.repository.recordChapterResult(
        nextJob,
        nextWork,
        this.event(
          jobId,
          outcome.succeeded ? 'chapter_succeeded' : 'chapter_failed',
          outcome.succeeded ? 'success' : 'error',
          outcome.succeeded ? `Chapter ${chapter.index} saved` : `Chapter ${chapter.index} failed`,
          chapter,
          outcome.attempts
        )
      );
      mutable = nextJob;

      if (outcome.succeeded || outcome.sourceFailure === undefined) {
        consecutiveSourceFailureKey = undefined;
        consecutiveSourceFailureCount = 0;
      } else if (outcome.sourceFailure.key === consecutiveSourceFailureKey) {
        consecutiveSourceFailureCount += 1;
      } else {
        consecutiveSourceFailureKey = outcome.sourceFailure.key;
        consecutiveSourceFailureCount = 1;
      }

      await this.yieldControl();
      if (control.isCancelled(jobId) || control.isPauseRequested(jobId)) break;

      if (
        outcome.succeeded === false &&
        outcome.sourceFailure !== undefined &&
        consecutiveSourceFailureCount >= this.sourceFailureThreshold
      ) {
        const message = `${outcome.sourceFailure.source} stopped after ${consecutiveSourceFailureCount} consecutive source failures (${outcome.sourceFailure.code}): ${outcome.errorMessage}`;
        const failed = await this.persistSourceFailure(mutable, message);
        return failed.novelId;
      }
    }

    if (control.isCancelled(jobId)) {
      await this.persistTerminalControl(mutable, 'cancelled');
      return mutable.novelId;
    }
    if (control.isPauseRequested(jobId)) {
      await this.persistTerminalControl(mutable, 'paused');
      return mutable.novelId;
    }

    const finalJob = IngestionJobEntity.fromPrimitives(mutable).complete(this.now()).toPrimitives();
    const finalStatus = finalJob.status === 'failed' ? 'failed' : 'completed';
    await this.options.library.commands.setIngestionState({
      commandId: `state:${jobId}:${finalStatus}`,
      novelId: finalJob.novelId,
      status: finalStatus,
      updatedAt: finalJob.updatedAt,
      ...(finalStatus === 'failed' ? { errorMessage: 'All chapter fetches failed' } : {})
    });
    await this.options.repository.saveJobWithEvent(
      finalJob,
      this.event(
        jobId,
        finalStatus === 'failed' ? 'failed' : 'completed',
        finalStatus === 'failed' ? 'error' : 'success',
        finalStatus === 'failed' ? 'Ingestion failed' : 'Ingestion completed'
      )
    );
    return finalJob.novelId;
  }

  async markFailed(jobId: string, message: string): Promise<void> {
    const current = await this.options.repository.findById(jobId);
    if (!current || ['completed', 'failed', 'cancelled'].includes(current.status)) return;
    const failed = IngestionJobEntity.fromPrimitives(current)
      .fail(message, this.now())
      .toPrimitives();
    await this.options.repository.saveJobWithEvent(
      failed,
      this.event(jobId, 'failed', 'error', message)
    );
    try {
      await this.options.library.commands.setIngestionState({
        commandId: `state:${jobId}:failed`,
        novelId: failed.novelId,
        status: 'failed',
        updatedAt: failed.updatedAt,
        errorMessage: message
      });
    } catch {
      // The job failure remains authoritative even if Library was not yet in crawling state.
    }
  }

  private async fetchWithRetry(
    chapter: LibraryChapter,
    control: IngestionRunControl,
    jobId: string
  ): Promise<
    | { succeeded: true; attempts: number }
    | {
        succeeded: false;
        attempts: number;
        errorMessage: string;
        sourceFailure?: SourceFailureDescriptor;
      }
    | null
  > {
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.retry + 1; attempt += 1) {
      try {
        const content = await this.options.fetchChapter.execute(
          { title: chapter.title, sourceUrl: chapter.sourceUrl },
          control.signal(jobId)
        );
        await this.options.library.commands.saveChapterContent({
          commandId: `chapter:${jobId}:${chapter.id}`,
          novelId: chapter.novelId,
          chapterId: chapter.id,
          title: content.title,
          rawText: content.rawText,
          cleanText: content.cleanText,
          savedAt: this.now()
        });
        return { succeeded: true, attempts: attempt };
      } catch (error) {
        if (control.isCancelled(jobId) || control.isPauseRequested(jobId) || isAbortError(error)) {
          return null;
        }
        lastError = error;
      }
    }
    const sourceFailure = sourceFailureDescriptor(lastError, chapter.sourceUrl);
    return {
      succeeded: false,
      attempts: this.retry + 1,
      errorMessage: lastError instanceof Error ? lastError.message : 'Unknown chapter fetch error',
      ...(sourceFailure === undefined ? {} : { sourceFailure })
    };
  }

  private async persistSourceFailure(job: IngestionJob, message: string): Promise<IngestionJob> {
    const failed = IngestionJobEntity.fromPrimitives(job).fail(message, this.now()).toPrimitives();
    await this.options.library.commands.setIngestionState({
      commandId: `state:${job.id}:failed`,
      novelId: failed.novelId,
      status: 'failed',
      updatedAt: failed.updatedAt,
      errorMessage: message
    });
    await this.options.repository.saveJobWithEvent(
      failed,
      this.event(job.id, 'failed', 'error', message)
    );
    return failed;
  }

  private async persistTerminalControl(
    job: IngestionJob,
    state: 'paused' | 'cancelled'
  ): Promise<void> {
    const next =
      state === 'paused'
        ? IngestionJobEntity.fromPrimitives(job).markPaused(this.now()).toPrimitives()
        : IngestionJobEntity.fromPrimitives(job).cancel(this.now()).toPrimitives();
    await this.options.repository.saveJobWithEvent(
      next,
      this.event(
        job.id,
        state,
        'warning',
        state === 'paused' ? 'Ingestion paused' : 'Ingestion cancelled'
      )
    );
  }

  private metrics(job: IngestionJob, completedAt: string, succeeded: boolean, wasFailed: boolean) {
    const nextFetched = job.fetchedChapters + (succeeded ? 1 : 0);
    const nextFailed = Math.max(
      0,
      job.failedChapters + (wasFailed ? (succeeded ? -1 : 0) : succeeded ? 0 : 1)
    );
    const processed = nextFetched + nextFailed;
    const activeMs = Math.max(
      1,
      Date.parse(completedAt) - Date.parse(job.startedAt ?? job.createdAt) - job.totalPausedMs
    );
    const speed = processed / (activeMs / 1000);
    const remaining = Math.max(0, job.totalChapters - processed);
    return {
      currentSpeed: speed,
      averageSpeed: speed,
      etaSeconds: speed > 0 ? Math.round(remaining / speed) : undefined
    };
  }

  private event(
    jobId: string,
    type: IngestionEvent['type'],
    level: IngestionEvent['level'],
    message: string,
    chapter?: LibraryChapter,
    attempt?: number
  ): IngestionEvent {
    return {
      id: this.options.ids.randomId(),
      jobId,
      type,
      level,
      message,
      ...(chapter === undefined
        ? {}
        : { chapterId: chapter.id, chapterIndex: chapter.index, chapterTitle: chapter.title }),
      ...(attempt === undefined ? {} : { attempt }),
      createdAt: this.now()
    };
  }

  private now(): string {
    return this.options.clock.now().toISOString();
  }
}
