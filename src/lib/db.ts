export interface SavedSound {
  id: string;
  name: string;
  type: string;
  soundType: string;
  x: number;
  z: number;
  isPlaying: boolean;
  volume: number;
  buffer: ArrayBuffer;
  nodeShape?: 'sphere' | 'cube' | 'pyramid' | 'torus' | 'cylinder';
  nodeColor?: string;
  reverbWetness?: number;
}

const DB_NAME = 'spatial-audio-explorer-db';
const STORE_NAME = 'sounds';

export class StorageQuotaError extends Error {
  constructor(message = 'Browser storage quota exceeded. Audio could not be saved to offline storage.') {
    super(message);
    this.name = 'StorageQuotaError';
  }
}

export function isQuotaExceededError(err: unknown): boolean {
  if (!err) return false;
  if (err instanceof StorageQuotaError) return true;
  if (typeof err === 'object') {
    const e = err as { name?: string; code?: number; message?: string };
    if (e.name === 'QuotaExceededError' || e.code === 22) return true;
    if (e.message && e.message.toLowerCase().includes('quota')) return true;
  }
  return false;
}

export function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB database'));
  });
}

export async function saveSound(sound: Omit<SavedSound, 'buffer'>, buffer: ArrayBuffer): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put({ ...sound, buffer });

      request.onsuccess = () => resolve();
      request.onerror = (e) => {
        const err = request.error || (e.target as any)?.error;
        if (isQuotaExceededError(err)) {
          reject(new StorageQuotaError());
        } else {
          reject(err || new Error('Failed to save sound to IndexedDB'));
        }
      };

      transaction.onerror = (e) => {
        const err = transaction.error || (e.target as any)?.error;
        if (isQuotaExceededError(err)) {
          reject(new StorageQuotaError());
        } else {
          reject(err || new Error('IndexedDB transaction failed'));
        }
      };
    } catch (err) {
      if (isQuotaExceededError(err)) {
        reject(new StorageQuotaError());
      } else {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    }
  });
}

export async function loadSounds(): Promise<SavedSound[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error || new Error('Failed to load sounds from IndexedDB'));
    transaction.onerror = () => reject(transaction.error || new Error('Failed to execute load transaction'));
  });
}

export async function deleteSoundFromDB(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error(`Failed to delete sound ${id} from IndexedDB`));
    transaction.onerror = () => reject(transaction.error || new Error('Failed to execute delete transaction'));
  });
}

export async function clearAllSoundsFromDB(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error('Failed to clear sounds from IndexedDB'));
    transaction.onerror = () => reject(transaction.error || new Error('Failed to execute clear transaction'));
  });
}

export async function updateSoundMetadata(id: string, updates: Partial<Omit<SavedSound, 'buffer'>>): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const getReq = store.get(id);

    getReq.onsuccess = () => {
      const record = getReq.result;
      if (record) {
        const updatedRecord = { ...record, ...updates };
        const putReq = store.put(updatedRecord);
        putReq.onsuccess = () => resolve();
        putReq.onerror = () => {
          const err = putReq.error;
          if (isQuotaExceededError(err)) {
            reject(new StorageQuotaError());
          } else {
            reject(err || new Error(`Failed to update metadata for sound ${id}`));
          }
        };
      } else {
        resolve();
      }
    };

    getReq.onerror = () => reject(getReq.error || new Error(`Failed to retrieve record for sound ${id}`));
    transaction.onerror = () => reject(transaction.error || new Error('Failed to execute update transaction'));
  });
}
