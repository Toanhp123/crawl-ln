import { ExportNovelRequestSchema, IdParamsSchema } from '@novel-tool/shared';
import type { Request, Response } from 'express';
import { sendDownload } from '../../../platform/http/download-response.js';
import type { ExportApi } from '../public/export.api.js';

export class ExportController {
  constructor(private readonly api: ExportApi) {}

  create = async (request: Request, response: Response) => {
    const params = IdParamsSchema.parse(request.params);
    const options = ExportNovelRequestSchema.parse(request.body);
    const artifact = await this.api.commands.exportNovel({
      novelId: params.id,
      options
    });
    return sendDownload(response, artifact, {
      'X-Export-Chapter-Count': String(artifact.chapterCount)
    });
  };
}
