export interface CrawlerConfigPort {
  readonly maxChaptersPerRun: number;
  readonly concurrency: number;
  readonly retry: number;
  readonly retryBaseDelayMs?: number;
  readonly retryMaxDelayMs?: number;
}
