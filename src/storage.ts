let database: Promise<IDBDatabase> | undefined;
function db(): Promise<IDBDatabase> {
  return database ||= new Promise((resolve, reject) => {
    const req = indexedDB.open('yampi-theme-sync', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('records');
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
  });
}
export async function put(key: string, value: unknown): Promise<void> {
  const database = await db();
  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction('records', 'readwrite');
    tx.objectStore('records').put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Backup local não persistiu.'));
  });
}
export async function get<T>(key: string): Promise<T | undefined> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const req = database.transaction('records').objectStore('records').get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}
export async function clearLocal(): Promise<void> {
  const database = await db();
  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction('records', 'readwrite');
    tx.objectStore('records').clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
