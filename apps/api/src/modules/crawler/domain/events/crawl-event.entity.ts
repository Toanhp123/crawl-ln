export type CrawlEventLevel = 'info' | 'success' | 'warning' | 'error';
export type CrawlEventType =
  | 'task_created'
  | 'started'
  | 'chapter_started'
  | 'chapter_succeeded'
  | 'chapter_failed'
  | 'chapter_retry'
  | 'pause_requested'
  | 'paused'
  | 'resume_requested'
  | 'resumed'
  | 'cancelled'
  | 'completed'
  | 'failed'
  | 'recovered_paused';

export type CrawlEvent = {
  id: string;
  taskId: string;
  type: CrawlEventType;
  level: CrawlEventLevel;
  message: string;
  chapterId?: string;
  chapterIndex?: number;
  chapterTitle?: string;
  attempt?: number;
  createdAt: string;
};

export function createCrawlEvent(params: CrawlEvent): CrawlEvent {
  return { ...params };
}
