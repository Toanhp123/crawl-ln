export const NOVEL_TOOL_STORAGE_PREFIX = 'novel-tool-';
export const NOVEL_TOOL_DATABASES = ['novel-tool-query-cache', 'novel-tool-reader'] as const;
export const RUNTIME_INSTANCE_KEY = 'novel-tool-runtime-instance';

function ownedKeys(storage: Storage): string[] {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith(NOVEL_TOOL_STORAGE_PREFIX)) keys.push(key);
  }
  return keys;
}

function deleteIndexedDatabase(name: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onblocked = () => reject(new Error(`IndexedDB deletion was blocked: ${name}`));
    request.onerror = () =>
      reject(request.error ?? new Error(`IndexedDB deletion failed: ${name}`));
  });
}

export async function synchronizeNovelToolStorage(input: {
  currentInstanceId: string;
  localStorage?: Storage;
  sessionStorage?: Storage;
  deleteDatabase?: (name: string) => Promise<void>;
}): Promise<void> {
  const local = input.localStorage ?? window.localStorage;
  const session = input.sessionStorage ?? window.sessionStorage;
  if (local.getItem(RUNTIME_INSTANCE_KEY) === input.currentInstanceId) return;
  for (const key of ownedKeys(local)) local.removeItem(key);
  for (const key of ownedKeys(session)) session.removeItem(key);
  const removeDatabase = input.deleteDatabase ?? deleteIndexedDatabase;
  await Promise.all(NOVEL_TOOL_DATABASES.map((name) => removeDatabase(name)));
  local.setItem(RUNTIME_INSTANCE_KEY, input.currentInstanceId);
}
