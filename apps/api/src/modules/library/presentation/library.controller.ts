import { randomUUID } from 'node:crypto';
import {
  AnalyzeNovelRequestSchema,
  ChapterParamsSchema,
  IdParamsSchema,
  ListNovelsQuerySchema
} from '@novel-tool/shared';
import type { Request, Response } from 'express';
import type {
  IngestionApi,
  IngestionJob,
  RefreshNovelCommand
} from '../../ingestion/public/ingestion.api.js';
import type { SchedulerQueries } from '../../scheduler/public/scheduler.api.js';
import { ApplicationHttpError } from '../../../platform/http/application-http.error.js';
import { accepted, noContent, ok } from '../../../platform/http/api-response.js';
import type { RealtimeEventPublisher } from '../../../platform/realtime/realtime-event.js';
import type {
  LibraryCatalogQuery,
  LibraryCatalogQueryService
} from '../application/queries/library-catalog.query.js';
import type { LibraryApi, LibraryNovelDetail } from '../public/library.api.js';
import {
  toChapterResponse,
  toCrawlTaskResponse,
  toNovelDetailResponse,
  toNovelResponse,
  toPaginatedNovelsResponse
} from './library.mapper.js';

function csv(value?: string): string[] | undefined {
  if (value === undefined) return undefined;
  return [
    ...new Set(
      value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    )
  ].slice(0, 50);
}

interface RefreshNovelSummaryPort {
  execute(command: RefreshNovelCommand): Promise<{
    novel: LibraryNovelDetail;
    newChapterCount: number;
    pendingChapterCount: number;
    task: IngestionJob | null;
  }>;
}

export class LibraryController {
  constructor(
    private readonly library: LibraryApi,
    private readonly catalog: Pick<LibraryCatalogQueryService, 'listNovels'>,
    private readonly ingestion: IngestionApi,
    private readonly refreshNovelSummary: RefreshNovelSummaryPort,
    private readonly scheduler: SchedulerQueries,
    private readonly clock: { now(): Date },
    private readonly ids: { randomId(): string } = { randomId: randomUUID },
    private readonly realtime?: RealtimeEventPublisher
  ) {}

  analyze = async (request: Request, response: Response) => {
    const body = AnalyzeNovelRequestSchema.parse(request.body);
    const detail = await this.ingestion.commands.analyzeNovel({
      commandId: `http:analyze:${this.ids.randomId()}`,
      url: body.url,
      requestedAt: this.clock.now().toISOString()
    });
    const policy = await this.scheduler.getPolicy(detail.novel.id);
    this.realtime?.publish({
      type: 'data.changed',
      resources: ['novels', 'search'],
      reason: 'novel.analyzed',
      novelId: detail.novel.id
    });
    return ok(response, {
      ...toNovelResponse(detail.novel, policy, false),
      chapters: detail.chapters.map(toChapterResponse)
    });
  };

  list = async (request: Request, response: Response) => {
    const query = ListNovelsQuerySchema.parse(request.query);
    const libraryQuery: LibraryCatalogQuery = {
      q: query.q,
      status: query.status,
      sort: query.sort,
      limit: query.limit,
      offset: query.offset,
      ids: csv(query.ids),
      excludeIds: csv(query.excludeIds),
      readingOrder: csv(query.readingOrder)
    };
    const page = await this.catalog.listNovels(libraryQuery);
    const policies = await this.scheduler.getPolicies(page.items.map((novel) => novel.id));
    return ok(
      response,
      toPaginatedNovelsResponse(page, new Map(policies.map((policy) => [policy.novelId, policy])))
    );
  };

  stats = async (_request: Request, response: Response) =>
    ok(response, await this.library.queries.getStats());

  detail = async (request: Request, response: Response) => {
    const { id } = IdParamsSchema.parse(request.params);
    const detail = await this.requireNovel(id);
    return ok(
      response,
      toNovelDetailResponse(detail, await this.scheduler.getPolicy(detail.novel.id))
    );
  };

  chapters = async (request: Request, response: Response) => {
    const { id } = IdParamsSchema.parse(request.params);
    const detail = await this.library.queries.getNovel(id);
    return ok(response, detail ? detail.chapters.map(toChapterResponse) : []);
  };

  chapter = async (request: Request, response: Response) => {
    const { id, index } = ChapterParamsSchema.parse(request.params);
    const chapter = await this.library.queries.getChapter(id, index);
    if (!chapter) throw new ApplicationHttpError('not_found', 'Chapter not found');
    return ok(response, toChapterResponse(chapter));
  };

  task = async (request: Request, response: Response) => {
    const { id } = IdParamsSchema.parse(request.params);
    return ok(response, toCrawlTaskResponse(await this.ingestion.queries.getNovelJob(id)));
  };

  update = async (request: Request, response: Response) => {
    const { id } = IdParamsSchema.parse(request.params);
    await this.requireNovel(id);
    const result = await this.refreshNovelSummary.execute({
      commandId: `http:refresh:${this.ids.randomId()}`,
      novelId: id,
      requestedAt: this.clock.now().toISOString()
    });
    this.realtime?.publish({
      type: 'data.changed',
      resources: ['novels', 'tasks', 'search'],
      reason: 'novel.updated',
      novelId: id,
      ...(result.task ? { taskId: result.task.id } : {})
    });
    return accepted(response, {
      novel: toNovelDetailResponse(result.novel, await this.scheduler.getPolicy(id)),
      newChapterCount: result.newChapterCount,
      pendingChapterCount: result.pendingChapterCount,
      task: toCrawlTaskResponse(result.task)
    });
  };

  delete = async (request: Request, response: Response) => {
    const { id } = IdParamsSchema.parse(request.params);
    const novel = await this.library.queries.getNovel(id);
    const existingTask = await this.ingestion.queries.getNovelJob(id);
    if (!novel && !existingTask) throw new ApplicationHttpError('not_found', 'Novel not found');

    await this.ingestion.commands.cancelNovelJobs({ novelId: id });
    if (novel) {
      await this.library.commands.deleteNovel({
        commandId: `http:delete:${this.ids.randomId()}`,
        novelId: id,
        deletedAt: this.clock.now().toISOString()
      });
    }
    await this.ingestion.commands.purgeNovelJobs({ novelId: id });
    this.realtime?.publish({
      type: 'data.changed',
      resources: ['novels', 'tasks', 'scheduler', 'search'],
      reason: 'novel.deleted',
      novelId: id
    });
    return noContent(response);
  };

  private async requireNovel(id: string) {
    const detail = await this.library.queries.getNovel(id);
    if (!detail) throw new ApplicationHttpError('not_found', 'Novel not found');
    return detail;
  }
}
