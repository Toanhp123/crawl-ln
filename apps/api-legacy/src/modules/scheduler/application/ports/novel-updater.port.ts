import type { CrawlTask, NovelDetail } from '../models/scheduler-contracts.js';

export type NovelUpdateExecutionResult = {
  novel: NovelDetail;
  newChapterCount: number;
  pendingChapterCount: number;
  task: CrawlTask | null;
};

export interface NovelUpdaterPort {
  execute(novelId: string): Promise<NovelUpdateExecutionResult>;
}
