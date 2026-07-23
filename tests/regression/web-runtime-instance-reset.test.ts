import assert from 'node:assert/strict';
import test from 'node:test';

function createMemoryStorage(initial: Record<string, string>) {
  const values = new Map(Object.entries(initial));
  return {
    get length() {
      return values.size;
    },
    key(index: number) {
      return [...values.keys()][index] ?? null;
    },
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    removeItem(key: string) {
      values.delete(key);
    },
    clear() {
      values.clear();
    }
  } satisfies Storage;
}

test('runtime mismatch clears only Novel Tool browser state', async () => {
  const { synchronizeNovelToolStorage } =
    await import('../../apps/web/src/shared/storage/novel-tool-storage.ts');
  const local = createMemoryStorage({
    'novel-tool-language': 'en',
    'novel-tool-runtime-instance': 'old',
    'another-product-token': 'keep'
  });
  const session = createMemoryStorage({
    'novel-tool-scroll:reader': '10',
    'another-product-session': 'keep'
  });
  const deleted: string[] = [];
  await synchronizeNovelToolStorage({
    currentInstanceId: 'new',
    localStorage: local,
    sessionStorage: session,
    deleteDatabase: async (name: string) => deleted.push(name)
  });
  assert.equal(local.getItem('novel-tool-language'), null);
  assert.equal(local.getItem('another-product-token'), 'keep');
  assert.equal(session.getItem('another-product-session'), 'keep');
  assert.equal(local.getItem('novel-tool-runtime-instance'), 'new');
  assert.deepEqual(deleted.sort(), ['novel-tool-query-cache', 'novel-tool-reader']);
});
