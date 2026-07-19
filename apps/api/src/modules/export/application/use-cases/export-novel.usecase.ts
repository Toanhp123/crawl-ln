import type { ExportOptions } from '../../domain/export.js';
import type { ExportPipelineService } from '../services/export-pipeline.service.js';
export class ExportNovelUseCase {
  constructor(private readonly pipeline: ExportPipelineService) {}
  execute(novelId: string, options: ExportOptions) {
    return this.pipeline.execute(novelId, options);
  }
}
