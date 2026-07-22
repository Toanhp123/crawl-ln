import type { AnalyzeNovelResult, CrawlTask } from '../application/models/crawler-contracts.js';

export interface AnalyzeSourceApi {
  execute(url: string): Promise<AnalyzeNovelResult>;
}

export interface CreateCrawlJobApi {
  execute(novelId: string): Promise<CrawlTask>;
}

export interface RecoverCrawlJobsApi {
  execute(limit?: number): Promise<CrawlTask[]>;
}

export interface CrawlerApi {
  readonly analyzeSource: AnalyzeSourceApi;
  readonly createCrawlJob: CreateCrawlJobApi;
  readonly recoverCrawlJobs: RecoverCrawlJobsApi;
}

export interface CrawlerLifecycle {
  readonly queue: {
    beginMaintenance(): void;
    endMaintenance(): void;
    stop(): Promise<void>;
  };
}
