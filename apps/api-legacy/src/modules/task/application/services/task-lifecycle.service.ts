import type { CrawlTask } from '../../domain/entities/task.entity.js';
import type { TaskRepository } from '../../domain/repositories/task.repository.js';
import { CrawlTaskEntity } from '../../domain/entities/task.entity.js';

export type TaskMetrics = { currentSpeed: number; averageSpeed: number; etaSeconds?: number };

export class TaskLifecycleService {
  constructor(private readonly repository: TaskRepository) {}

  create(task: CrawlTask, chapterIds?: string[]) {
    return this.repository.create(task, chapterIds);
  }
  update(task: CrawlTask) {
    return this.repository.update(task);
  }
  findById(id: string) {
    return this.repository.findById(id);
  }
  findChapterIds(taskId: string) {
    return this.repository.findChapterIds(taskId);
  }
  findRecoverable(limit?: number) {
    return this.repository.findRecoverable(limit);
  }
  findInterrupted(limit?: number) {
    return this.repository.findInterrupted(limit);
  }
  hasActiveForNovel(novelId: string) {
    return this.repository.hasActiveForNovel(novelId);
  }

  createQueued(params: {
    id: string;
    novelId: string;
    totalChapters: number;
    now: string;
  }): CrawlTask {
    return CrawlTaskEntity.createQueued(params).toPrimitives();
  }
  markRunning(task: CrawlTask, now: string) {
    return CrawlTaskEntity.fromPrimitives(task).markRunning(now).toPrimitives();
  }
  markPausing(task: CrawlTask, now: string) {
    return CrawlTaskEntity.fromPrimitives(task).markPausing(now).toPrimitives();
  }
  markPaused(task: CrawlTask, now: string) {
    return CrawlTaskEntity.fromPrimitives(task).markPaused(now).toPrimitives();
  }
  markResuming(task: CrawlTask, now: string) {
    return CrawlTaskEntity.fromPrimitives(task).markResuming(now).toPrimitives();
  }
  withTotal(task: CrawlTask, total: number, now: string) {
    return CrawlTaskEntity.fromPrimitives(task).withTotal(total, now).toPrimitives();
  }
  recordChapterResult(
    task: CrawlTask,
    ok: boolean,
    wasFailed: boolean,
    metrics: TaskMetrics,
    now: string
  ) {
    return CrawlTaskEntity.fromPrimitives(task)
      .recordChapterResult(ok, wasFailed, metrics, now)
      .toPrimitives();
  }
  complete(task: CrawlTask, now: string) {
    return CrawlTaskEntity.fromPrimitives(task).complete(now).toPrimitives();
  }
  fail(task: CrawlTask, message: string, now: string) {
    return CrawlTaskEntity.fromPrimitives(task).fail(message, now).toPrimitives();
  }
  cancel(task: CrawlTask, now: string) {
    return CrawlTaskEntity.fromPrimitives(task).cancel(now).toPrimitives();
  }
}
