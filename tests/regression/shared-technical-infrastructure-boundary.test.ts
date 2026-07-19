import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const root = new URL('../../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');

test('shared technical adapters are not owned by crawler', () => {
  assert.equal(
    existsSync(
      new URL('apps/api/src/modules/crawler/infrastructure/http/axios-http-client.adapter.ts', root)
    ),
    false
  );
  assert.equal(
    existsSync(
      new URL(
        'apps/api/src/modules/crawler/infrastructure/parser/cheerio-html-parser.adapter.ts',
        root
      )
    ),
    false
  );
  assert.equal(
    existsSync(
      new URL('apps/api/src/shared/infrastructure/http/axios-http-client.adapter.ts', root)
    ),
    true
  );
  assert.equal(
    existsSync(
      new URL('apps/api/src/shared/infrastructure/html/cheerio-html-parser.adapter.ts', root)
    ),
    true
  );
});

test('backend public facades expose interfaces instead of concrete services', () => {
  const files = [
    'apps/api/src/modules/chapters/public/chapters.api.ts',
    'apps/api/src/modules/crawler/public/crawler.api.ts',
    'apps/api/src/modules/novels/public/novels.api.ts',
    'apps/api/src/modules/scheduler/public/scheduler.api.ts',
    'apps/api/src/modules/task/public/tasks.api.ts'
  ];

  for (const file of files) {
    const source = read(file);
    assert.doesNotMatch(source, /application\/(?:services|use-cases)\//, file);
  }
});
