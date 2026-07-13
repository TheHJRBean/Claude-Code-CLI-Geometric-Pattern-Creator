import type { PatternConfig } from '../types/pattern'

/**
 * Generator dataset store (ADR-0007, ticket #19) — a thin IndexedDB wrapper
 * for rated samples, mirroring `state/thumbnailStore.ts`'s shape. A separate
 * database from the thumbnail store: this is durable taste data, not a
 * disposable render cache.
 *
 * Every method fails soft: if IndexedDB is unavailable or a transaction
 * errors, reads resolve to empty/zero and writes resolve without throwing.
 */

const DB_NAME = 'geometric-atlas-generator'
const STORE = 'ratings'
const DB_VERSION = 1

/** Bump when the *shape* of a rating (not the sampler) changes, so future
 * dimensions can be added without corrupting existing records (ADR-0007). */
export const SCORE_SCHEMA_VERSION = 1

/** `{ seed, generatorVersion, scoreSchemaVersion, config, score, flagged,
 * timestamp }` per ADR-0007. The full config is ground truth — the seed is
 * provenance only and is never used to regenerate the sample. */
export interface DatasetRecord {
  id: number
  seed: number
  generatorVersion: number
  scoreSchemaVersion: number
  config: PatternConfig
  /** 1–5, or null when the sample was only flagged, never scored. */
  score: number | null
  flagged: boolean
  timestamp: number
}

export type NewDatasetRecord = Omit<DatasetRecord, 'id'>

let dbPromise: Promise<IDBDatabase | null> | null = null

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise<IDBDatabase | null>(resolve => {
    try {
      if (typeof indexedDB === 'undefined') { resolve(null); return }
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true })
        }
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

/** Persist one rated (or flagged) sample. Resolves even on failure. */
export function addRecord(record: NewDatasetRecord): Promise<void> {
  return withStore<IDBValidKey>('readwrite', s => s.add(record), '' as unknown as IDBValidKey).then(() => undefined)
}

/** Every record in the dataset, in insertion order. */
export function allRecords(): Promise<DatasetRecord[]> {
  return withStore<DatasetRecord[]>('readonly', s => s.getAll() as IDBRequest<DatasetRecord[]>, [])
}

/** Running count of rated (or flagged) samples — cheaper than `allRecords().length`. */
export function countRecords(): Promise<number> {
  return withStore<number>('readonly', s => s.count(), 0)
}
