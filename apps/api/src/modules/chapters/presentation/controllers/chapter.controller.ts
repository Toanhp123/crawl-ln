import type { Request, Response } from 'express';
import { z } from 'zod';
import type { GetChapterUseCase } from '../../application/use-cases/get-chapter.usecase.js';
import type { ListChaptersUseCase } from '../../application/use-cases/list-chapters.usecase.js';
import { ok } from '../../../../shared/http/api-response.js';
import { parseParams } from '../../../../shared/validation/validate.js';
import { toChapterListResponse, toChapterResponse } from '../mappers/chapter-response.mapper.js';

const novelParamsSchema = z.object({ id: z.string().min(1) });
const chapterParamsSchema = z.object({
  id: z.string().min(1),
  index: z.coerce.number().int().min(0)
});

export class ChapterController {
  constructor(
    private readonly getChapter: GetChapterUseCase,
    private readonly listChapters: ListChaptersUseCase
  ) {}

  list = async (req: Request, res: Response) => {
    const params = parseParams(req, novelParamsSchema);
    return ok(res, toChapterListResponse(await this.listChapters.execute(params.id)));
  };

  detail = async (req: Request, res: Response) => {
    const params = parseParams(req, chapterParamsSchema);
    return ok(res, toChapterResponse(await this.getChapter.execute(params.id, params.index)));
  };
}
