import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const file = (path: string) => new URL(path, root);

async function exists(path: string): Promise<boolean> {
  try {
    await access(file(path));
    return true;
  } catch {
    return false;
  }
}

test('crawl persistence is coordinated outside crawler infrastructure and writes through module-owned adapters', async () => {
  assert.equal(
    await exists(
      'apps/api/src/modules/crawler/infrastructure/sqlite/crawl-persistence-sqlite.adapter.ts'
    ),
    false,
    'crawler must not own a SQLite adapter that writes chapters, tasks, and novels'
  );

  const crawlerModule = await readFile(
    file('apps/api/src/shared/container/modules/crawler.module.ts'),
    'utf8'
  );
  assert.doesNotMatch(crawlerModule, /CrawlPersistenceSqliteAdapter/);
  assert.match(crawlerModule, /CrawlRunSqliteUnitOfWork/);
  assert.match(crawlerModule, /chapters\.persistence\.crawlWriter/);
  assert.match(crawlerModule, /tasks\.persistence\.crawlWriter/);
  assert.match(crawlerModule, /novels\.persistence\.crawlWriter/);

  const coordinator = await readFile(
    file('apps/api/src/shared/database/crawl-run-sqlite.unit-of-work.ts'),
    'utf8'
  );
  assert.match(coordinator, /implements CrawlPersistencePort/);
  assert.doesNotMatch(coordinator, /UPDATE\s+(?:chapters|crawl_tasks|novels)/i);
});
