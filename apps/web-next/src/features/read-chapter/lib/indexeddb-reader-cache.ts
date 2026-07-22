import type { ReaderChapterCache, ReaderChapterIdentity } from '@novel-tool/reader-engine';
import type { Chapter } from '../../../entities/chapter';

const DB_NAME = 'novel-tool-reader';
const STORE_NAME = 'chapters';
const DB_VERSION = 4;
const MAX_DISK_CHAPTERS = 200;
const QUOTA_EXCEEDED_ERROR = 'QuotaExceededError';

let databasePromise: Promise<IDBDatabase | null> | null = null;

type CachedChapter = {
  key: string;
  novelId: string;
  chapterId: string;
  chapter: Chapter;
  accessedAt: number;
};

type TransactionResult = { ok: boolean; errorName?: string };

function cacheKey(novelId: string, chapterId: string): string {
  return `${novelId}:${chapterId}`;
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (database.objectStoreNames.contains(STORE_NAME)) {
        database.deleteObjectStore(STORE_NAME);
      }
      const store = database.createObjectStore(STORE_NAME, { keyPath: 'key' });
      store.createIndex('accessedAt', 'accessedAt');
    };
    request.onsuccess = () => {
      const database = request.result;
      const release = () => {
        databasePromise = null;
      };
      database.onversionchange = () => {
        database.close();
        release();
      };
      database.onclose = release;
      resolve(database);
    };
    request.onerror = () => {
      databasePromise = null;
      resolve(null);
    };
    request.onblocked = () => {
      databasePromise = null;
      resolve(null);
    };
  });

  return databasePromise;
}

function complete(transaction: IDBTransaction): Promise<TransactionResult> {
  return new Promise((resolve) => {
    transaction.oncomplete = () => resolve({ ok: true });
    transaction.onerror = () => resolve({ ok: false, errorName: transaction.error?.name });
    transaction.onabort = () => resolve({ ok: false, errorName: transaction.error?.name });
  });
}

async function prune(database: IDBDatabase, targetSize = MAX_DISK_CHAPTERS): Promise<void> {
  const count = await new Promise<number>((resolve) => {
    const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).count();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(0);
  });
  const removeCount = Math.max(0, count - targetSize);
  if (!removeCount) return;

  await new Promise<void>((resolve) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const index = transaction.objectStore(STORE_NAME).index('accessedAt');
    let removed = 0;
    const request = index.openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor || removed >= removeCount) return;
      cursor.delete();
      removed += 1;
      cursor.continue();
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
    transaction.onabort = () => resolve();
  });
}

export class IndexedDbReaderChapterCache implements ReaderChapterCache<Chapter> {
  async get(novelId: string, identity: ReaderChapterIdentity): Promise<Chapter | null> {
    const database = await openDatabase();
    if (!database) return null;

    const record = await new Promise<CachedChapter | null>((resolve) => {
      const request = database
        .transaction(STORE_NAME, 'readonly')
        .objectStore(STORE_NAME)
        .get(cacheKey(novelId, identity.id));
      request.onsuccess = () => resolve((request.result as CachedChapter | undefined) ?? null);
      request.onerror = () => resolve(null);
    });

    if (
      !record ||
      record.novelId !== novelId ||
      record.chapterId !== identity.id ||
      record.chapter.contentVersion !== identity.contentVersion
    ) {
      if (record) {
        const transaction = database.transaction(STORE_NAME, 'readwrite');
        transaction.objectStore(STORE_NAME).delete(record.key);
        void complete(transaction);
      }
      return null;
    }

    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put({ ...record, accessedAt: Date.now() });
    void complete(transaction);
    return record.chapter;
  }

  async set(novelId: string, chapter: Chapter): Promise<void> {
    const database = await openDatabase();
    if (!database) return;

    const record: CachedChapter = {
      key: cacheKey(novelId, chapter.id),
      novelId,
      chapterId: chapter.id,
      chapter,
      accessedAt: Date.now()
    };
    const write = async () => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(record);
      return complete(transaction);
    };

    const result = await write();
    if (!result.ok && (!result.errorName || result.errorName === QUOTA_EXCEEDED_ERROR)) {
      await prune(database, Math.floor(MAX_DISK_CHAPTERS * 0.75));
      await write();
    }
    await prune(database);
  }
}
