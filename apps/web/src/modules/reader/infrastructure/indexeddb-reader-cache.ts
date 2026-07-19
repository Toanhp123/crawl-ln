import type { Chapter } from '@novel-tool/shared';
import type { ReaderChapterCache } from '../application/reader-chapter-source';

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

function key(novelId: string, chapterId: string) {
  return `${novelId}:${chapterId}`;
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (db.objectStoreNames.contains(STORE_NAME)) db.deleteObjectStore(STORE_NAME);
      const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      store.createIndex('accessedAt', 'accessedAt');
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        databasePromise = null;
      };
      db.onclose = () => {
        databasePromise = null;
      };
      resolve(db);
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

type TransactionResult = { ok: boolean; errorName?: string };

function complete(transaction: IDBTransaction): Promise<TransactionResult> {
  return new Promise((resolve) => {
    transaction.oncomplete = () => resolve({ ok: true });
    transaction.onerror = () => resolve({ ok: false, errorName: transaction.error?.name });
    transaction.onabort = () => resolve({ ok: false, errorName: transaction.error?.name });
  });
}

async function prune(db: IDBDatabase, targetSize = MAX_DISK_CHAPTERS): Promise<void> {
  const count = await new Promise<number>((resolve) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).count();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(0);
  });
  const removeCount = Math.max(0, count - targetSize);
  if (!removeCount) return;
  await new Promise<void>((resolve) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
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

export class IndexedDbReaderChapterCache implements ReaderChapterCache {
  async get(novelId: string, chapterId: string, contentVersion: number): Promise<Chapter | null> {
    const db = await openDatabase();
    if (!db) return null;
    const record = await new Promise<CachedChapter | null>((resolve) => {
      const request = db
        .transaction(STORE_NAME, 'readonly')
        .objectStore(STORE_NAME)
        .get(key(novelId, chapterId));
      request.onsuccess = () => resolve((request.result as CachedChapter | undefined) ?? null);
      request.onerror = () => resolve(null);
    });
    if (!record || record.chapter.contentVersion !== contentVersion) {
      if (record) {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(record.key);
        void complete(tx);
      }
      return null;
    }
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put({ ...record, accessedAt: Date.now() });
    void complete(transaction);
    return record.chapter;
  }

  async set(novelId: string, chapter: Chapter): Promise<void> {
    const db = await openDatabase();
    if (!db) return;
    const record: CachedChapter = {
      key: key(novelId, chapter.id),
      novelId,
      chapterId: chapter.id,
      chapter,
      accessedAt: Date.now()
    };
    const write = async () => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(record);
      return complete(transaction);
    };
    const written = await write();
    if (!written.ok) {
      if (!written.errorName || written.errorName === QUOTA_EXCEEDED_ERROR) {
        await prune(db, Math.floor(MAX_DISK_CHAPTERS * 0.75));
        await write();
      }
    }
    await prune(db);
  }
}
