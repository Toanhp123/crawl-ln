import type { CrawlEvent, CrawlTask, TaskSummary } from '@novel-tool/shared';
import type { IngestionEvent, IngestionJob, IngestionSummary } from '../public/ingestion.api.js';

export function toCrawlTaskResponse(job: IngestionJob): CrawlTask {
  return { ...job };
}

export function toCrawlEventResponse(event: IngestionEvent): CrawlEvent {
  return {
    id: event.id,
    taskId: event.jobId,
    type: event.type === 'job_created' ? 'task_created' : event.type,
    level: event.level,
    message: event.message,
    ...(event.chapterId ? { chapterId: event.chapterId } : {}),
    ...(event.chapterIndex !== undefined ? { chapterIndex: event.chapterIndex } : {}),
    ...(event.chapterTitle ? { chapterTitle: event.chapterTitle } : {}),
    ...(event.attempt !== undefined ? { attempt: event.attempt } : {}),
    createdAt: event.createdAt
  };
}

export function toTaskSummaryResponse(summary: IngestionSummary): TaskSummary {
  return { activeCount: summary.activeCount };
}
