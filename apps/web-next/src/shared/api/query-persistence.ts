import {
  dehydrate,
  hydrate,
  type DehydratedState,
  type Query,
  type QueryClient
} from '@tanstack/react-query';

const DATABASE_NAME = 'novel-tool-query-cache';
const STORE_NAME = 'cache';
const CACHE_KEY = 'react-query';
const DEFAULT_WRITE_DEBOUNCE_MS = 1000;

export interface QueryPersistenceOptions {
  buster: string;
  maxAgeMs: number;
  shouldPersist: (query: Query) => boolean;
  writeDebounceMs?: number;
}

interface PersistedQueryCache {
  buster: string;
  savedAt: number;
  state: DehydratedState;
}

function canUseIndexedDb(): boolean {
  return typeof window !== 'undefined' && 'indexedDB' in window;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
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

function createSnapshot(
  queryClient: QueryClient,
  options: QueryPersistenceOptions
): PersistedQueryCache {
  return {
    buster: options.buster,
    savedAt: Date.now(),
    state: dehydrate(queryClient, {
      shouldDehydrateQuery: (query) =>
        query.state.status === 'success' && options.shouldPersist(query)
    })
  };
}

export async function restoreQueryCache(
  queryClient: QueryClient,
  options: QueryPersistenceOptions
): Promise<void> {
  try {
    const persisted = await readCache();
    if (!persisted) return;
    const expired = Date.now() - persisted.savedAt > options.maxAgeMs;
    if (persisted.buster !== options.buster || expired) {
      await removeCache();
      return;
    }
    hydrate(queryClient, persisted.state);
  } catch (error) {
    console.warn('[query-cache-restore]', error);
  }
}

export function startQueryCachePersistence(
  queryClient: QueryClient,
  options: QueryPersistenceOptions
): () => void {
  if (!canUseIndexedDb()) return () => undefined;

  let timer: number | undefined;
  let disposed = false;
  const scheduleWrite = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (disposed) return;
      void writeCache(createSnapshot(queryClient, options)).catch((error) => {
        console.warn('[query-cache-persist]', error);
      });
    }, options.writeDebounceMs ?? DEFAULT_WRITE_DEBOUNCE_MS);
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
