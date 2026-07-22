import type { Request, Response } from 'express';
import { parseBody, parseParams } from '../../../../shared/validation/validate.js';
import type { ExportNovelUseCase } from '../../application/use-cases/export-novel.usecase.js';
import { exportNovelParamsDto, exportNovelRequestDto } from '../dto/export.dto.js';
export class ExportController {
  constructor(private readonly exportNovel: ExportNovelUseCase) {}
  create = async (req: Request, res: Response) => {
    const { id } = parseParams(req, exportNovelParamsDto);
    const options = parseBody(req, exportNovelRequestDto);
    const artifact = await this.exportNovel.execute(id, options);
    res.setHeader('Content-Disposition', `attachment; filename="${artifact.filename}"`);
    res.setHeader('X-Export-Chapter-Count', String(artifact.chapterCount));
    return res.type(artifact.contentType).send(artifact.content);
  };
}
