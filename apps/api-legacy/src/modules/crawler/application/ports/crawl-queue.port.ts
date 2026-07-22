export interface CrawlQueuePort {
  isRunning(novelId: string): boolean;
  enqueue(taskId: string): void;
  cancel(taskId: string): Promise<void>;
  pause(taskId: string): Promise<void>;
  resume(taskId: string): Promise<void>;
  isCancelled(taskId: string): boolean;
  stop(): Promise<void>;
}
