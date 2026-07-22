import { env } from '../../config/env.js';
import { ExportPipelineService } from '../../../modules/export/application/services/export-pipeline.service.js';
import { ExportNovelUseCase } from '../../../modules/export/application/use-cases/export-novel.usecase.js';
import { EpubExportWriter } from '../../../modules/export/infrastructure/epub/epub-export.writer.js';
import { TextExportWriter } from '../../../modules/export/infrastructure/text/text-export.writer.js';
import { ExportController } from '../../../modules/export/presentation/controllers/export.controller.js';
import type { NovelsPersistence } from './novels-persistence.module.js';

export function createExportModule(novels: NovelsPersistence) {
  const useCase = new ExportNovelUseCase(
    new ExportPipelineService(
      novels.api.exportQuery,
      {
        epub: new EpubExportWriter(),
        txt: new TextExportWriter()
      },
      env.maxExportSourceBytes
    )
  );
  return {
    api: { exportNovel: useCase },
    presentation: { controller: new ExportController(useCase) }
  };
}
export type ExportModule = ReturnType<typeof createExportModule>;
