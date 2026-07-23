import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import test from 'node:test';

const TEST_ORIGIN = 'http://novel-tool.test';

function requestPath(input: string | URL | Request): string {
  const value = input instanceof Request ? input.url : String(input);
  return new URL(value, TEST_ORIGIN).pathname;
}

const featureRoot = 'apps/web/src/features';
const slices = [
  'add-novel',
  'crawl-novel',
  'update-novel',
  'delete-novel',
  'pause-task',
  'resume-task',
  'cancel-task'
] as const;

async function readTree(
  directory: string,
  root = directory,
  excluded = new Set<string>()
): Promise<string> {
  const entries = await readdir(directory, { withFileTypes: true });
  const parts: string[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const target = join(directory, entry.name);
    const relativePath = relative(root, target);
    if (excluded.has(relativePath)) continue;
    if (entry.isDirectory()) parts.push(await readTree(target, root, excluded));
    else parts.push(`\n/* ${relativePath} */\n${await readFile(target, 'utf8')}`);
  }
  return parts.join('\n');
}

test('add novel analyzes before crawling and invalidates novel and task roots', async () => {
  const addNovel = await import('../../apps/web/src/features/add-novel/index.ts');
  const calls: string[] = [];
  const workflow = addNovel.createAddNovelWorkflow({
    analyze: async (url: string) => {
      calls.push(`analyze:${url}`);
      return { novel: { id: 'novel-1' }, chapters: [] } as never;
    },
    crawl: async (novelId: string) => {
      calls.push(`crawl:${novelId}`);
      return { id: 'task-1', novelId } as never;
    }
  });

  const result = await workflow.execute('  https://example.test/book  ');
  assert.deepEqual(calls, ['analyze:https://example.test/book', 'crawl:novel-1']);
  assert.equal(result.novelId, 'novel-1');
  assert.equal(result.taskId, 'task-1');
  assert.equal(
    addNovel.normalizeNovelUrl('https://example.test/book'),
    'https://example.test/book'
  );
  assert.throws(() => addNovel.normalizeNovelUrl('file:///tmp/book'), /http or https/i);
  assert.equal(
    await addNovel.readClipboardText({ readText: async () => '  https://paste.test/book  ' }),
    'https://paste.test/book'
  );
  assert.equal(addNovel.canCloseAddNovelOverlay(false), true);
  assert.equal(addNovel.canCloseAddNovelOverlay(true), false);
  assert.equal(addNovel.addNovelCatalogs.en['addNovel.submit'], 'Analyze and crawl');

  const invalidated: Array<readonly unknown[]> = [];
  const client = {
    invalidateQueries({ queryKey }: { queryKey: readonly unknown[] }) {
      invalidated.push(queryKey);
      return Promise.resolve();
    }
  };
  await addNovel.invalidateAddNovelResult(client as never, result);
  assert.deepEqual(invalidated, [['novels'], ['tasks'], ['tasks', 'novel', 'novel-1']]);
});

test('library and task action clients preserve current mutation contracts', async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(input), init });
    const path = requestPath(input);
    if (path === '/api/novels/novel%2Fdelete') return new Response(null, { status: 204 });
    const data =
      path === '/api/novels/analyze'
        ? {
            id: 'novel-1',
            title: 'Novel',
            sourceUrl: 'https://example.test/book',
            sourceName: 'Example',
            status: 'active',
            createdAt: '',
            updatedAt: '',
            chapters: []
          }
        : path.endsWith('/update')
          ? {
              novel: { novel: { id: 'novel/update' }, chapters: [] },
              newChapterCount: 0,
              pendingChapterCount: 0,
              task: null
            }
          : { id: 'task-1', novelId: 'novel/1' };
    return new Response(JSON.stringify({ data, error: null }), {
      status:
        path === '/api/crawl/jobs' || path.endsWith('/resume') || path.endsWith('/update')
          ? 202
          : 200,
      headers: { 'content-type': 'application/json' }
    });
  }) as typeof fetch;

  try {
    const { analyzeNovel } =
      await import('../../apps/web/src/features/add-novel/api/analyze-novel.ts');
    const { crawlNovel } =
      await import('../../apps/web/src/features/crawl-novel/api/crawl-novel.ts');
    const { updateNovel } =
      await import('../../apps/web/src/features/update-novel/api/update-novel.ts');
    const { deleteNovel } =
      await import('../../apps/web/src/features/delete-novel/api/delete-novel.ts');
    const { pauseTask } = await import('../../apps/web/src/features/pause-task/api/pause-task.ts');
    const { resumeTask } =
      await import('../../apps/web/src/features/resume-task/api/resume-task.ts');
    const { cancelTask } =
      await import('../../apps/web/src/features/cancel-task/api/cancel-task.ts');

    const detail = await analyzeNovel('https://example.test/book');
    assert.equal(detail.novel.id, 'novel-1');
    await crawlNovel('novel/1');
    await updateNovel('novel/update');
    await deleteNovel('novel/delete');
    await pauseTask('task/1');
    await resumeTask('task/1');
    await cancelTask('task/1');
  } finally {
    globalThis.fetch = previousFetch;
  }

  assert.deepEqual(
    requests.map((request) => ({
      path: requestPath(request.url),
      method: request.init?.method,
      body: request.init?.body
    })),
    [
      {
        path: '/api/novels/analyze',
        method: 'POST',
        body: JSON.stringify({ url: 'https://example.test/book' })
      },
      {
        path: '/api/crawl/jobs',
        method: 'POST',
        body: JSON.stringify({ novelId: 'novel/1' })
      },
      { path: '/api/novels/novel%2Fupdate/update', method: 'POST', body: undefined },
      { path: '/api/novels/novel%2Fdelete', method: 'DELETE', body: undefined },
      { path: '/api/crawl/jobs/task%2F1/pause', method: 'POST', body: undefined },
      { path: '/api/crawl/jobs/task%2F1/resume', method: 'POST', body: undefined },
      { path: '/api/crawl/jobs/task%2F1', method: 'DELETE', body: undefined }
    ]
  );
});

