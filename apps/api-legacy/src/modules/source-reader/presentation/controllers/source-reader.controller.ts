import type { Response } from 'express';
import { ok } from '../../../../shared/http/api-response.js';
import { parseBody } from '../../../../shared/validation/validate.js';
import type { SourceReaderApi } from '../../public/source-reader.api.js';
import {
  chapterListRequestSchema,
  searchRequestSchema,
  sourceUrlRequestSchema
} from '../dto/source-reader.dto.js';
import type { SourceReaderRequest } from '../source-reader-actor.middleware.js';

export class SourceReaderController {
  constructor(private readonly api: SourceReaderApi) {}

  private withActor<T extends Record<string, unknown>>(req: SourceReaderRequest, input: T) {
    return {
      ...input,
      userId: req.sourceReaderActor?.id,
      requestId: req.sourceReaderRequestId
    };
  }

  identify = async (req: SourceReaderRequest, res: Response) =>
    ok(res, await this.api.identify(this.withActor(req, parseBody(req, sourceUrlRequestSchema))));

  metadata = async (req: SourceReaderRequest, res: Response) =>
    ok(
      res,
      await this.api.readMetadata(this.withActor(req, parseBody(req, sourceUrlRequestSchema)))
    );

  chapterList = async (req: SourceReaderRequest, res: Response) =>
    ok(
      res,
      await this.api.readChapterList(this.withActor(req, parseBody(req, chapterListRequestSchema)))
    );

  chapterContent = async (req: SourceReaderRequest, res: Response) =>
    ok(
      res,
      await this.api.readChapterContent(this.withActor(req, parseBody(req, sourceUrlRequestSchema)))
    );

  search = async (req: SourceReaderRequest, res: Response) =>
    ok(res, await this.api.search(this.withActor(req, parseBody(req, searchRequestSchema))));

  latestUpdates = async (req: SourceReaderRequest, res: Response) =>
    ok(
      res,
      await this.api.latestUpdates(this.withActor(req, parseBody(req, chapterListRequestSchema)))
    );
}
