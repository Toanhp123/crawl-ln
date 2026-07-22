import { dehydrate, hydrate, type DehydratedState, type QueryClient } from '@tanstack/react-query';

const DATABASE_NAME = 'novel-tool-query-cache';
const STORE_NAME = 'cache';
const CACHE_KEY = 'react-query';
const CACHE_BUSTER = 'phase3-v1';
const MAX_CACHE_AGE = 12 * 60 * 60 * 1000;
const WRITE_DEBOUNCE_MS = 1000;

interface PersistedQueryCache {
  buster: string;
  savedAt: number;
  state: DehydratedState;
}

function canUseIndexedDb() {
  return typeof window !== 'undefined' && 'indexedDB' in window;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readCache(): Promise<PersistedQueryCache | undefined> {
  if (!canUseIndexedDb()) return undefined;
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).get(CACHE_KEY);
      request.onsuccess = () => resolve(request.result as PersistedQueryCache | undefined);
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}

async function writeCache(cache: PersistedQueryCache): Promise<void> {
  if (!canUseIndexedDb()) return;
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(cache, CACHE_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

async function removeCache(): Promise<void> {
  if (!canUseIndexedDb()) return;
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).delete(CACHE_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

function isLightweightQuery(queryKey: readonly unknown[]) {
  const [root, scope] = queryKey;
  return (
    (root === 'novels' && scope === 'list') ||
    (root === 'tasks' && scope === 'summary') ||
    (root === 'scheduler' && scope === 'status') ||
    (root === 'plugins' && scope === 'sources')
  );
}

function createSnapshot(queryClient: QueryClient): PersistedQueryCache {
  return {
    buster: CACHE_BUSTER,
    savedAt: Date.now(),
    state: dehydrate(queryClient, {
      shouldDehydrateQuery: (query) =>
        query.state.status === 'success' && isLightweightQuery(query.queryKey)
    })
  };
}

export async function restoreQueryCache(queryClient: QueryClient): Promise<void> {
  try {
    const persisted = await readCache();
    if (!persisted) return;
    const expired = Date.now() - persisted.savedAt > MAX_CACHE_AGE;
    if (persisted.buster !== CACHE_BUSTER || expired) {
      await removeCache();
      return;
    }
    hydrate(queryClient, persisted.state);
  } catch (error) {
    console.warn('[query-cache-restore]', error);
  }
}

export function startQueryCachePersistence(queryClient: QueryClient): () => void {
  if (!canUseIndexedDb()) return () => undefined;

  let timer: number | undefined;
  let disposed = false;
  const scheduleWrite = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (disposed) return;
      void writeCache(createSnapshot(queryClient)).catch((error) => {
        console.warn('[query-cache-persist]', error);
      });
    }, WRITE_DEBOUNCE_MS);
  };

  const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
    if (event?.type === 'updated' || event?.type === 'removed') scheduleWrite();
  });

  return () => {
    disposed = true;
    window.clearTimeout(timer);
    unsubscribe();
  };
}
