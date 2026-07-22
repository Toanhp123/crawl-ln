import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const controllers = [
  'apps/api-legacy/src/modules/novels/presentation/controllers/novel.controller.ts',
  'apps/api-legacy/src/modules/chapters/presentation/controllers/chapter.controller.ts',
  'apps/api-legacy/src/modules/task/presentation/controllers/task.controller.ts',
  'apps/api-legacy/src/modules/crawler/presentation/controllers/crawl-job.controller.ts'
];

test('entity-facing controllers map application results through presentation mappers', () => {
  for (const path of controllers) {
    const source = readFileSync(path, 'utf8');
    assert.match(source, /presentation\/mappers|\.\.\/mappers\//, path);
    assert.doesNotMatch(source, /(?:ok|accepted)\(res,\s*await\s+this\.[\w]+\.execute\(/, path);
  }
});
