import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? files(path) : path.endsWith('.ts') ? [path] : [];
  });
}

test('composition root delegates task and novel state transitions to module-owned services', () => {
  const crawlerModule = readFileSync(
    'apps/api/src/shared/container/modules/crawler.module.ts',
    'utf8'
  );
  assert.doesNotMatch(crawlerModule, /CrawlTaskEntity|NovelEntity/);
  assert.match(crawlerModule, /tasks\.api\.lifecycle/);
  assert.match(crawlerModule, /novels\.api\.crawlLifecycle/);
});

test('feature modules do not import another bounded context directly', () => {
  const root = 'apps/api/src/modules';
  for (const path of files(root)) {
    const sourceModule = path.slice(root.length + 1).split(/[\\/]/)[0];
    const source = readFileSync(path, 'utf8');
    const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1]);
    for (const target of imports) {
      if (!target.startsWith('.')) continue;
      assert.doesNotMatch(target, new RegExp(`modules/(?!${sourceModule}/)`), `${path}: ${target}`);
    }
  }
});

test('database transactions expose synchronous bodies only', () => {
  const database = readFileSync('apps/api/src/shared/database/sqlite.ts', 'utf8');
  assert.doesNotMatch(database, /async transaction</);
  assert.match(database, /transactionSync<T>\(work: \(\) => T\)/);
});

test('backup compatibility uses the migration registry schema version', () => {
  const archive = readFileSync(
    'apps/api/src/modules/backup/infrastructure/archive/jszip-backup.archive.ts',
    'utf8'
  );
  assert.match(archive, /CURRENT_SCHEMA_VERSION.*shared\/database\/sqlite/);
  assert.doesNotMatch(archive, /const CURRENT_SCHEMA_VERSION\s*=\s*\d+/);
});

test('chapter reads are owned by the chapters module and consumed through a novels port', () => {
  const repository = readFileSync(
    'apps/api/src/modules/novels/domain/repositories/novel.repository.ts',
    'utf8'
  );
  const detailQuery = readFileSync(
    'apps/api/src/modules/novels/application/services/novel-detail-query.service.ts',
    'utf8'
  );
  const chapterModule = readFileSync(
    'apps/api/src/shared/container/modules/chapters.module.ts',
    'utf8'
  );

  assert.doesNotMatch(repository, /findChapter|updateChapter/);
  assert.match(detailQuery, /NovelChapterPort/);
  assert.match(detailQuery, /chapters\.listByNovelId/);
  assert.match(chapterModule, /const api = \{ catalog \} satisfies ChaptersApi/);
});
