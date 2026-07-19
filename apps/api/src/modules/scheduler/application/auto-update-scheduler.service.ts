import type {
  Novel,
  NovelUpdateResultCode,
  SchedulerStatus
} from './models/scheduler-contracts.js';
import type { AutoUpdatePolicyRepository } from './ports/auto-update-policy.repository.js';
import type { SchedulerTaskQueryPort } from './ports/scheduler-task-query.port.js';
import type { NovelUpdaterPort } from './ports/novel-updater.port.js';
import type { NovelUpdateDiagnosticPublisherPort } from './ports/scheduler-diagnostic-publisher.port.js';
import type { ClockPort } from '../../../shared/ports/clock.port.js';
import type { IdGeneratorPort } from '../../../shared/ports/id-generator.port.js';
import type { LoggerPort } from '../../../shared/ports/logger.port.js';

const ACTIVE_LIMIT = 3;
const BATCH_LIMIT = 5;
const DIAGNOSTICS_RETENTION_LIMIT = 100;
const FAILURE_BACKOFF_MINUTES = [5, 15, 30, 120, 1440] as const;

export class AutoUpdateSchedulerService {
  private timer?: NodeJS.Timeout;
  private activeRuns = 0;
  private tickInProgress = false;
  private currentTick?: Promise<void>;
  private lastTickAt?: string;
  private nextTickAt?: string;
  private lastTickDurationMs?: number;

  constructor(
    private readonly policies: AutoUpdatePolicyRepository,
    private readonly tasks: SchedulerTaskQueryPort,
    private readonly diagnostics: NovelUpdateDiagnosticPublisherPort,
    private readonly updateNovel: NovelUpdaterPort,
    private readonly clock: ClockPort,
    private readonly ids: IdGeneratorPort,
    private readonly logger: LoggerPort,
    readonly tickIntervalMs = 60_000
  ) {}

  start() {
    if (this.timer) return;
    this.nextTickAt = new Date(this.clock.now().getTime() + this.tickIntervalMs).toISOString();
    this.timer = setInterval(() => {
      void this.tick().catch((error) => {
        const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
        this.logger.error(`Scheduler tick failed: ${detail}`);
      });
    }, this.tickIntervalMs);
    this.timer.unref?.();
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
      monitoredNovels: await this.policies.countMonitored(),
      dueNovels: await this.policies.countDue(now),
      activeRuns: this.activeRuns,
      lastTickAt: this.lastTickAt,
      nextTickAt: this.nextTickAt,
      lastTickDurationMs: this.lastTickDurationMs
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
    if (this.tickInProgress) return;
    this.tickInProgress = true;
    const startedAt = this.clock.now();
    this.lastTickAt = startedAt.toISOString();
    this.nextTickAt = new Date(startedAt.getTime() + this.tickIntervalMs).toISOString();

    try {
      const due = await this.policies.listDue(startedAt.toISOString(), BATCH_LIMIT);
      let cursor = 0;
      const runWorker = async () => {
        while (cursor < due.length) {
          const novel = due[cursor++];
          this.activeRuns += 1;
          try {
            await this.runNovel(novel);
          } finally {
            this.activeRuns -= 1;
          }
        }
      };
      const workerCount = Math.min(ACTIVE_LIMIT, due.length);
      await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
    } finally {
      this.lastTickDurationMs = this.elapsedMs(startedAt);
      this.tickInProgress = false;
    }
  }

  private async runNovel(novel: Novel) {
    const startedAt = this.clock.now();
    const checkedAt = startedAt;
    const interval = novel.updateIntervalMinutes ?? 1440;
    if (await this.tasks.hasActiveForNovel(novel.id)) {
      await this.persistResult(
        novel,
        'skipped_active_task',
        'Skipped because an active crawl task exists.',
        0,
        0,
        this.elapsedMs(startedAt),
        checkedAt,
        interval,
        0
      );
      return;
    }
    try {
      const result = await this.updateNovel.execute(novel.id);
      const code: NovelUpdateResultCode = result.task ? 'queued' : 'up_to_date';
      const message = result.task
        ? `Queued ${result.pendingChapterCount} chapter(s), including ${result.newChapterCount} new.`
        : 'No new chapters found.';
      await this.persistResult(
        novel,
        code,
        message,
        result.newChapterCount,
        result.pendingChapterCount,
        this.elapsedMs(startedAt),
        checkedAt,
        interval,
        0
      );
    } catch (error) {
      if (error instanceof Error && 'kind' in error && error.kind === 'conflict') {
        await this.persistResult(
          novel,
          'skipped_active_task',
          'Skipped because an active crawl task was created concurrently.',
          0,
          0,
          this.elapsedMs(startedAt),
          checkedAt,
          interval,
          0
        );
        return;
      }
      const failures = (novel.consecutiveUpdateFailures ?? 0) + 1;
      const backoff =
        FAILURE_BACKOFF_MINUTES[Math.min(failures - 1, FAILURE_BACKOFF_MINUTES.length - 1)];
      const message = error instanceof Error ? error.message : String(error);
      await this.persistResult(
        novel,
        'failed',
        message,
        0,
        0,
        this.elapsedMs(startedAt),
        checkedAt,
        backoff,
        failures
      );
      this.logger.error(`Auto update failed for ${novel.id}: ${message}`);
    }
  }

  private elapsedMs(startedAt: Date) {
    return Math.max(0, this.clock.now().getTime() - startedAt.getTime());
  }

  private async persistResult(
    novel: Novel,
    result: NovelUpdateResultCode,
    message: string,
    newChapterCount: number,
    pendingChapterCount: number,
    durationMs: number,
    checkedAt: Date,
    nextMinutes: number,
    failures: number
  ) {
    const nextCheckAt = new Date(checkedAt.getTime() + nextMinutes * 60_000).toISOString();
    await this.policies.recordState(novel.id, {
      lastCheckAt: checkedAt.toISOString(),
      nextCheckAt,
      result,
      consecutiveFailures: failures
    });
    try {
      await this.diagnostics.publish(
        {
          id: this.ids.randomId(),
          novelId: novel.id,
          sourceName: novel.sourceName,
          result,
          message,
          newChapterCount,
          pendingChapterCount,
          durationMs,
          createdAt: checkedAt.toISOString()
        },
        DIAGNOSTICS_RETENTION_LIMIT
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.error(`Scheduler diagnostics failed for ${novel.id}: ${detail}`);
    }
  }
}
