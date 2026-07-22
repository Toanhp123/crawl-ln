import assert from 'node:assert/strict';
import test from 'node:test';
import { MemoryReaderChapterCache, createReaderSession } from '../src/index.ts';
import type {
  ReaderChapterIdentity,
  ReaderChapterLoader,
  ReaderSessionSnapshot
} from '../src/contracts.ts';

interface Chapter extends ReaderChapterIdentity {
  text: string;
}

function chapter(index: number): Chapter {
  return { id: `chapter-${index}`, index, contentVersion: 1, text: `Chapter ${index}` };
}

function identities(start: number, end: number): ReaderChapterIdentity[] {
  return Array.from({ length: end - start + 1 }, (_, offset) => chapter(start + offset));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function controllableLoader() {
  const pending = new Map<string, ReturnType<typeof deferred<Chapter>>>();
  const early = new Map<string, Chapter>();
  const loader: ReaderChapterLoader<Chapter> = {
    load(novelId, index, signal) {
      const item = deferred<Chapter>();
      const key = `${novelId}:${index}`;
      pending.set(key, item);
      const earlyValue = early.get(key);
      if (earlyValue) {
        early.delete(key);
        item.resolve(earlyValue);
      }
      signal.addEventListener(
        'abort',
        () => item.reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })),
        { once: true }
      );
      return item.promise;
    }
  };
  return {
    loader,
    resolve(novelId: string, index: number, value = chapter(index)) {
      const key = `${novelId}:${index}`;
      const item = pending.get(key);
      if (item) item.resolve(value);
      else early.set(key, value);
    }
  };
}

test('reader session cancels stale loads and keeps a bounded window', async () => {
  const controlled = controllableLoader();
  const session = createReaderSession({
    loader: controlled.loader,
    cache: new MemoryReaderChapterCache<Chapter>(8),
    limit: 5
  });

  const first = session.start('novel-1', identities(1, 10), 3);
  const second = session.start('novel-2', identities(20, 30), 22);
  controlled.resolve('novel-1', 3, chapter(3));
  controlled.resolve('novel-2', 22, chapter(22));
  await Promise.allSettled([first, second]);

  assert.deepEqual(
    session.snapshot().chapters.map((item) => item.index),
    [22]
  );
  assert.equal(session.snapshot().activeIndex, 22);
});

test('reader session loads adjacent chapters once and evicts around the active chapter', async () => {
  const calls: number[] = [];
  const session = createReaderSession<Chapter>({
    loader: {
      async load(_novelId, index) {
        calls.push(index);
        return chapter(index);
      }
    },
    cache: new MemoryReaderChapterCache<Chapter>(10),
    limit: 3
  });

  await session.start('novel-1', identities(1, 8), 4);
  await Promise.all([session.loadNext(), session.loadNext()]);
  session.setActiveIndex(5);
  await session.loadNext();
  await session.loadPrevious();

  const snapshot = session.snapshot();
  assert.deepEqual(
    snapshot.chapters.map((item) => item.index),
    [4, 5, 6]
  );
  assert.equal(snapshot.activeIndex, 5);
  assert.equal(calls.filter((index) => index === 5).length, 1);
  assert.equal(snapshot.hasPrevious, true);
  assert.equal(snapshot.hasNext, true);
});

test('reader session exposes loading snapshots, subscriptions, cancellation, and retry', async () => {
  let attempts = 0;
  const snapshots: ReaderSessionSnapshot<Chapter>[] = [];
  const session = createReaderSession<Chapter>({
    loader: {
      async load(_novelId, index) {
        attempts += 1;
        if (attempts === 1) throw new Error('temporary');
        return chapter(index);
      }
    },
    cache: new MemoryReaderChapterCache<Chapter>(4)
  });
  const unsubscribe = session.subscribe((snapshot) => snapshots.push(snapshot));

  await assert.rejects(session.start('novel-1', identities(1, 3), 2), /temporary/);
  assert.equal(session.snapshot().error instanceof Error, true);
  await session.retry();
  assert.deepEqual(
    session.snapshot().chapters.map((item) => item.index),
    [2]
  );
  assert.equal(session.snapshot().loading, 'idle');
  assert.ok(snapshots.some((snapshot) => snapshot.loading === 'initial'));

  session.cancel();
  assert.equal(session.snapshot().loading, 'idle');
  unsubscribe();
});
