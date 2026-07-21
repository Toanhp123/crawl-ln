import { IngestionJobEntity } from '../../domain/entities/ingestion-job.entity.js';
import { IngestionError } from '../../domain/errors/ingestion.error.js';
import type { IngestionEvent, IngestionJob } from '../../domain/ingestion.models.js';
import type { IngestionRepository } from '../../domain/repositories/ingestion.repository.js';
import type { IngestionIdGeneratorPort } from '../ports/id-generator.port.js';
import type {
  IngestionJobRunnerService,
  IngestionRunControl
} from './ingestion-job-runner.service.js';

interface QueueOptions {
  repository: Pick<IngestionRepository, 'findById' | 'findInterrupted' | 'saveJobWithEvent'>;
  runner: Pick<IngestionJobRunnerService, 'run' | 'markFailed'>;
  clock: { now(): Date };
  ids: IngestionIdGeneratorPort;
  logger: { error(message: string): void };
}

export class IngestionQueueService {
  private readonly enqueued = new Set<string>();
  private readonly running = new Set<string>();
  private readonly cancelled = new Set<string>();
  private readonly pauseRequested = new Set<string>();
  private readonly controllers = new Map<string, AbortController>();
  private readonly processes = new Map<string, Promise<void>>();
  private stopping = false;
  private maintenance = false;

  constructor(private readonly options: QueueOptions) {}

  enqueue(jobId: string): void {
    if (this.stopping)
      throw new IngestionError('INGESTION_CONFLICT', 'Ingestion queue is stopping');
    if (this.maintenance) {
      throw new IngestionError('INGESTION_CONFLICT', 'Ingestion queue is in maintenance mode');
    }
    if (this.enqueued.has(jobId) || this.running.has(jobId)) return;
    this.enqueued.add(jobId);
    this.cancelled.delete(jobId);
    this.pauseRequested.delete(jobId);
    this.controllers.set(jobId, new AbortController());
    const process = this.process(jobId).catch((error) => this.handleFailure(jobId, error));
    this.processes.set(jobId, process);
    void process.finally(() => {
      if (this.processes.get(jobId) === process) this.processes.delete(jobId);
    });
  }

  async pause(jobId: string): Promise<void> {
    const current = await this.requireJob(jobId);
    if (current.status === 'paused') return;
    const pausing = IngestionJobEntity.fromPrimitives(current)
      .markPausing(this.now())
      .toPrimitives();
    await this.options.repository.saveJobWithEvent(
      pausing,
      this.event(jobId, 'pause_requested', 'warning', 'Pause requested')
    );
    this.pauseRequested.add(jobId);
    this.controllers.get(jobId)?.abort();
    await this.processes.get(jobId);
    await this.ensurePaused(jobId, 'Ingestion paused');
  }

  async resume(jobId: string): Promise<void> {
    const current = await this.requireJob(jobId);
    if (current.status !== 'paused') {
      throw new IngestionError('INGESTION_CONFLICT', `Cannot resume a ${current.status} job`);
    }
    const resuming = IngestionJobEntity.fromPrimitives(current)
      .markResuming(this.now())
      .toPrimitives();
    await this.options.repository.saveJobWithEvent(
      resuming,
      this.event(jobId, 'resume_requested', 'info', 'Resume requested')
    );
    this.enqueue(jobId);
  }

  async cancel(jobId: string): Promise<void> {
    const current = await this.requireJob(jobId);
    if (current.status === 'cancelled') return;
    if (['completed', 'failed'].includes(current.status)) {
      throw new IngestionError('INGESTION_CONFLICT', `Cannot cancel a ${current.status} job`);
    }
    this.cancelled.add(jobId);
    this.pauseRequested.delete(jobId);
    this.controllers.get(jobId)?.abort();
    await this.processes.get(jobId);
    const latest = await this.requireJob(jobId);
    if (latest.status !== 'cancelled') {
      const cancelled = IngestionJobEntity.fromPrimitives(latest).cancel(this.now()).toPrimitives();
      await this.options.repository.saveJobWithEvent(
        cancelled,
        this.event(jobId, 'cancelled', 'warning', 'Ingestion cancelled')
      );
    }
  }

