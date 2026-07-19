import type { Request, Response } from 'express';
import { ok } from '../../../../shared/http/api-response.js';
import { parseQuery } from '../../../../shared/validation/validate.js';
import type {
  RebuildSearchIndexUseCase,
  SearchLibraryUseCase
} from '../../application/use-cases/search-library.usecase.js';
import { searchQueryDto } from '../dto/search.dto.js';
export class SearchController {
  constructor(
    private readonly searchLibrary: SearchLibraryUseCase,
    private readonly rebuildIndex: RebuildSearchIndexUseCase
  ) {}
  search = async (req: Request, res: Response) => {
    const q = parseQuery(req, searchQueryDto);
    return ok(
      res,
      await this.searchLibrary.execute({
        query: q.q,
        type: q.type,
        novelId: q.novelId,
        limit: q.limit,
        offset: q.offset
      })
    );
  };
  rebuild = async (_req: Request, res: Response) => ok(res, await this.rebuildIndex.execute());
}
