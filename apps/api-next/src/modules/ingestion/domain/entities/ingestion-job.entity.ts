import { IngestionError } from '../errors/ingestion.error.js';
import type { IngestionJob, IngestionJobOutcome, IngestionJobStatus } from '../ingestion.models.js';

const statuses: readonly IngestionJobStatus[] = [
  'queued',
  'running',
  'pausing',
  'paused',
  'resuming',
  'completed',
  'failed',
  'cancelled'
];
const outcomes: readonly IngestionJobOutcome[] = ['success', 'partial', 'failure'];
const terminalStatuses: readonly IngestionJobStatus[] = ['completed', 'failed', 'cancelled'];

function assertNonBlank(value: string, field: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw IngestionError.validation(`${field} must not be blank`, { field });
  }
}

function assertTimestamp(value: string | undefined, field: string): void {
  if (value === undefined) return;
  if (typeof value !== 'string' || value.trim().length === 0 || Number.isNaN(Date.parse(value))) {
    throw IngestionError.validation(`${field} must be a valid timestamp`, { field, value });
  }
}

function assertNonNegativeInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw IngestionError.validation(`${field} must be a non-negative integer`, { field, value });
  }
}

function assertNonNegativeNumber(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw IngestionError.validation(`${field} must be a non-negative number`, { field, value });
  }
}

function validateOutcome(job: IngestionJob): void {
  if (job.outcome !== undefined && !outcomes.includes(job.outcome)) {
    throw IngestionError.validation('outcome is invalid', { outcome: job.outcome });
  }
  if (job.status === 'completed') {
    const expected = job.failedChapters > 0 ? 'partial' : 'success';
    if (job.outcome !== expected || (expected === 'partial' && job.fetchedChapters === 0)) {
      throw IngestionError.validation('completed job outcome does not match its counters');
    }
  } else if (job.status === 'failed') {
    if (job.outcome !== 'failure') {
      throw IngestionError.validation('failed job must have a failure outcome');
    }
  } else if (job.outcome !== undefined) {
    throw IngestionError.validation('non-terminal job must not have an outcome');
  }
}

function validateJob(job: IngestionJob): void {
  assertNonBlank(job.id, 'id');
  assertNonBlank(job.novelId, 'novelId');
  if (!statuses.includes(job.status)) {
    throw IngestionError.validation('status is invalid', { status: job.status });
  }
  assertNonNegativeInteger(job.totalChapters, 'totalChapters');
  assertNonNegativeInteger(job.fetchedChapters, 'fetchedChapters');
  assertNonNegativeInteger(job.failedChapters, 'failedChapters');
  if (job.fetchedChapters + job.failedChapters > job.totalChapters) {
    throw IngestionError.validation('chapter counters exceed the job total');
  }
  assertNonNegativeInteger(job.totalPausedMs, 'totalPausedMs');
  assertNonNegativeNumber(job.currentSpeed, 'currentSpeed');
  assertNonNegativeNumber(job.averageSpeed, 'averageSpeed');
  if (job.etaSeconds !== undefined) assertNonNegativeInteger(job.etaSeconds, 'etaSeconds');
  assertTimestamp(job.startedAt, 'startedAt');
  assertTimestamp(job.finishedAt, 'finishedAt');
  assertTimestamp(job.pausedAt, 'pausedAt');
  assertTimestamp(job.createdAt, 'createdAt');
  assertTimestamp(job.updatedAt, 'updatedAt');
  validateOutcome(job);
}

export class IngestionJobEntity {
  private constructor(private readonly props: Readonly<IngestionJob>) {}

