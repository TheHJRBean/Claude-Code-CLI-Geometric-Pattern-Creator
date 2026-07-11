/**
 * Thumbnail store (ADR-0006, slice 5) — a thin IndexedDB wrapper keyed by save
 * id. Pattern configs stay in localStorage (`pattern-library-v1`); their
 * browser-grid thumbnails live here as PNG data URLs so they survive reloads
 * without bloating the localStorage quota. Wiping this store is harmless: the
 * browser just re-backfills the missing thumbnails one render at a time.
 *
 * The wrapper is deliberately thin (all the browser's real decisions are the
 * pure helpers in `gallery/galleryBrowser.logic.ts`). Every method fails soft:
 * if IndexedDB is unavailable or a transaction errors, reads resolve to
 * null/[] and writes resolve without throwing, so the grid degrades to
 * placeholders rather than crashing.
 */

const DB_NAME = 'geometric-atlas'
const STORE = 'pattern-thumbs'
const DB_VERSION = 1

let dbPromise: Promise<IDBDatabase | null> | null = null

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise<IDBDatabase | null>(resolve => {
    try {
      if (typeof indexedDB === 'undefined') { resolve(null); return }
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  return dbPromise
}

function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
  fallback: T,
): Promise<T> {
  return openDb().then(db => {
    if (!db) return fallback
    return new Promise<T>(resolve => {
      try {
        const tx = db.transaction(STORE, mode)
        const req = fn(tx.objectStore(STORE))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => resolve(fallback)
        tx.onerror = () => resolve(fallback)
        tx.onabort = () => resolve(fallback)
      } catch {
        resolve(fallback)
      }
    })
  })
}

/** The stored PNG data URL for a save, or null if none / unavailable. */
export function getThumb(id: string): Promise<string | null> {
  return withStore<string | undefined>('readonly', s => s.get(id) as IDBRequest<string | undefined>, undefined)
    .then(v => v ?? null)
}

/** Store (or replace) a save's thumbnail data URL. Resolves even on failure. */
export function putThumb(id: string, dataUrl: string): Promise<void> {
  return withStore<IDBValidKey>('readwrite', s => s.put(dataUrl, id), '' as unknown as IDBValidKey).then(() => undefined)
}

/** Remove a save's thumbnail (called when the save is deleted). */
export function deleteThumb(id: string): Promise<void> {
  return withStore<undefined>('readwrite', s => s.delete(id) as IDBRequest<undefined>, undefined).then(() => undefined)
}

/** Every save id that currently has a stored thumbnail. */
export function allThumbKeys(): Promise<string[]> {
  return withStore<IDBValidKey[]>('readonly', s => s.getAllKeys() as IDBRequest<IDBValidKey[]>, [])
    .then(keys => keys.map(String))
}
