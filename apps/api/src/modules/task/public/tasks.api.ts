import type { CrawlTask } from '../domain/entities/task.entity.js';

export type TaskMetrics = {
  currentSpeed: number;
  averageSpeed: number;
  etaSeconds?: number;
};

export interface GetNovelTaskApi {
  execute(novelId: string): Promise<CrawlTask | null>;
}

export interface TaskLifecycleApi {
  create(task: CrawlTask, chapterIds?: string[]): Promise<void>;
  update(task: CrawlTask): Promise<void>;
  findById(id: string): Promise<CrawlTask | null>;
  findChapterIds(taskId: string): Promise<string[]>;
  findRecoverable(limit?: number): Promise<CrawlTask[]>;
  findInterrupted(limit?: number): Promise<CrawlTask[]>;
  hasActiveForNovel(novelId: string): Promise<boolean>;
  createQueued(params: {
    id: string;
    novelId: string;
    totalChapters: number;
    now: string;
  }): CrawlTask;
  markRunning(task: CrawlTask, now: string): CrawlTask;
  markPausing(task: CrawlTask, now: string): CrawlTask;
  markPaused(task: CrawlTask, now: string): CrawlTask;
  markResuming(task: CrawlTask, now: string): CrawlTask;
  withTotal(task: CrawlTask, total: number, now: string): CrawlTask;
  recordChapterResult(
    task: CrawlTask,
    ok: boolean,
    wasFailed: boolean,
    metrics: TaskMetrics,
    now: string
  ): CrawlTask;
  complete(task: CrawlTask, now: string): CrawlTask;
  fail(task: CrawlTask, message: string, now: string): CrawlTask;
  cancel(task: CrawlTask, now: string): CrawlTask;
}

export interface TasksApi {
  readonly getNovelTask: GetNovelTaskApi;
  readonly lifecycle: TaskLifecycleApi;
  readonly activeTasks: { hasForNovel(novelId: string): Promise<boolean> };
}
