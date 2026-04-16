// Utilities for saving/loading garden state to a file on the user's computer
// via the File System Access API. The file handle is persisted in IndexedDB
// so the same file keeps auto-saving across browser restarts.

const DB_NAME = 'garden-planner-files';
const STORE = 'handles';
const KEY = 'main';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getStoredHandle(): Promise<FileSystemFileHandle | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve((req.result as FileSystemFileHandle) || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function setStoredHandle(handle: FileSystemFileHandle | null): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      if (handle) tx.objectStore(STORE).put(handle, KEY);
      else tx.objectStore(STORE).delete(KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // ignore
  }
}

export async function verifyPermission(
  handle: FileSystemFileHandle,
  mode: 'read' | 'readwrite' = 'readwrite',
  requestIfNeeded = true,
): Promise<boolean> {
  // @ts-ignore — queryPermission/requestPermission aren't in TS lib yet
  if ((await handle.queryPermission({ mode })) === 'granted') return true;
  if (!requestIfNeeded) return false;
  // @ts-ignore
  return (await handle.requestPermission({ mode })) === 'granted';
}

export async function writeToHandle(handle: FileSystemFileHandle, data: string): Promise<void> {
  const writable = await (handle as any).createWritable();
  await writable.write(data);
  await writable.close();
}

export async function readFromHandle(handle: FileSystemFileHandle): Promise<string> {
  const file = await handle.getFile();
  return await file.text();
}

export function isFsAccessSupported(): boolean {
  return typeof window !== 'undefined' && 'showSaveFilePicker' in window;
}
