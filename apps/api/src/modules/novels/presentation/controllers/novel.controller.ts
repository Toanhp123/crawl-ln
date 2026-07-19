import type { Request, Response } from 'express';
import { idParamsDto, listNovelsQueryDto, analyzeNovelDto } from '../dto/novel.dto.js';
import type { AnalyzeNovelUseCase } from '../../application/use-cases/analyze-novel.usecase.js';
import type { UpdateNovelUseCase } from '../../application/use-cases/update-novel.usecase.js';
import type { ListNovelsUseCase } from '../../application/use-cases/queries/list-novels.usecase.js';
import type { GetNovelDetailUseCase } from '../../application/use-cases/queries/get-novel-detail.usecase.js';
import type { GetNovelStatsUseCase } from '../../application/use-cases/queries/get-novel-stats.usecase.js';
import type { DeleteNovelUseCase } from '../../application/use-cases/commands/delete-novel.usecase.js';
import type { NovelTaskQueryPort } from '../../application/ports/novel-task-query.port.js';
import type { RealtimeEventPublisher } from '../../../../shared/realtime/realtime-event-broker.js';
import { accepted, noContent, ok } from '../../../../shared/http/api-response.js';
import { parseBody, parseParams, parseQuery } from '../../../../shared/validation/validate.js';
import {
  toAnalyzeNovelResponse,
  toCrawlTaskResponse,
  toNovelDetailResponse,
  toNovelStatsResponse,
  toPaginatedNovelsResponse,
  toUpdateNovelResponse
} from '../mappers/novel-response.mapper.js';

export class NovelController {
  constructor(
    private readonly analyzeNovel: AnalyzeNovelUseCase,
    private readonly updateNovel: UpdateNovelUseCase,
    private readonly listNovels: ListNovelsUseCase,
    private readonly getNovelDetail: GetNovelDetailUseCase,
    private readonly getNovelStats: GetNovelStatsUseCase,
    private readonly deleteNovel: DeleteNovelUseCase,
    private readonly getNovelTask: NovelTaskQueryPort,
    private readonly realtime: RealtimeEventPublisher
  ) {}

  analyze = async (req: Request, res: Response) => {
    const body = parseBody(req, analyzeNovelDto);
    const result = await this.analyzeNovel.execute(body.url);
    this.realtime.publish({
      type: 'data.changed',
      resources: ['novels', 'search'],
      reason: 'novel.analyzed',
      novelId: result.id
    });
    return ok(res, toAnalyzeNovelResponse(result));
  };

  update = async (req: Request, res: Response) => {
    const params = parseParams(req, idParamsDto);
    const result = await this.updateNovel.execute(params.id);
    this.realtime.publish({
      type: 'data.changed',
      resources: ['novels', 'tasks', 'search'],
      reason: 'novel.updated',
      novelId: params.id,
      taskId: result.task?.id
    });
    return accepted(res, toUpdateNovelResponse(result));
  };

  list = async (req: Request, res: Response) => {
    const query = parseQuery(req, listNovelsQueryDto);
    return ok(res, toPaginatedNovelsResponse(await this.listNovels.execute(query)));
  };

  stats = async (_req: Request, res: Response) =>
    ok(res, toNovelStatsResponse(await this.getNovelStats.execute()));

  detail = async (req: Request, res: Response) => {
    const params = parseParams(req, idParamsDto);
    return ok(res, toNovelDetailResponse(await this.getNovelDetail.execute(params.id)));
  };

  task = async (req: Request, res: Response) => {
    const params = parseParams(req, idParamsDto);
    return ok(res, toCrawlTaskResponse(await this.getNovelTask.execute(params.id)));
  };

  delete = async (req: Request, res: Response) => {
    const params = parseParams(req, idParamsDto);
    await this.deleteNovel.execute(params.id);
    this.realtime.publish({
      type: 'data.changed',
      resources: ['novels', 'tasks', 'scheduler', 'search'],
      reason: 'novel.deleted',
      novelId: params.id
    });
    return noContent(res);
  };
}
