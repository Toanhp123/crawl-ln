import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import test from 'node:test';

const entityRoot = 'apps/web-next/src/entities';

async function readTree(directory: string, root = directory): Promise<string> {
  const entries = await readdir(directory, { withFileTypes: true });
  const parts: string[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const target = join(directory, entry.name);
    if (entry.isDirectory()) parts.push(await readTree(target, root));
    else parts.push(`\n/* ${relative(root, target)} */\n${await readFile(target, 'utf8')}`);
  }
  return parts.join('\n');
}

test('core entity public APIs export reads, keys, invalidation adapters, and reusable UI', async () => {
  const novel = await import('../../apps/web-next/src/entities/novel/index.ts');
  const chapter = await import('../../apps/web-next/src/entities/chapter/index.ts');
  const task = await import('../../apps/web-next/src/entities/task/index.ts');
  const scheduler = await import('../../apps/web-next/src/entities/scheduler/index.ts');
  const search = await import('../../apps/web-next/src/entities/search/index.ts');

  assert.equal(typeof novel.useNovels, 'function');
  assert.equal(typeof novel.useNovel, 'function');
  assert.equal(typeof novel.useNovelStats, 'function');
  assert.deepEqual(novel.novelKeys.detail('novel-1'), ['novels', 'detail', 'novel-1']);
  assert.equal(typeof novel.novelInvalidation.invalidateStats, 'function');
  assert.equal(typeof novel.NovelCover, 'function');
  assert.equal(typeof novel.NovelLibraryCard, 'function');

  assert.equal(typeof chapter.getChapter, 'function');
  assert.equal(typeof chapter.useChapter, 'function');
  assert.deepEqual(chapter.chapterKeys.detail('novel-1', 7), ['chapters', 'detail', 'novel-1', 7]);
  assert.equal(typeof chapter.ChapterList, 'function');
  assert.equal(typeof chapter.ChapterReader, 'function');
  assert.equal(chapter.paragraphDomId(7, 2), 'chapter-7-paragraph-3');

  assert.equal(typeof task.useTasks, 'function');
  assert.equal(typeof task.useTask, 'function');
  assert.equal(typeof task.useTaskEvents, 'function');
  assert.equal(typeof task.useTaskSummary, 'function');
  assert.equal(typeof task.useNovelTask, 'function');
  assert.deepEqual(task.taskKeys.novel('novel-1'), ['tasks', 'novel', 'novel-1']);
  assert.equal(typeof task.taskInvalidation.invalidateNovel, 'function');
  assert.equal(typeof task.TaskProgress, 'function');

  assert.equal(typeof scheduler.useSchedulerStatus, 'function');
  assert.equal(typeof scheduler.useNovelUpdateDiagnostics, 'function');
  assert.deepEqual(scheduler.schedulerKeys.diagnostics('novel-1'), [
    'scheduler',
    'diagnostics',
    'novel-1'
  ]);
  assert.equal(typeof scheduler.schedulerInvalidation.invalidateStatus, 'function');

  assert.equal(typeof search.useLibrarySearch, 'function');
  assert.deepEqual(search.searchKeys.results({ q: 'hero', type: 'chapter', offset: 20 }), [
    'search',
    'results',
    { q: 'hero', type: 'chapter', offset: 20 }
  ]);
  assert.equal(typeof search.searchInvalidation.invalidateAll, 'function');
});

