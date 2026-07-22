import type { ApplicationEvent } from '../events/application-event.js';
import type { EventBus } from '../events/event-bus.js';
import type { RealtimeEventInput, RealtimeEventPublisher } from './realtime-event.js';

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' ? (value as JsonRecord) : {};
}

function string(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function number(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function ingestionResources(type: string): RealtimeEventInput['resources'] {
  if (type === 'chapter_started' || type === 'chapter_retry') return ['tasks'];
  if (type === 'chapter_succeeded' || type === 'chapter_failed') {
    return ['tasks', 'novels', 'search'];
  }
  return ['tasks', 'novels'];
}

export class ApplicationEventToRealtimeAdapter {
  readonly name = 'realtime';
  readonly migrations = [];
  private unsubscribers: Array<() => void> = [];

  constructor(
    private readonly events: EventBus,
    private readonly realtime: RealtimeEventPublisher
  ) {}

  async start(): Promise<void> {
    if (this.unsubscribers.length > 0) return;
    this.unsubscribers = [
      this.events.subscribe('library.analysis-reconciled', (event) =>
        this.publishLibraryAnalysis(event)
      ),
      this.events.subscribe('library.chapter-content-saved', (event) =>
        this.publishLibraryChapter(event)
      ),
      this.events.subscribe('library.novel-deleted', (event) => this.publishLibraryDeletion(event)),
      this.events.subscribe('ingestion.job-created', (event) => this.publishIngestionJob(event)),
      this.events.subscribe('ingestion.audit-recorded', (event) =>
        this.publishIngestionAudit(event)
      ),
      this.events.subscribe('scheduler.diagnostic.recorded', (event) =>
        this.publishSchedulerDiagnostic(event)
      )
    ];
  }

  async stop(): Promise<void> {
    for (const unsubscribe of this.unsubscribers) unsubscribe();
    this.unsubscribers = [];
  }

  private publishLibraryAnalysis(event: ApplicationEvent): Promise<void> {
    const novel = record(record(event.payload).novel);
    this.realtime.publish({
      type: 'data.changed',
      resources: ['novels', 'search'],
      reason: 'novel.analyzed',
      ...(string(novel.id) ? { novelId: string(novel.id) } : {})
    });
    return Promise.resolve();
  }

  private publishLibraryChapter(event: ApplicationEvent): Promise<void> {
    const chapter = record(record(event.payload).chapter);
    this.realtime.publish({
      type: 'data.changed',
      resources: ['tasks', 'novels', 'search'],
      reason: 'crawl.chapter_succeeded',
      ...(string(chapter.novelId) ? { novelId: string(chapter.novelId) } : {}),
      ...(number(chapter.index) !== undefined ? { chapterIndex: number(chapter.index) } : {})
    });
    return Promise.resolve();
  }

  private publishLibraryDeletion(event: ApplicationEvent): Promise<void> {
    const payload = record(event.payload);
    this.realtime.publish({
      type: 'data.changed',
      resources: ['novels', 'tasks', 'scheduler', 'search'],
      reason: 'novel.deleted',
      ...(string(payload.novelId) ? { novelId: string(payload.novelId) } : {})
    });
    return Promise.resolve();
  }

  private publishIngestionJob(event: ApplicationEvent): Promise<void> {
    const job = record(record(event.payload).job);
    this.realtime.publish({
      type: 'data.changed',
      resources: ['tasks', 'novels'],
      reason: 'crawl.job.created',
      ...(string(job.id) ? { taskId: string(job.id) } : {}),
      ...(string(job.novelId) ? { novelId: string(job.novelId) } : {})
    });
    return Promise.resolve();
  }

  private publishIngestionAudit(event: ApplicationEvent): Promise<void> {
    const payload = record(event.payload);
    const type = string(payload.type) ?? 'changed';
    this.realtime.publish({
      type: 'data.changed',
      resources: ingestionResources(type),
      reason: `crawl.${type}`,
      ...(string(payload.jobId) ? { taskId: string(payload.jobId) } : {}),
      ...(number(payload.chapterIndex) !== undefined
        ? { chapterIndex: number(payload.chapterIndex) }
        : {})
    });
    return Promise.resolve();
  }

  private publishSchedulerDiagnostic(event: ApplicationEvent): Promise<void> {
    const diagnostic = record(record(event.payload).diagnostic);
    const result = string(diagnostic.result) ?? 'changed';
    this.realtime.publish({
      type: 'data.changed',
      resources: ['scheduler', 'novels'],
      reason: `scheduler.${result}`,
      ...(string(diagnostic.novelId) ? { novelId: string(diagnostic.novelId) } : {})
    });
    return Promise.resolve();
  }
}
