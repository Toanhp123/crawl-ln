import { ChapterCatalogService } from '../../../modules/chapters/application/services/chapter-catalog.service.js';
import { GetChapterUseCase } from '../../../modules/chapters/application/use-cases/get-chapter.usecase.js';
import { ListChaptersUseCase } from '../../../modules/chapters/application/use-cases/list-chapters.usecase.js';
import { ChapterSqliteRepository } from '../../../modules/chapters/infrastructure/sqlite/chapter-sqlite.repository.js';
import { ChapterCrawlSqliteWriter } from '../../../modules/chapters/infrastructure/sqlite/chapter-crawl-sqlite.writer.js';
import { ChapterController } from '../../../modules/chapters/presentation/controllers/chapter.controller.js';
import type { InfrastructureModule } from './infrastructure.module.js';
import type { ChaptersApi } from '../../../modules/chapters/public/chapters.api.js';

export function createChaptersModule(infrastructure: InfrastructureModule) {
  const repository = new ChapterSqliteRepository(infrastructure.database);
  const catalog = new ChapterCatalogService(repository);
  const getChapter = new GetChapterUseCase(repository);
  const listChapters = new ListChaptersUseCase(repository);
  const crawlWriter = new ChapterCrawlSqliteWriter(infrastructure.database);

  const api = { catalog } satisfies ChaptersApi;

  return {
    api: { ...api, getChapter, listChapters },
    persistence: { crawlWriter },
    presentation: { controller: new ChapterController(getChapter, listChapters) }
  };
}

export type ChaptersModule = ReturnType<typeof createChaptersModule>;
