import type { Request, Response } from 'express';
import type { CreateCrawlJobUseCase } from '../../application/use-cases/create-crawl-job.usecase.js';
import type { CancelCrawlJobUseCase } from '../../application/use-cases/cancel-crawl-job.usecase.js';
import type { PauseCrawlJobUseCase } from '../../application/use-cases/pause-crawl-job.usecase.js';
import type { ResumeCrawlJobUseCase } from '../../application/use-cases/resume-crawl-job.usecase.js';
import type { ListCrawlEventsUseCase } from '../../application/use-cases/list-crawl-events.usecase.js';
import type { AnalyzeSourceUseCase } from '../../application/use-cases/analyze-source.usecase.js';
import type { ResumeCrawlJobsUseCase } from '../../application/use-cases/resume-crawl-jobs.usecase.js';
import type { ListSourceProfilesUseCase } from '../../application/use-cases/source-profiles/list-source-profiles.usecase.js';
import type { RealtimeEventPublisher } from '../../../../shared/realtime/realtime-event-broker.js';
import { accepted, ok } from '../../../../shared/http/api-response.js';
import { parseBody, parseParams, parseQuery } from '../../../../shared/validation/validate.js';
import {
  analyzeSourceDto,
  createCrawlJobDto,
  crawlJobParamsDto,
  listCrawlEventsQueryDto,
  listCrawlJobsQueryDto
} from '../dto/crawl-job.dto.js';
import {
  toAnalyzeSourceResponse,
  toCrawlEventListResponse,
  toCrawlTaskListResponse,
  toCrawlTaskResponse,
  toSourceProfileListResponse
} from '../mappers/crawler-response.mapper.js';

export class CrawlJobController {
  constructor(
    private readonly createCrawlJob: CreateCrawlJobUseCase,
    private readonly cancelCrawlJob: CancelCrawlJobUseCase,
    private readonly pauseCrawlJob: PauseCrawlJobUseCase,
    private readonly resumeCrawlJob: ResumeCrawlJobUseCase,
    private readonly listCrawlEvents: ListCrawlEventsUseCase,
    private readonly analyzeSource: AnalyzeSourceUseCase,
    private readonly resumeCrawlJobs: ResumeCrawlJobsUseCase,
    private readonly listSourceProfiles: ListSourceProfilesUseCase,
    private readonly realtime: RealtimeEventPublisher
  ) {}

  analyze = async (req: Request, res: Response) =>
    ok(
      res,
      toAnalyzeSourceResponse(
        await this.analyzeSource.execute(parseBody(req, analyzeSourceDto).url)
      )
    );

  sources = async (_req: Request, res: Response) =>
    ok(res, toSourceProfileListResponse(await this.listSourceProfiles.execute()));

  create = async (req: Request, res: Response) => {
    const task = await this.createCrawlJob.execute(parseBody(req, createCrawlJobDto).novelId);
    this.publishTaskChange(task.id, task.novelId, 'crawl.job.created');
    return accepted(res, toCrawlTaskResponse(task));
  };

  events = async (req: Request, res: Response) => {
    const params = parseParams(req, crawlJobParamsDto);
    const query = parseQuery(req, listCrawlEventsQueryDto);
    return ok(
      res,
      toCrawlEventListResponse(await this.listCrawlEvents.execute(params.id, query.limit ?? 100))
    );
  };

  cancel = async (req: Request, res: Response) => {
    const task = await this.cancelCrawlJob.execute(parseParams(req, crawlJobParamsDto).id);
    this.publishTaskChange(task.id, task.novelId, 'crawl.job.cancelled');
    return ok(res, toCrawlTaskResponse(task));
  };

  pause = async (req: Request, res: Response) => {
    const task = await this.pauseCrawlJob.execute(parseParams(req, crawlJobParamsDto).id);
    this.publishTaskChange(task.id, task.novelId, 'crawl.job.paused');
    return ok(res, toCrawlTaskResponse(task));
  };

  resumeOne = async (req: Request, res: Response) => {
    const task = await this.resumeCrawlJob.execute(parseParams(req, crawlJobParamsDto).id);
    this.publishTaskChange(task.id, task.novelId, 'crawl.job.resumed');
    return accepted(res, toCrawlTaskResponse(task));
  };

  resume = async (req: Request, res: Response) => {
    const tasks = await this.resumeCrawlJobs.execute(
      parseQuery(req, listCrawlJobsQueryDto).limit ?? 20
    );
    for (const task of tasks) this.publishTaskChange(task.id, task.novelId, 'crawl.jobs.resumed');
    return accepted(res, toCrawlTaskListResponse(tasks));
  };

  private publishTaskChange(taskId: string, novelId: string, reason: string) {
    this.realtime.publish({
      type: 'data.changed',
      resources: ['tasks', 'novels'],
      reason,
      taskId,
      novelId
    });
  }
}
