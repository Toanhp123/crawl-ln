import { SearchQuerySchema } from '@novel-tool/shared';
import type { Request, Response } from 'express';
import { ok } from '../../../platform/http/api-response.js';
import type { SearchApi } from '../public/search.api.js';

export class SearchController {
  constructor(private readonly api: SearchApi) {}

  search = async (request: Request, response: Response) => {
    const query = SearchQuerySchema.parse(request.query);
    return ok(
      response,
      await this.api.queries.search({
        query: query.q,
        type: query.type,
        ...(query.novelId ? { novelId: query.novelId } : {}),
        limit: query.limit,
        offset: query.offset
      })
    );
  };

  status = async (_request: Request, response: Response) =>
    ok(response, await this.api.queries.status());

  rebuild = async (_request: Request, response: Response) =>
    ok(response, await this.api.commands.rebuild());
}
