import { randomUUID } from 'node:crypto';
import {
  AnalyzeNovelRequestSchema,
  CrawlNovelRequestSchema,
  IdParamsSchema
} from '@novel-tool/shared';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { ApplicationHttpError } from '../../../platform/http/application-http.error.js';
import { accepted, ok } from '../../../platform/http/api-response.js';
import type { RealtimeEventPublisher } from '../../../platform/realtime/realtime-event.js';
import type { AnalyzeSourcePreviewService } from '../application/services/analyze-source-preview.service.js';
import type { IngestionQueriesService } from '../application/queries/ingestion-queries.service.js';
import type { ResumePausedJobsService } from '../application/services/resume-paused-jobs.service.js';
import type { IngestionApi, IngestionJob } from '../public/ingestion.api.js';
import {
  toCrawlEventResponse,
  toCrawlTaskResponse,
  toTaskSummaryResponse
} from './ingestion.mapper.js';

const limitQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional()
});

export class IngestionController {
  constructor(
    private readonly ingestion: IngestionApi,
    private readonly application: {
      analyzeSource: Pick<AnalyzeSourcePreviewService, 'execute'>;
      jobEvents: Pick<IngestionQueriesService, 'getJobEvents'>;
      resumePausedJobs: Pick<ResumePausedJobsService, 'execute'>;
    },
    private readonly clock: { now(): Date },
    private readonly ids: { randomId(): string } = { randomId: randomUUID },
    private readonly realtime?: RealtimeEventPublisher
  ) {}

  analyze = async (request: Request, response: Response) => {
    const { url } = AnalyzeNovelRequestSchema.parse(request.body);
    return ok(response, await this.application.analyzeSource.execute({ url }));
  };

  create = async (request: Request, response: Response) => {
    const { novelId } = CrawlNovelRequestSchema.parse(request.body);
    try {
      const job = await this.ingestion.commands.createJob({
        commandId: `http:create-job:${this.ids.randomId()}`,
        novelId,
        requestedAt: this.clock.now().toISOString()
      });
      this.publishTaskChange(job, 'crawl.job.created');
      return accepted(response, toCrawlTaskResponse(job));
    } catch (error) {
      if (this.errorCode(error) === 'INGESTION_NOT_FOUND') {
        throw new ApplicationHttpError('not_found', 'Novel not found');
      }
      if (
        this.errorCode(error) === 'INGESTION_CONFLICT' &&
        error instanceof Error &&
        /no pending/i.test(error.message)
      ) {
        throw new ApplicationHttpError('conflict', 'No pending chapters to crawl');
      }
      if (this.errorCode(error) === 'INGESTION_ACTIVE_JOB_CONFLICT') {
        throw new ApplicationHttpError('conflict', 'Novel already has an active crawl task');
      }
      throw error;
    }
  };

  events = async (request: Request, response: Response) => {
    const { id } = IdParamsSchema.parse(request.params);
    const limit = limitQuerySchema.parse(request.query).limit ?? 100;
    await this.requireJob(id, 'Crawl job not found');
    return ok(
      response,
      (await this.application.jobEvents.getJobEvents(id, limit)).map(toCrawlEventResponse)
    );
  };

  pause = async (request: Request, response: Response) => {
    const job = await this.runIdentityCommand(request, 'pause');
    return ok(response, toCrawlTaskResponse(job));
  };

  resumeOne = async (request: Request, response: Response) => {
    const job = await this.runIdentityCommand(request, 'resume');
    return accepted(response, toCrawlTaskResponse(job));
  };

  cancel = async (request: Request, response: Response) => {
    const job = await this.runIdentityCommand(request, 'cancel');
    return ok(response, toCrawlTaskResponse(job));
  };

  resume = async (request: Request, response: Response) => {
    const limit = Math.min(limitQuerySchema.parse(request.query).limit ?? 20, 200);
    const resumed = await this.application.resumePausedJobs.execute({
      commandId: `http:resume-jobs:${this.ids.randomId()}`,
      limit,
      requestedAt: this.clock.now().toISOString()
    });
    for (const job of resumed) this.publishTaskChange(job, 'crawl.jobs.resumed');
    return accepted(response, resumed.map(toCrawlTaskResponse));
  };

  listTasks = async (_request: Request, response: Response) =>
    ok(response, (await this.ingestion.queries.listJobs({ limit: 100 })).map(toCrawlTaskResponse));

  taskSummary = async (_request: Request, response: Response) =>
    ok(response, toTaskSummaryResponse(await this.ingestion.queries.getSummary()));

  taskDetail = async (request: Request, response: Response) => {
    const { id } = IdParamsSchema.parse(request.params);
    return ok(response, toCrawlTaskResponse(await this.requireJob(id, 'Task not found')));
  };

  private async runIdentityCommand(
    request: Request,
    action: 'pause' | 'resume' | 'cancel'
  ): Promise<IngestionJob> {
    const { id } = IdParamsSchema.parse(request.params);
    const before = await this.requireJob(id, 'Crawl job not found');
    const command = {
      commandId: `http:${action}-job:${this.ids.randomId()}`,
      jobId: id,
      requestedAt: this.clock.now().toISOString()
    };
    try {
      if (action === 'pause') await this.ingestion.commands.pauseJob(command);
      else if (action === 'resume') await this.ingestion.commands.resumeJob(command);
      else await this.ingestion.commands.cancelJob(command);
    } catch (error) {
      if (error instanceof Error && this.errorCode(error)?.startsWith('INGESTION_')) {
        throw new ApplicationHttpError('conflict', `Cannot ${action} a ${before.status} crawl job`);
      }
      throw error;
    }
    const result = await this.requireJob(id, 'Crawl job not found');
    this.publishTaskChange(result, `crawl.job.${action === 'cancel' ? 'cancelled' : `${action}d`}`);
    return result;
  }

  private async requireJob(id: string, message: string): Promise<IngestionJob> {
    const job = await this.ingestion.queries.getJob(id);
    if (!job) throw new ApplicationHttpError('not_found', message);
    return job;
  }

  private errorCode(error: unknown): string | undefined {
    if (!(error instanceof Error) || !('code' in error)) return undefined;
    return typeof error.code === 'string' ? error.code : undefined;
  }

  private publishTaskChange(job: IngestionJob, reason: string): void {
    this.realtime?.publish({
      type: 'data.changed',
      resources: ['tasks', 'novels'],
      reason,
      taskId: job.id,
      novelId: job.novelId
    });
  }
}
