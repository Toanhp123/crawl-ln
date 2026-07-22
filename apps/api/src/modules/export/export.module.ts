import type { LibraryQueries } from '../library/public/library.api.js';
import { ExportPipelineService } from './application/services/export-pipeline.service.js';
import { EpubExportWriter } from './infrastructure/epub/epub-export.writer.js';
import { LibraryQueryNovelExportSourceAdapter } from './infrastructure/library/library-query-novel-export-source.adapter.js';
import { TextExportWriter } from './infrastructure/text/text-export.writer.js';
import { ExportController } from './presentation/export.controller.js';
import type { ExportApi } from './public/export.api.js';

interface ExportModuleOptions {
  library: LibraryQueries;
  maxSourceBytes?: number;
}

export function createExportModule(options: ExportModuleOptions) {
  const pipeline = new ExportPipelineService(
    new LibraryQueryNovelExportSourceAdapter(options.library),
    { epub: new EpubExportWriter(), txt: new TextExportWriter() },
    options.maxSourceBytes
  );
  const api: ExportApi = {
    commands: {
      exportNovel: (command) => pipeline.execute(command.novelId, command.options)
    }
  };

  return {
    name: 'export',
    migrations: [],
    api,
    presentation: { controller: new ExportController(api) }
  };
}

export type ExportModule = ReturnType<typeof createExportModule>;