  async recoverInterrupted(limit = 200): Promise<IngestionJob[]> {
    const recovered: IngestionJob[] = [];
    const batchSize = Math.max(1, limit);
    while (true) {
      const batch = await this.options.repository.findInterrupted(batchSize);
      if (batch.length === 0) break;
      for (const job of batch) {
        const paused = IngestionJobEntity.fromPrimitives(job).markPaused(this.now()).toPrimitives();
        await this.options.repository.saveJobWithEvent(
          paused,
          this.event(
            job.id,
            'recovered_paused',
            'warning',
            'Server restarted; ingestion moved to paused'
          )
        );
        recovered.push(paused);
      }
    }
    return recovered;
  }

  beginMaintenance(): void {
    if (this.maintenance) {
      throw new IngestionError('INGESTION_CONFLICT', 'Ingestion queue is in maintenance mode');
    }
    if (this.processes.size > 0 || this.enqueued.size > 0 || this.running.size > 0) {
      throw new IngestionError(
        'INGESTION_CONFLICT',
        'Wait for active crawl tasks to finish before restoring a backup'
      );
    }
    this.maintenance = true;
  }

  endMaintenance(): void {
    this.maintenance = false;
  }

  async stop(): Promise<void> {
    if (!this.stopping) {
      this.stopping = true;
      for (const jobId of new Set([...this.enqueued, ...this.running])) {
        this.pauseRequested.add(jobId);
        this.controllers.get(jobId)?.abort();
      }
    }
    const affected = [...this.processes.keys()];
    await Promise.allSettled([...this.processes.values()]);
    for (const jobId of affected) await this.ensurePaused(jobId, 'Queue stopped; ingestion paused');
  }

  private async process(jobId: string): Promise<void> {
    const job = await this.options.repository.findById(jobId);
    this.enqueued.delete(jobId);
    if (!job) return;
    this.running.add(jobId);
    const control: IngestionRunControl = {
      isCancelled: (id) => this.cancelled.has(id),
      isPauseRequested: (id) => this.pauseRequested.has(id),
      signal: (id) => this.controllers.get(id)?.signal
    };
    try {
      await this.options.runner.run(jobId, control);
    } finally {
      this.running.delete(jobId);
      this.cancelled.delete(jobId);
      this.pauseRequested.delete(jobId);
      this.controllers.delete(jobId);
    }
  }

  private async handleFailure(jobId: string, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    this.options.logger.error(message);
    try {
      await this.options.runner.markFailed(jobId, message);
    } catch (markError) {
      this.options.logger.error(markError instanceof Error ? markError.message : String(markError));
    }
  }

  private async ensurePaused(jobId: string, message: string): Promise<void> {
    const latest = await this.options.repository.findById(jobId);
    if (!latest || ['paused', 'completed', 'failed', 'cancelled'].includes(latest.status)) return;
    const paused = IngestionJobEntity.fromPrimitives(latest).markPaused(this.now()).toPrimitives();
    await this.options.repository.saveJobWithEvent(
      paused,
      this.event(jobId, 'paused', 'warning', message)
    );
  }

  private async requireJob(jobId: string): Promise<IngestionJob> {
    const job = await this.options.repository.findById(jobId);
    if (!job) throw new IngestionError('INGESTION_NOT_FOUND', 'Ingestion job was not found');
    return job;
  }

  private event(
    jobId: string,
    type: IngestionEvent['type'],
    level: IngestionEvent['level'],
    message: string
  ): IngestionEvent {
    return {
      id: this.options.ids.randomId(),
      jobId,
      type,
      level,
      message,
      createdAt: this.now()
    };
  }

  private now(): string {
    return this.options.clock.now().toISOString();
  }
}
