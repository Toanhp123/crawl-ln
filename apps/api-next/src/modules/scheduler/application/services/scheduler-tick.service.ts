import type { IngestionCommands } from '../../../ingestion/public/ingestion.api.js';
import type { LibraryQueries } from '../../../library/public/library.api.js';
import { failureBackoff, nextPolicyCheck } from '../../domain/scheduler-policy.js';
import type {
  SchedulerDiagnostic,
  SchedulerPolicy,
  SchedulerResultCode,
  SchedulerStatus
} from '../../domain/scheduler.models.js';
import type { SchedulerDiagnosticPublisher } from '../ports/scheduler-diagnostic.publisher.js';
import type { SchedulerRepository } from '../ports/scheduler.repository.js';

const activeLimit = 3;
const batchLimit = 5;
const diagnosticsRetentionLimit = 100;

function isActiveIngestionConflict(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === 'INGESTION_ACTIVE_JOB_CONFLICT'
  );
}

export class SchedulerTickService {
  private timer?: NodeJS.Timeout;
  private currentTick?: Promise<void>;
  private activeRuns = 0;
  private lastTickAt?: string;
  private nextTickAt?: string;
  private lastTickDurationMs?: number;

  constructor(
    private readonly repository: SchedulerRepository,
    private readonly library: LibraryQueries,
    private readonly ingestion: Pick<IngestionCommands, 'refreshNovel'>,
    private readonly diagnostics: SchedulerDiagnosticPublisher,
    private readonly clock: { now(): Date },
    private readonly ids: { randomId(): string },
    private readonly logger: { error(message: string): void },
    readonly tickIntervalMs = 60_000
  ) {}

  start(): void {
    if (this.timer) return;
    this.nextTickAt = new Date(this.clock.now().getTime() + this.tickIntervalMs).toISOString();
    this.timer = setInterval(() => {
      void this.tick().catch((error) => {
        const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
        this.logger.error(`Scheduler tick failed: ${detail}`);
      });
    }, this.tickIntervalMs);
    this.timer.unref();
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    await this.currentTick;
  }

  async status(): Promise<SchedulerStatus> {
    const now = this.clock.now().toISOString();
    return {
      running: Boolean(this.timer),
      tickIntervalMs: this.tickIntervalMs,
      monitoredNovels: await this.repository.countMonitored(),
      dueNovels: await this.repository.countDue(now),
      activeRuns: this.activeRuns,
      ...(this.lastTickAt ? { lastTickAt: this.lastTickAt } : {}),
      ...(this.nextTickAt ? { nextTickAt: this.nextTickAt } : {}),
      ...(this.lastTickDurationMs !== undefined
        ? { lastTickDurationMs: this.lastTickDurationMs }
        : {})
    };
  }

  async tick(): Promise<void> {
    if (this.currentTick) return this.currentTick;
    const execution = this.performTick();
    this.currentTick = execution;
    try {
      await execution;
    } finally {
      if (this.currentTick === execution) this.currentTick = undefined;
    }
  }

  private async performTick(): Promise<void> {
    const startedAt = this.clock.now();
    this.lastTickAt = startedAt.toISOString();
    this.nextTickAt = new Date(startedAt.getTime() + this.tickIntervalMs).toISOString();
    try {
      const due = await this.repository.listDue(startedAt.toISOString(), batchLimit);
      let cursor = 0;
      const worker = async () => {
        while (cursor < due.length) {
          const policy = due[cursor++];
          this.activeRuns += 1;
          try {
            await this.runPolicy(policy);
          } finally {
            this.activeRuns -= 1;
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(activeLimit, due.length) }, () => worker()));
    } finally {
      this.lastTickDurationMs = Math.max(0, this.clock.now().getTime() - startedAt.getTime());
    }
  }

  private async runPolicy(policy: SchedulerPolicy): Promise<void> {
    const checkedAt = this.clock.now();
    const detail = await this.library.getNovel(policy.novelId);
    if (!detail) {
      await this.persistResult(policy, {
        sourceName: 'unknown',
        result: 'failed',
        message: 'Library novel was not found.',
        newChapterCount: 0,
        pendingChapterCount: 0,
        checkedAt,
        failures: policy.consecutiveFailures + 1
      });
      return;
    }

    try {
      const job = await this.ingestion.refreshNovel({
        commandId: `scheduler-refresh:${policy.novelId}:${checkedAt.toISOString()}`,
        novelId: policy.novelId,
        requestedAt: checkedAt.toISOString()
      });
      const refreshedDetail = await this.library.getNovel(policy.novelId);
      const newChapterCount = Math.max(
        0,
        (refreshedDetail?.chapters.length ?? detail.chapters.length) - detail.chapters.length
      );
      await this.persistResult(policy, {
        sourceName: detail.novel.sourceName,
        result: job ? 'queued' : 'up_to_date',
        message: job
          ? `Queued ${job.totalChapters} chapter(s), including ${newChapterCount} new.`
          : 'No new chapters found.',
        newChapterCount,
        pendingChapterCount: job?.totalChapters ?? 0,
        checkedAt,
        failures: 0
      });
    } catch (error) {
      const conflict = isActiveIngestionConflict(error);
      const failures = conflict ? 0 : policy.consecutiveFailures + 1;
      await this.persistResult(policy, {
        sourceName: detail.novel.sourceName,
        result: conflict ? 'skipped_active_task' : 'failed',
        message: conflict
          ? 'Skipped because an active crawl task exists.'
          : error instanceof Error
            ? error.message
            : String(error),
        newChapterCount: 0,
        pendingChapterCount: 0,
        checkedAt,
        failures
      });
      if (!conflict) {
        this.logger.error(
          `Automatic refresh failed for ${policy.novelId}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }
  }

  private async persistResult(
    policy: SchedulerPolicy,
    input: {
      sourceName: string;
      result: SchedulerResultCode;
      message: string;
      newChapterCount: number;
      pendingChapterCount: number;
      checkedAt: Date;
      failures: number;
    }
  ): Promise<void> {
    const durationMs = Math.max(0, this.clock.now().getTime() - input.checkedAt.getTime());
    const nextMinutes =
      input.result === 'failed' ? failureBackoff(input.failures) : policy.intervalMinutes;
    await this.repository.recordState(policy.novelId, {
      lastCheckAt: input.checkedAt.toISOString(),
      nextCheckAt: nextPolicyCheck(input.checkedAt, nextMinutes),
      result: input.result,
      consecutiveFailures: input.failures,
      updatedAt: input.checkedAt.toISOString()
    });
    const diagnostic: SchedulerDiagnostic = {
      id: this.ids.randomId(),
      novelId: policy.novelId,
      sourceName: input.sourceName,
      result: input.result,
      message: input.message,
      newChapterCount: input.newChapterCount,
      pendingChapterCount: input.pendingChapterCount,
      durationMs,
      createdAt: input.checkedAt.toISOString()
    };
    try {
      await this.diagnostics.publish(diagnostic, diagnosticsRetentionLimit);
    } catch (error) {
      this.logger.error(
        `Scheduler diagnostics failed for ${policy.novelId}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
}
