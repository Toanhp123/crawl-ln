import { AnalyzeNovelUseCase } from '../../../modules/novels/application/use-cases/analyze-novel.usecase.js';
import { DeleteNovelUseCase } from '../../../modules/novels/application/use-cases/commands/delete-novel.usecase.js';
import { GetNovelDetailUseCase } from '../../../modules/novels/application/use-cases/queries/get-novel-detail.usecase.js';
import { GetNovelStatsUseCase } from '../../../modules/novels/application/use-cases/queries/get-novel-stats.usecase.js';
import { ListNovelsUseCase } from '../../../modules/novels/application/use-cases/queries/list-novels.usecase.js';
import { UpdateNovelUseCase } from '../../../modules/novels/application/use-cases/update-novel.usecase.js';
import { NovelController } from '../../../modules/novels/presentation/controllers/novel.controller.js';
import type { CrawlerModule } from './crawler.module.js';
import type { ChaptersModule } from './chapters.module.js';
import type { InfrastructureModule } from './infrastructure.module.js';
import type { NovelsPersistence } from './novels-persistence.module.js';
import type { TasksModule } from './tasks.module.js';
import type { NovelsApi } from '../../../modules/novels/public/novels.api.js';

export function createNovelsModule(
  infrastructure: InfrastructureModule,
  chapters: ChaptersModule,
  persistence: NovelsPersistence,
  crawler: CrawlerModule,
  tasks: TasksModule
) {
  const analyzeNovel = new AnalyzeNovelUseCase(
    crawler.api.analyzeSource,
    persistence.repository,
    persistence.api.analysisPersistence,
    chapters.api.catalog,
    infrastructure.ids,
    infrastructure.clock
  );
  const updateNovel = new UpdateNovelUseCase(
    persistence.repository,
    persistence.api.details,
    analyzeNovel,
    crawler.api.createCrawlJob
  );
  const listNovels = new ListNovelsUseCase(persistence.repository);
  const getNovelDetail = new GetNovelDetailUseCase(persistence.api.details);
  const getNovelStats = new GetNovelStatsUseCase(persistence.repository);
  const deleteNovel = new DeleteNovelUseCase(persistence.api.deletion);

  const api = { analyzeNovel, updateNovel } satisfies NovelsApi;

  return {
    api,
    presentation: {
      controller: new NovelController(
        analyzeNovel,
        updateNovel,
        listNovels,
        getNovelDetail,
        getNovelStats,
        deleteNovel,
        tasks.api.getNovelTask,
        infrastructure.realtime
      )
    }
  };
}

export type NovelsModule = ReturnType<typeof createNovelsModule>;
