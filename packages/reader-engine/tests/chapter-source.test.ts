import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MemoryReaderChapterCache,
  ReaderChapterSource,
  StaleChapterListError
} from '../src/index.ts';
import type {
  ReaderChapterCache,
  ReaderChapterIdentity,
  ReaderChapterLoader
} from '../src/contracts.ts';

interface Chapter extends ReaderChapterIdentity {
  text: string;
}

function chapter(index: number, overrides: Partial<Chapter> = {}): Chapter {
  return {
    id: `chapter-${index}`,
    index,
    contentVersion: 1,
    text: `Chapter ${index}`,
    ...overrides
  };
}

class RecordingCache implements ReaderChapterCache<Chapter> {
  readonly values = new Map<string, Chapter>();
  readonly writes: string[] = [];

  async get(novelId: string, identity: ReaderChapterIdentity): Promise<Chapter | null> {
    const value = this.values.get(`${novelId}:${identity.id}`) ?? null;
    return value?.contentVersion === identity.contentVersion ? value : null;
  }

  async set(novelId: string, value: Chapter): Promise<void> {
    this.writes.push(`${novelId}:${value.id}`);
    this.values.set(`${novelId}:${value.id}`, value);
  }
}

test('chapter source checks memory, persistent cache, then loader', async () => {
  const memory = new RecordingCache();
  const persistent = new RecordingCache();
  persistent.values.set('novel-1:chapter-2', chapter(2));
  let loaderCalls = 0;
  const loader: ReaderChapterLoader<Chapter> = {
    async load(_novelId, index) {
      loaderCalls += 1;
      return chapter(index);
    }
  };
  const source = new ReaderChapterSource(memory, loader, persistent);

  await memory.set('novel-1', chapter(1));
  assert.equal((await source.load('novel-1', chapter(1), new AbortController().signal)).index, 1);
  assert.equal((await source.load('novel-1', chapter(2), new AbortController().signal)).index, 2);
  assert.equal((await source.load('novel-1', chapter(3), new AbortController().signal)).index, 3);

  assert.equal(loaderCalls, 1);
  assert.deepEqual(memory.writes, ['novel-1:chapter-1', 'novel-1:chapter-2', 'novel-1:chapter-3']);
  assert.deepEqual(persistent.writes, ['novel-1:chapter-3']);
});

test('memory chapter cache is content-version aware and bounded LRU', async () => {
  const cache = new MemoryReaderChapterCache<Chapter>(2);
  await cache.set('novel-1', chapter(1));
  await cache.set('novel-1', chapter(2));
  assert.equal((await cache.get('novel-1', chapter(1)))?.index, 1);
  await cache.set('novel-1', chapter(3));

  assert.equal(await cache.get('novel-1', chapter(2)), null);
  assert.equal((await cache.get('novel-1', chapter(1)))?.index, 1);
  assert.equal(await cache.get('novel-1', chapter(1, { contentVersion: 2 })), null);
});

test('chapter source rejects stale identities and never writes after abort', async () => {
  const memory = new RecordingCache();
  const persistent = new RecordingCache();
  const controller = new AbortController();
  const staleSource = new ReaderChapterSource<Chapter>(
    memory,
    {
      async load() {
        return chapter(10, { id: 'different-id' });
      }
    },
    persistent
  );

  await assert.rejects(
    staleSource.load('novel-1', chapter(10, { id: 'expected-id' }), controller.signal),
    StaleChapterListError
  );

  const abortedSource = new ReaderChapterSource<Chapter>(
    memory,
    {
      async load(_novelId, index) {
        controller.abort();
        return chapter(index);
      }
    },
    persistent
  );
  await assert.rejects(
    abortedSource.load('novel-1', chapter(11), controller.signal),
    (error: unknown) => error instanceof Error && error.name === 'AbortError'
  );
  assert.deepEqual(memory.writes, []);
  assert.deepEqual(persistent.writes, []);
});
