import { NovelSqliteRepository } from '../../../modules/novels/infrastructure/sqlite/novel-sqlite.repository.js';
import { NovelAnalysisSqliteAdapter } from '../../../modules/novels/infrastructure/sqlite/novel-analysis-sqlite.adapter.js';
import { NovelDeletionSqliteAdapter } from '../../../modules/novels/infrastructure/sqlite/novel-deletion-sqlite.adapter.js';
import { NovelCrawlSqliteWriter } from '../../../modules/novels/infrastructure/sqlite/novel-crawl-sqlite.writer.js';
import { NovelCrawlLifecycleService } from '../../../modules/novels/application/services/novel-crawl-lifecycle.service.js';
import { NovelDetailQueryService } from '../../../modules/novels/application/services/novel-detail-query.service.js';
import { NovelExportQueryService } from '../../../modules/novels/application/services/novel-export-query.service.js';
import type { ChaptersModule } from './chapters.module.js';
import type { InfrastructureModule } from './infrastructure.module.js';

export function createNovelsPersistence(
  infrastructure: InfrastructureModule,
  chapters: ChaptersModule
) {
  const repository = new NovelSqliteRepository(infrastructure.database);
  const analysisPersistence = new NovelAnalysisSqliteAdapter(infrastructure.database);
  const deletion = new NovelDeletionSqliteAdapter(infrastructure.database);
  const details = new NovelDetailQueryService(repository, chapters.api.catalog);
  const crawlWriter = new NovelCrawlSqliteWriter(infrastructure.database);
  return {
    repository,
    persistence: { crawlWriter },
    api: {
      details,
      analysisPersistence,
      deletion,
      crawlLifecycle: new NovelCrawlLifecycleService(details),
      exportQuery: new NovelExportQueryService(details)
    }
  };
}

export type NovelsPersistence = ReturnType<typeof createNovelsPersistence>;
