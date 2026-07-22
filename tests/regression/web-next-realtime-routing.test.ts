import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import test from 'node:test';
import type { QueryClient } from '@tanstack/react-query';
import type { RealtimeEvent } from '@novel-tool/shared';

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

function event(input: Partial<RealtimeEvent> = {}): RealtimeEvent {
  return {
    id: 'event-1',
    type: 'data.changed',
    resources: ['tasks'],
    reason: 'task.updated',
    occurredAt: '2026-07-22T00:00:00.000Z',
    ...input
  };
}

function registrySpy(calls: string[]) {
  const call = (value: string) => async () => {
    calls.push(value);
  };
  return {
    tasks: {
      invalidateAll: call('tasks:all'),
      invalidateDetail: (_client: QueryClient, id: string) => call(`tasks:detail:${id}`)(),
      invalidateForNovel: (_client: QueryClient, id: string) => call(`tasks:novel:${id}`)()
    },
    novels: {
      invalidateList: call('novels:list'),
      invalidateStats: call('novels:stats'),
      invalidateDetail: (_client: QueryClient, id: string) => call(`novels:detail:${id}`)()
    },
    scheduler: {
      invalidateStatus: call('scheduler:status'),
      invalidateDiagnostics: call('scheduler:diagnostics'),
      invalidateNovelDiagnostics: (_client: QueryClient, id: string) =>
        call(`scheduler:novel:${id}`)()
    },
    search: { invalidateAll: call('search:all') },
    sourceReader: { invalidateAll: call('source-reader:all') }
  };
}

test('realtime resources call only public entity invalidation adapters', async () => {
  const { routeRealtimeEvent } = await import('../../apps/web/src/app/realtime/event-router.ts');
  const calls: string[] = [];
  const registry = registrySpy(calls);

  await routeRealtimeEvent(
    event({ resources: ['tasks', 'novels'], taskId: 'task-1', novelId: 'novel-1' }),
    registry,
    {} as QueryClient
  );

  assert.deepEqual(calls, [
    'tasks:all',
    'tasks:detail:task-1',
    'tasks:novel:novel-1',
    'novels:list',
    'novels:stats',
    'novels:detail:novel-1'
  ]);
});

test('scheduler, search, plugins, and all use their app-owned public adapters', async () => {
  const { routeRealtimeEvent } = await import('../../apps/web/src/app/realtime/event-router.ts');
  const calls: string[] = [];
  const registry = registrySpy(calls);
  const queryCalls: unknown[] = [];
  const client = {
    invalidateQueries(filters?: unknown) {
      queryCalls.push(filters ?? 'all');
      return Promise.resolve();
    }
  } as unknown as QueryClient;

  await routeRealtimeEvent(
    event({ resources: ['scheduler', 'search', 'plugins'], novelId: 'novel-2' }),
    registry,
    client
  );
  assert.deepEqual(calls, [
    'scheduler:status',
    'scheduler:diagnostics',
    'scheduler:novel:novel-2',
    'search:all',
    'source-reader:all'
  ]);

  calls.length = 0;
  await routeRealtimeEvent(
    event({ resources: ['all', 'tasks'], taskId: 'task-2' }),
    registry,
    client
  );
  assert.deepEqual(calls, []);
  assert.deepEqual(queryCalls, ['all']);
});

test('source reader aggregate invalidates all four read-only entity collections', async () => {
  const { createRealtimeInvalidationRegistry } =
    await import('../../apps/web/src/app/realtime/event-router.ts');
  const registry = createRealtimeInvalidationRegistry();
  const keys: readonly unknown[][] = [];
  const client = {
    invalidateQueries({ queryKey }: { queryKey: readonly unknown[] }) {
      keys.push(queryKey);
      return Promise.resolve();
    }
  } as unknown as QueryClient;

  await registry.sourceReader.invalidateAll(client);
  assert.deepEqual(keys.map((key) => key.join(':')).sort(), [
    'source-reader:auth-challenges',
    'source-reader:credentials',
    'source-reader:network-profiles',
    'source-reader:plugins'
  ]);
});

test('realtime parsing validates the frozen event schema and exposes only safe error metadata', async () => {
  const { decodeRealtimeEvent, getRealtimeErrorMetadata } =
    await import('../../apps/web/src/app/realtime/event-router.ts');
  const valid = event({ resources: ['plugins', 'search'], chapterIndex: 3 });
  assert.deepEqual(decodeRealtimeEvent(valid), valid);

  const submitted = { id: 'event-secret', type: 'data.changed', resources: ['secrets'] };
  let failure: unknown;
  try {
    decodeRealtimeEvent(submitted);
  } catch (error) {
    failure = error;
  }
  assert.ok(failure);
  assert.deepEqual(getRealtimeErrorMetadata(failure), {
    eventId: 'event-secret',
    errorClass: 'RealtimeEventParseError'
  });
  assert.doesNotMatch(
    JSON.stringify(getRealtimeErrorMetadata(failure)),
    /secrets|submitted|payload/i
  );
});

test('shared realtime remains generic and app owns batching plus browser lifecycle', async () => {
  const shared = await readTree('apps/web/src/shared/realtime');
  assert.doesNotMatch(shared, /novels|tasks|scheduler|plugins|search|sourceReader/i);

  const provider = await readFile('apps/web/src/app/realtime/RealtimeProvider.tsx', 'utf8');
  assert.match(provider, /createBatchQueue/);
  assert.match(provider, /windowMs:\s*150/);
  assert.match(provider, /createEventStream/);
  assert.match(provider, /\/api\/events/);
  assert.match(provider, /invalidateQueries\(\{\s*type:\s*['"]active['"]\s*\}\)/s);
  assert.match(provider, /visibilitychange/);
  assert.doesNotMatch(
    provider,
    /message\.data|JSON\.stringify\([^)]*error|console\.warn\(\s*['"]\[realtime-event\]['"]\s*,\s*error\s*\)/s
  );
  assert.match(provider, /console\.warn\([^)]*getRealtimeErrorMetadata\(error\)/s);

  const appProviders = await readFile('apps/web/src/app/providers/AppProviders.tsx', 'utf8');
  assert.match(appProviders, /QueryClientProvider/);
  assert.match(appProviders, /RealtimeProvider/);
});