  static createQueued(params: {
    id: string;
    novelId: string;
    totalChapters: number;
    now: string;
  }): IngestionJobEntity {
    return IngestionJobEntity.fromPrimitives({
      id: params.id,
      novelId: params.novelId,
      status: 'queued',
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

  static fromPrimitives(job: IngestionJob): IngestionJobEntity {
    validateJob(job);
    return new IngestionJobEntity(Object.freeze({ ...job }));
  }

  markRunning(now: string): IngestionJobEntity {
    this.assertStatus(['queued', 'resuming'], 'start');
    const addedPause = this.props.pausedAt
      ? Math.max(0, Date.parse(now) - Date.parse(this.props.pausedAt))
      : 0;
    return this.with({
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

  markPausing(now: string): IngestionJobEntity {
    this.assertStatus(['queued', 'running', 'resuming'], 'pause');
    return this.with({ status: 'pausing', updatedAt: now });
  }

  markPaused(now: string): IngestionJobEntity {
    this.assertStatus(['queued', 'running', 'pausing', 'resuming'], 'pause');
    return this.with({
      status: 'paused',
      pausedAt: now,
      currentSpeed: 0,
      etaSeconds: undefined,
      updatedAt: now
    });
  }

  markResuming(now: string): IngestionJobEntity {
    this.assertStatus(['paused'], 'resume');
    return this.with({ status: 'resuming', updatedAt: now });
  }

  resume(now: string): IngestionJobEntity {
    return this.markResuming(now);
  }

  withTotal(totalChapters: number, now: string): IngestionJobEntity {
    this.assertStatus(['running'], 'change total chapters for');
    return this.with({ totalChapters, updatedAt: now });
  }

  recordChapterResult(
    ok: boolean,
    wasFailed: boolean,
    metrics: { currentSpeed: number; averageSpeed: number; etaSeconds?: number },
    now: string
  ): IngestionJobEntity {
    this.assertStatus(['running'], 'record a chapter result for');
    const fetchedChapters = this.props.fetchedChapters + (ok ? 1 : 0);
    const failedChapters = Math.max(
      0,
      this.props.failedChapters + (wasFailed ? (ok ? -1 : 0) : ok ? 0 : 1)
    );
    return this.with({
      fetchedChapters,
      failedChapters,
      currentSpeed: metrics.currentSpeed,
      averageSpeed: metrics.averageSpeed,
      etaSeconds: metrics.etaSeconds,
      updatedAt: now
    });
  }

  complete(now: string): IngestionJobEntity {
    this.assertStatus(['running'], 'complete');
    const status: IngestionJobStatus =
      this.props.failedChapters > 0 && this.props.fetchedChapters === 0 ? 'failed' : 'completed';
    const outcome: IngestionJobOutcome =
      status === 'failed' ? 'failure' : this.props.failedChapters > 0 ? 'partial' : 'success';
    return this.with({
      status,
      outcome,
      currentSpeed: 0,
      etaSeconds: 0,
      finishedAt: now,
      updatedAt: now
    });
  }

  fail(message: string, now: string): IngestionJobEntity {
    this.assertNotTerminal('fail');
    assertNonBlank(message, 'errorMessage');
    return this.with({
      status: 'failed',
      outcome: 'failure',
      errorMessage: message,
      currentSpeed: 0,
      etaSeconds: undefined,
      finishedAt: now,
      updatedAt: now
    });
  }

  cancel(now: string): IngestionJobEntity {
    if (this.props.status === 'cancelled') return this;
    this.assertNotTerminal('cancel');
    return this.with({
      status: 'cancelled',
      outcome: undefined,
      currentSpeed: 0,
      etaSeconds: undefined,
      finishedAt: now,
      updatedAt: now
    });
  }

  canContinue(): boolean {
    return ['queued', 'running', 'resuming'].includes(this.props.status);
  }

  toPrimitives(): IngestionJob {
    return { ...this.props };
  }

  get status(): IngestionJobStatus {
    return this.props.status;
  }

  get novelId(): string {
    return this.props.novelId;
  }

  private with(changes: Partial<IngestionJob>): IngestionJobEntity {
    return IngestionJobEntity.fromPrimitives({ ...this.props, ...changes });
  }

  private assertStatus(allowed: IngestionJobStatus[], action: string): void {
    if (!allowed.includes(this.props.status)) {
      throw IngestionError.invalidTransition(this.props.status, action);
    }
  }

  private assertNotTerminal(action: string): void {
    if (terminalStatuses.includes(this.props.status)) {
      throw IngestionError.invalidTransition(this.props.status, action);
    }
  }
}