test('entity APIs contain GET reads but no product writes', async () => {
  const source = await readTree(entityRoot);
  assert.doesNotMatch(
    source,
    /useMutation|method:\s*['"]POST|method:\s*['"]PUT|method:\s*['"]PATCH|method:\s*['"]DELETE/
  );
});

test('entity read clients preserve current endpoint and query contracts', async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(input), init });
    return new Response(JSON.stringify({ data: {}, error: null }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  }) as typeof fetch;

  try {
    const novel = await import('../../apps/web-next/src/entities/novel/index.ts');
    const chapter = await import('../../apps/web-next/src/entities/chapter/index.ts');
    const task = await import('../../apps/web-next/src/entities/task/index.ts');
    const scheduler = await import('../../apps/web-next/src/entities/scheduler/index.ts');
    const search = await import('../../apps/web-next/src/entities/search/index.ts');

    await novel.listNovels({
      q: 'a b',
      status: 'active',
      sort: 'title',
      limit: 10,
      offset: 20,
      ids: ['n-1', 'n-2'],
      excludeIds: ['n-3'],
      readingOrder: ['n-2', 'n-1']
    });
    await novel.getNovel('novel/a');
    await novel.getNovelStats();
    await chapter.getChapter('novel/a', 4);
    await task.listTasks();
    await task.getTask('task/a');
    await task.getTaskEvents('task/a');
    await task.getTaskSummary();
    await task.getNovelTask('novel/a');
    await scheduler.getSchedulerStatus();
    await scheduler.getNovelUpdateDiagnostics('novel/a');
    await search.searchLibrary({
      q: 'a b',
      type: 'chapter',
      novelId: 'novel/a',
      limit: 8,
      offset: 16
    });
  } finally {
    globalThis.fetch = previousFetch;
  }

  assert.equal(requests.length, 12);
  assert.ok(
    requests[0]?.url.endsWith(
      '/api/novels?q=a+b&status=active&sort=title&limit=10&offset=20&ids=n-1%2Cn-2&excludeIds=n-3&readingOrder=n-2%2Cn-1'
    )
  );
  assert.ok(requests[1]?.url.endsWith('/api/novels/novel%2Fa'));
  assert.ok(requests[2]?.url.endsWith('/api/novels/stats'));
  assert.ok(requests[3]?.url.endsWith('/api/novels/novel%2Fa/chapters/4'));
  assert.ok(requests[4]?.url.endsWith('/api/tasks'));
  assert.ok(requests[5]?.url.endsWith('/api/tasks/task%2Fa'));
  assert.ok(requests[6]?.url.endsWith('/api/crawl/jobs/task%2Fa/events?limit=100'));
  assert.ok(requests[7]?.url.endsWith('/api/tasks/summary'));
  assert.ok(requests[8]?.url.endsWith('/api/novels/novel%2Fa/task'));
  assert.ok(requests[9]?.url.endsWith('/api/scheduler/status'));
  assert.ok(requests[10]?.url.endsWith('/api/novels/novel%2Fa/update-diagnostics'));
  assert.ok(
    requests[11]?.url.endsWith('/api/search?q=a+b&type=chapter&limit=8&offset=16&novelId=novel%2Fa')
  );
  for (const request of requests) assert.equal(request.init?.method, undefined);
});

test('entity invalidation adapters target only their owned query roots', async () => {
  const novel = await import('../../apps/web-next/src/entities/novel/index.ts');
  const task = await import('../../apps/web-next/src/entities/task/index.ts');
  const scheduler = await import('../../apps/web-next/src/entities/scheduler/index.ts');
  const search = await import('../../apps/web-next/src/entities/search/index.ts');
  const calls: Array<readonly unknown[]> = [];
  const client = {
    invalidateQueries({ queryKey }: { queryKey: readonly unknown[] }) {
      calls.push(queryKey);
      return Promise.resolve();
    }
  };

  await novel.novelInvalidation.invalidateList(client as never);
  await novel.novelInvalidation.invalidateDetail(client as never, 'novel-1');
  await novel.novelInvalidation.invalidateStats(client as never);
  await task.taskInvalidation.invalidateAll(client as never);
  await task.taskInvalidation.invalidateDetail(client as never, 'task-1');
  await task.taskInvalidation.invalidateNovel(client as never, 'novel-1');
  await scheduler.schedulerInvalidation.invalidateStatus(client as never);
  await scheduler.schedulerInvalidation.invalidateNovelDiagnostics(client as never, 'novel-1');
  await search.searchInvalidation.invalidateAll(client as never);

  assert.deepEqual(calls, [
    ['novels', 'list'],
    ['novels', 'detail', 'novel-1'],
    ['novels', 'stats'],
    ['tasks'],
    ['tasks', 'detail', 'task-1'],
    ['tasks', 'novel', 'novel-1'],
    ['scheduler', 'status'],
    ['scheduler', 'diagnostics', 'novel-1'],
    ['search']
  ]);
});
