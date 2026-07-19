export type TaskStatus =
  'queued' | 'running' | 'pausing' | 'paused' | 'resuming' | 'completed' | 'failed' | 'cancelled';
export type TaskOutcome = 'success' | 'partial' | 'failure';

export type CrawlTask = {
  id: string;
  novelId: string;
  status: TaskStatus;
  outcome?: TaskOutcome;
  totalChapters: number;
  fetchedChapters: number;
  failedChapters: number;
  errorMessage?: string;
  startedAt?: string;
  finishedAt?: string;
  pausedAt?: string;
  totalPausedMs: number;
  currentSpeed: number;
  averageSpeed: number;
  etaSeconds?: number;
  createdAt: string;
  updatedAt: string;
};

export class InvalidTaskTransitionError extends Error {
  constructor(from: TaskStatus, action: string) {
    super(`Cannot ${action} a ${from} crawl task`);
    this.name = 'InvalidTaskTransitionError';
  }
}

export class CrawlTaskEntity {
  private constructor(private readonly props: CrawlTask) {}

  static createQueued(params: {
    id: string;
    novelId: string;
    totalChapters: number;
    now: string;
  }): CrawlTaskEntity {
    return new CrawlTaskEntity({
      id: params.id,
      novelId: params.novelId,
      status: 'queued',
      outcome: undefined,
      totalChapters: params.totalChapters,
      fetchedChapters: 0,
      failedChapters: 0,
      totalPausedMs: 0,
      currentSpeed: 0,
      averageSpeed: 0,
      createdAt: params.now,
      updatedAt: params.now
    });
  }

  static fromPrimitives(task: CrawlTask): CrawlTaskEntity {
    return new CrawlTaskEntity({ ...task });
  }

  markRunning(now: string): CrawlTaskEntity {
    this.assertStatus(['queued', 'resuming'], 'start');
    const addedPause = this.props.pausedAt
      ? Math.max(0, Date.parse(now) - Date.parse(this.props.pausedAt))
      : 0;
    return new CrawlTaskEntity({
      ...this.props,
      status: 'running',
      outcome: undefined,
      startedAt: this.props.startedAt ?? now,
      pausedAt: undefined,
      totalPausedMs: this.props.totalPausedMs + addedPause,
      finishedAt: undefined,
      errorMessage: undefined,
      updatedAt: now
    });
  }

  markPausing(now: string): CrawlTaskEntity {
    this.assertStatus(['queued', 'running', 'resuming'], 'pause');
    return new CrawlTaskEntity({ ...this.props, status: 'pausing', updatedAt: now });
  }

  markPaused(now: string): CrawlTaskEntity {
    this.assertStatus(['queued', 'running', 'pausing', 'resuming'], 'pause');
    return new CrawlTaskEntity({
      ...this.props,
      status: 'paused',
      pausedAt: now,
      currentSpeed: 0,
      etaSeconds: undefined,
      updatedAt: now
    });
  }

  markResuming(now: string): CrawlTaskEntity {
    this.assertStatus(['paused'], 'resume');
    return new CrawlTaskEntity({ ...this.props, status: 'resuming', updatedAt: now });
  }

  withTotal(totalChapters: number, now: string): CrawlTaskEntity {
    this.assertStatus(['running'], 'change total chapters for');
    return new CrawlTaskEntity({ ...this.props, totalChapters, updatedAt: now });
  }

  recordChapterResult(
    ok: boolean,
    wasFailed: boolean,
    metrics: { currentSpeed: number; averageSpeed: number; etaSeconds?: number },
    now: string
  ): CrawlTaskEntity {
    this.assertStatus(['running'], 'record a chapter result for');
    const fetchedChapters = this.props.fetchedChapters + (ok ? 1 : 0);
    const failedChapters = Math.max(
      0,
      this.props.failedChapters + (wasFailed ? (ok ? -1 : 0) : ok ? 0 : 1)
    );
    return new CrawlTaskEntity({
      ...this.props,
      fetchedChapters,
      failedChapters,
      currentSpeed: metrics.currentSpeed,
      averageSpeed: metrics.averageSpeed,
      etaSeconds: metrics.etaSeconds,
      updatedAt: now
    });
  }

  complete(now: string): CrawlTaskEntity {
    this.assertStatus(['running'], 'complete');
    const status: TaskStatus =
      this.props.failedChapters > 0 && this.props.fetchedChapters === 0 ? 'failed' : 'completed';
    const outcome: TaskOutcome =
      status === 'failed' ? 'failure' : this.props.failedChapters > 0 ? 'partial' : 'success';
    return new CrawlTaskEntity({
      ...this.props,
      status,
      outcome,
      currentSpeed: 0,
      etaSeconds: 0,
      finishedAt: now,
      updatedAt: now
    });
  }

  fail(message: string, now: string): CrawlTaskEntity {
    this.assertNotTerminal('fail');
    return new CrawlTaskEntity({
      ...this.props,
      status: 'failed',
      outcome: 'failure',
      errorMessage: message,
      currentSpeed: 0,
      etaSeconds: undefined,
      finishedAt: now,
      updatedAt: now
    });
  }

  cancel(now: string): CrawlTaskEntity {
    if (this.props.status === 'cancelled') return this;
    this.assertNotTerminal('cancel');
    return new CrawlTaskEntity({
      ...this.props,
      status: 'cancelled',
      currentSpeed: 0,
      etaSeconds: undefined,
      finishedAt: now,
      updatedAt: now
    });
  }

  canContinue(): boolean {
    return ['queued', 'running', 'resuming'].includes(this.props.status);
  }
  toPrimitives(): CrawlTask {
    return { ...this.props };
  }
  get status() {
    return this.props.status;
  }
  get novelId() {
    return this.props.novelId;
  }

  private assertStatus(allowed: TaskStatus[], action: string): void {
    if (!allowed.includes(this.props.status))
      throw new InvalidTaskTransitionError(this.props.status, action);
  }

  private assertNotTerminal(action: string): void {
    if (['completed', 'failed', 'cancelled'].includes(this.props.status))
      throw new InvalidTaskTransitionError(this.props.status, action);
  }
}
