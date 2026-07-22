import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

test('legacy crawl and task query routes are removed', () => {
  const novelRoutes = read(
    'apps/api-legacy/src/modules/novels/presentation/routes/novel.routes.ts'
  );
  const crawlRoutes = read(
    'apps/api-legacy/src/modules/crawler/presentation/routes/crawl.routes.ts'
  );
  assert.doesNotMatch(novelRoutes, /post\('\/crawl'/);
  assert.doesNotMatch(crawlRoutes, /get\('\/jobs'/);
  assert.doesNotMatch(crawlRoutes, /get\('\/jobs\/:id'/);
});

test('frontend legacy redirects and deprecated ListItem alias are removed', () => {
  const router = read('apps/web-legacy/src/app/router/AppRouter.tsx');
  const sharedUi = read('apps/web-legacy/src/shared/ui/index.ts');
  assert.doesNotMatch(
    router,
    /LegacyTaskDetailRedirect|LegacyNovelDetailRedirect|path="\/crawl\/tasks\/:taskId"|path="\/reader\/:novelId"/
  );
  assert.doesNotMatch(sharedUi, /ListItem/);
  assert.equal(existsSync('apps/web-legacy/src/shared/ui/data-display/ListItem.tsx'), false);
});

test('known dead production artifacts are absent', () => {
  const paths = [
    'apps/web-legacy/src/entities/novel/model/useNovels.ts',
    'apps/web-legacy/src/entities/novel/ui/NovelCard.tsx',
    'apps/web-legacy/src/features/read-chapter/model/useChapterReader.ts',
    'apps/web-legacy/src/widgets/crawl-status/ui/CrawlStatusPanel.tsx',
    'apps/web-legacy/src/widgets/crawl-summary/ui/CrawlSummary.tsx',
    'apps/web-legacy/src/widgets/dashboard-stats/ui/DashboardStats.tsx',
    'apps/api-legacy/src/modules/chapters/domain/entities/chapter.entity.ts',
    'apps/api-legacy/src/modules/chapters/domain/value-objects/chapter-index.vo.ts',
    'apps/api-legacy/src/modules/crawler/application/services/chapter-cleaner.service.ts',
    'apps/api-legacy/src/modules/export/presentation/export.types.ts',
    'apps/api-legacy/src/modules/novels/domain/value-objects/novel-url.vo.ts',
    'apps/api-legacy/src/modules/task/domain/value-objects/crawl-status.vo.ts',
    'apps/api-legacy/src/shared/database/sqlite-transaction.ts',
    'apps/api-legacy/src/shared/ports/transaction.port.ts'
  ];
  for (const path of paths) assert.equal(existsSync(path), false, `${path} should be removed`);
});

test('production safety configuration has one canonical API env surface', () => {
  assert.equal(existsSync('.env.example'), false);
  assert.doesNotMatch(read('.gitignore'), /^!\.env\.example$/m);
  const apiEnv = read('apps/api-legacy/.env.example');
  const termuxEnv = read('apps/api-legacy/.env.termux.example');
  for (const content of [apiEnv, termuxEnv]) {
    assert.match(content, /^HOST=127\.0\.0\.1$/m);
    assert.match(content, /^API_CORS_ORIGINS=http:\/\/127\.0\.0\.1:5173,http:\/\/localhost:5173$/m);
    assert.match(content, /^API_REMOTE_TOKEN=$/m);
    assert.match(content, /^SOURCE_READER_LOCAL_ADMIN=true$/m);
    assert.doesNotMatch(content, /SOURCE_READER_DEFAULT_ROLES_JSON/);
  }
});

test('web build metadata has no stale dated fallback', () => {
  const vite = read('apps/web-legacy/vite.config.ts');
  assert.doesNotMatch(vite, /2026\.07\.16-frontend-contract-sync/);
  assert.match(vite, /APP_BUILD/);
  assert.match(vite, /git/);
});
