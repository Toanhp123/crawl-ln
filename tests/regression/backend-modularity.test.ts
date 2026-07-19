import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

test('app container composes focused module factories', () => {
  const source = read('apps/api/src/shared/container/app-container.ts');
  assert.match(source, /createInfrastructureModule/);
  assert.match(source, /createCrawlerModule/);
  assert.match(source, /createNovelsModule/);
  assert.match(source, /createSchedulerModule/);
  assert.doesNotMatch(source, /new CrawlJobRunnerService/);
  assert.doesNotMatch(source, /new NovelController/);
});

test('novels application depends on ports instead of crawler concrete use cases', () => {
  const analyze = read(
    'apps/api/src/modules/novels/application/use-cases/analyze-novel.usecase.ts'
  );
  const update = read('apps/api/src/modules/novels/application/use-cases/update-novel.usecase.ts');
  assert.doesNotMatch(analyze, /modules\/crawler|crawler\/application/);
  assert.doesNotMatch(update, /modules\/crawler|crawler\/application/);
  assert.match(analyze, /SourceAnalyzerPort/);
  assert.match(update, /CrawlJobCreatorPort/);
});

test('chapter URL identity is owned locally by crawler and novels', () => {
  const analyze = read(
    'apps/api/src/modules/novels/application/use-cases/analyze-novel.usecase.ts'
  );
  const engine = read(
    'apps/api/src/modules/crawler/application/services/crawler-engine.service.ts'
  );
  assert.match(analyze, /novels\/domain|domain\/url\/chapter-source-url-key/);
  assert.match(engine, /crawler\/domain|domain\/url\/chapter-source-url-key/);
  assert.doesNotMatch(analyze, /shared\/domain/);
  assert.doesNotMatch(engine, /shared\/domain/);
});

test('scheduler infrastructure does not import novels infrastructure', () => {
  const source = read(
    'apps/api/src/modules/scheduler/infrastructure/sqlite/auto-update-policy-sqlite.repository.ts'
  );
  assert.doesNotMatch(source, /novels\/infrastructure/);
});

test('feature repositories are constructed by their owning module factories', () => {
  const sharedInfrastructure = read(
    'apps/api/src/shared/container/modules/infrastructure.module.ts'
  );
  const tasks = read('apps/api/src/shared/container/modules/tasks.module.ts');
  const chapters = read('apps/api/src/shared/container/modules/chapters.module.ts');
  const scheduler = read('apps/api/src/shared/container/modules/scheduler.module.ts');
  assert.doesNotMatch(sharedInfrastructure, /SqliteRepository/);
  assert.match(tasks, /new TaskSqliteRepository/);
  assert.match(chapters, /new ChapterSqliteRepository/);
  assert.match(scheduler, /new AutoUpdatePolicySqliteRepository/);
  assert.match(scheduler, /new SchedulerSqliteRepository/);
});

test('route factories accept controllers instead of the global app container', () => {
  for (const path of [
    'apps/api/src/modules/novels/presentation/routes/novel.routes.ts',
    'apps/api/src/modules/crawler/presentation/routes/crawl.routes.ts',
    'apps/api/src/modules/task/presentation/routes/task.routes.ts',
    'apps/api/src/modules/scheduler/presentation/scheduler.routes.ts'
  ]) {
    const source = read(path);
    assert.doesNotMatch(source, /AppContainer/);
  }
});

test('novels does not expose a legacy crawl command wrapper', () => {
  const controller = read(
    'apps/api/src/modules/novels/presentation/controllers/novel.controller.ts'
  );
  const routes = read('apps/api/src/modules/novels/presentation/routes/novel.routes.ts');
  assert.doesNotMatch(controller, /CrawlNovelUseCase|crawlNovelDto|crawl =/);
  assert.doesNotMatch(routes, /post\('\/crawl'/);
  assert.match(controller, /NovelTaskQueryPort/);
  assert.doesNotMatch(controller, /GetNovelTaskUseCase/);
});
