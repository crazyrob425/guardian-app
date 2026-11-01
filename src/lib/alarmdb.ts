// Tiny IndexedDB store for the user's own alarm sound file.
// Audio files are far too big for localStorage; the Blob lives here and
// Settings only remembers its name + that it exists.

const DB_NAME = "guardian-files";
const STORE = "files";
const KEY = "customAlarm";

export interface CustomAlarmFile {
  blob: Blob;
  name: string;
  type: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      })
  );
}

export async function saveCustomAlarm(file: File): Promise<void> {
  const rec: CustomAlarmFile = { blob: file, name: file.name, type: file.type };
  await tx("readwrite", (s) => s.put(rec, KEY));
}

export async function loadCustomAlarm(): Promise<CustomAlarmFile | null> {
  try {
    const rec = await tx<CustomAlarmFile | undefined>("readonly", (s) => s.get(KEY) as IDBRequest<CustomAlarmFile | undefined>);
    return rec ?? null;
  } catch {
    return null;
  }
}

export async function clearCustomAlarm(): Promise<void> {
  await tx("readwrite", (s) => s.delete(KEY)).catch(() => {});
}