test('feature public APIs expose only action workflows, hooks, providers, and UI', async () => {
  const addNovel = await import('../../apps/web/src/features/add-novel/index.ts');
  const crawlNovel = await import('../../apps/web/src/features/crawl-novel/index.ts');
  const updateNovel = await import('../../apps/web/src/features/update-novel/index.ts');
  const deleteNovel = await import('../../apps/web/src/features/delete-novel/index.ts');
  const pauseTask = await import('../../apps/web/src/features/pause-task/index.ts');
  const resumeTask = await import('../../apps/web/src/features/resume-task/index.ts');
  const cancelTask = await import('../../apps/web/src/features/cancel-task/index.ts');

  assert.equal(typeof addNovel.createAddNovelWorkflow, 'function');
  assert.equal(typeof addNovel.useAddNovel, 'function');
  assert.equal(typeof addNovel.AddNovelProvider, 'function');
  assert.equal(typeof addNovel.AddNovelOverlay, 'function');
  assert.equal(typeof addNovel.useAddNovelOverlay, 'function');
  assert.equal(typeof crawlNovel.useCrawlNovel, 'function');
  assert.equal(typeof crawlNovel.CrawlNovelButton, 'function');
  assert.equal(typeof updateNovel.useUpdateNovel, 'function');
  assert.equal(typeof updateNovel.UpdateNovelButton, 'function');
  assert.equal(typeof deleteNovel.useDeleteNovel, 'function');
  assert.equal(typeof deleteNovel.DeleteNovelButton, 'function');
  assert.equal(typeof pauseTask.usePauseTask, 'function');
  assert.equal(typeof pauseTask.PauseTaskButton, 'function');
  assert.equal(typeof resumeTask.useResumeTask, 'function');
  assert.equal(typeof resumeTask.ResumeTaskButton, 'function');
  assert.equal(typeof cancelTask.useCancelTask, 'function');
  assert.equal(typeof cancelTask.CancelTaskButton, 'function');

  for (const slice of slices) {
    assert.equal((await stat(join(featureRoot, slice, 'index.ts'))).isFile(), true);
  }
});

test('app, pages, and entities do not own library or task mutations', async () => {
  const upperLayers = [
    await readTree('apps/web/src/app', undefined, new Set([join('i18n', 'catalog.ts')])),
    await readTree('apps/web/src/pages'),
    await readTree('apps/web/src/entities')
  ].join('\n');
  assert.doesNotMatch(
    upperLayers,
    /useMutation|analyzeNovel|crawlNovel|updateNovel|deleteNovel|pauseTask|resumeTask|cancelTask|method:\s*['"](?:POST|PUT|PATCH|DELETE)/
  );

  const source = await readTree(featureRoot);
  assert.doesNotMatch(
    source,
    /features\/(?:add-novel|crawl-novel|update-novel|delete-novel|pause-task|resume-task|cancel-task)\//
  );
  assert.match(source, /novelInvalidation/);
  assert.match(source, /taskInvalidation/);
});
