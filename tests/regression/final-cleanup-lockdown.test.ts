import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

test('legacy crawl and task query routes are removed', () => {
  const novelRoutes = read('apps/api/src/modules/novels/presentation/routes/novel.routes.ts');
  const crawlRoutes = read('apps/api/src/modules/crawler/presentation/routes/crawl.routes.ts');
  assert.doesNotMatch(novelRoutes, /post\('\/crawl'/);
  assert.doesNotMatch(crawlRoutes, /get\('\/jobs'/);
  assert.doesNotMatch(crawlRoutes, /get\('\/jobs\/:id'/);
});

test('frontend legacy redirects and deprecated ListItem alias are removed', () => {
  const router = read('apps/web/src/app/router/AppRouter.tsx');
  const sharedUi = read('apps/web/src/shared/ui/index.ts');
  assert.doesNotMatch(
    router,
    /LegacyTaskDetailRedirect|LegacyNovelDetailRedirect|path="\/crawl\/tasks\/:taskId"|path="\/reader\/:novelId"/
  );
  assert.doesNotMatch(sharedUi, /ListItem/);
  assert.equal(existsSync('apps/web/src/shared/ui/data-display/ListItem.tsx'), false);
});

test('known dead production artifacts are absent', () => {
  const paths = [
    'apps/web/src/entities/novel/model/useNovels.ts',
    'apps/web/src/entities/novel/ui/NovelCard.tsx',
    'apps/web/src/features/read-chapter/model/useChapterReader.ts',
    'apps/web/src/widgets/crawl-status/ui/CrawlStatusPanel.tsx',
    'apps/web/src/widgets/crawl-summary/ui/CrawlSummary.tsx',
    'apps/web/src/widgets/dashboard-stats/ui/DashboardStats.tsx',
    'apps/api/src/modules/chapters/domain/entities/chapter.entity.ts',
    'apps/api/src/modules/chapters/domain/value-objects/chapter-index.vo.ts',
    'apps/api/src/modules/crawler/application/services/chapter-cleaner.service.ts',
    'apps/api/src/modules/export/presentation/export.types.ts',
    'apps/api/src/modules/novels/domain/value-objects/novel-url.vo.ts',
    'apps/api/src/modules/task/domain/value-objects/crawl-status.vo.ts',
    'apps/api/src/shared/database/sqlite-transaction.ts',
    'apps/api/src/shared/ports/transaction.port.ts'
  ];
  for (const path of paths) assert.equal(existsSync(path), false, `${path} should be removed`);
});
