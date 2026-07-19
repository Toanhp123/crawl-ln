import type { Request, Response } from 'express';
import { ok } from '../../../../shared/http/api-response.js';
import { parseBody } from '../../../../shared/validation/validate.js';
import type { SourceReaderApi } from '../../public/source-reader.api.js';
import { chapterListRequestSchema, sourceUrlRequestSchema } from '../dto/source-reader.dto.js';

export class SourceReaderController {
  constructor(private readonly api: SourceReaderApi) {}

  identify = async (req: Request, res: Response) =>
    ok(res, await this.api.identify(parseBody(req, sourceUrlRequestSchema)));

  metadata = async (req: Request, res: Response) =>
    ok(res, await this.api.readMetadata(parseBody(req, sourceUrlRequestSchema)));

  chapterList = async (req: Request, res: Response) =>
    ok(res, await this.api.readChapterList(parseBody(req, chapterListRequestSchema)));

  chapterContent = async (req: Request, res: Response) =>
    ok(res, await this.api.readChapterContent(parseBody(req, sourceUrlRequestSchema)));
}
