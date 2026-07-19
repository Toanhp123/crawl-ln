import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');

test('novel metadata persists author and cover URL through domain and sqlite', () => {
  const model = read('apps/api/src/modules/novels/domain/models/novel.ts');
  const analyze = read(
    'apps/api/src/modules/novels/application/use-cases/analyze-novel.usecase.ts'
  );
  const sqlite = read(
    'apps/api/src/modules/novels/infrastructure/sqlite/novel-analysis-sqlite.adapter.ts'
  );
  assert.match(model, /author\?: string/);
  assert.match(model, /coverUrl\?: string/);
  assert.match(analyze, /author: result\.author/);
  assert.match(analyze, /coverUrl: result\.coverUrl/);
  assert.match(sqlite, /author, cover_url/);
});

test('activity groups active, queued, and terminal crawl work', () => {
  const model = read('apps/web/src/pages/activity/model/useActivityPage.ts');
  assert.match(model, /running:/);
  assert.match(model, /queued:/);
  assert.match(model, /recent:/);
  assert.match(model, /completed.*failed.*cancelled/);
});

test('crawl job plans every pending chapter instead of maxChaptersPerRun slices', () => {
  const createJob = read(
    'apps/api/src/modules/crawler/application/use-cases/create-crawl-job.usecase.ts'
  );
  const runner = read(
    'apps/api/src/modules/crawler/application/services/crawl-job-runner.service.ts'
  );
  assert.doesNotMatch(createJob, /slice\(0, this\.config\.maxChaptersPerRun\)/);
  assert.doesNotMatch(runner, /slice\(0, this\.config\.maxChaptersPerRun\)/);
});
