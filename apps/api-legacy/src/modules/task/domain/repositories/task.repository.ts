import type { CrawlTask } from '../entities/task.entity.js';

export interface TaskRepository {
  create(task: CrawlTask, chapterIds?: string[]): Promise<void>;
  update(task: CrawlTask): Promise<void>;
  findById(id: string): Promise<CrawlTask | null>;
  findChapterIds(taskId: string): Promise<string[]>;
  findByNovelId(novelId: string): Promise<CrawlTask | null>;
  findAll(limit?: number): Promise<CrawlTask[]>;
  countActive(): Promise<number>;
  findRecoverable(limit?: number): Promise<CrawlTask[]>;
  findInterrupted(limit?: number): Promise<CrawlTask[]>;
  hasActiveForNovel(novelId: string): Promise<boolean>;
}
