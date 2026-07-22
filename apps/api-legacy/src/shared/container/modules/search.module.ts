import {
  SearchLibraryUseCase,
  RebuildSearchIndexUseCase
} from '../../../modules/search/application/use-cases/search-library.usecase.js';
import { SearchSqliteRepository } from '../../../modules/search/infrastructure/sqlite/search-sqlite.repository.js';
import { SearchController } from '../../../modules/search/presentation/controllers/search.controller.js';
import type { InfrastructureModule } from './infrastructure.module.js';
export function createSearchModule(i: InfrastructureModule) {
  const r = new SearchSqliteRepository(i.database);
  return {
    presentation: {
      controller: new SearchController(
        new SearchLibraryUseCase(r),
        new RebuildSearchIndexUseCase(r)
      )
    }
  };
}
