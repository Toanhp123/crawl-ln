import type { CrawlTask } from '../models/crawler-contracts.js';

export type CrawlProgressMetrics = {
  currentSpeed: number;
  averageSpeed: number;
  etaSeconds?: number;
};

export class CrawlProgressService {
  private readonly completionTimes = new Map<string, number[]>();

  start(taskId: string): void {
    this.completionTimes.set(taskId, []);
  }

  finish(taskId: string): void {
    this.completionTimes.delete(taskId);
  }

  record(
    taskId: string,
    task: CrawlTask,
    completedAtMs: number,
    succeeded: boolean,
    wasFailed: boolean
  ): CrawlProgressMetrics {
    const times = this.completionTimes.get(taskId) ?? [];
    times.push(completedAtMs);
    const retainedTimes = times.slice(-30);
    this.completionTimes.set(taskId, retainedTimes);

    const nextFetched = task.fetchedChapters + (succeeded ? 1 : 0);
    const nextFailed = Math.max(
      0,
      task.failedChapters + (wasFailed ? (succeeded ? -1 : 0) : succeeded ? 0 : 1)
    );
    const processed = nextFetched + nextFailed;
    const startedAtMs = Date.parse(task.startedAt ?? task.createdAt);
    const activeMs = Math.max(1, completedAtMs - startedAtMs - task.totalPausedMs);
    const averageSpeed = processed / (activeMs / 1000);
    const recent = retainedTimes.slice(-5);
    const currentSpeed =
      recent.length > 1
        ? (recent.length - 1) /
          Math.max(0.001, ((recent.at(-1) ?? completedAtMs) - (recent[0] ?? completedAtMs)) / 1000)
        : averageSpeed;
    const remaining = Math.max(0, task.totalChapters - processed);

    return {
      currentSpeed,
      averageSpeed,
      etaSeconds: currentSpeed > 0 ? Math.round(remaining / currentSpeed) : undefined
    };
  }
}
