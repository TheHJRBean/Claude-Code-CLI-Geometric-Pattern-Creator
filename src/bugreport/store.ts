import type { BugReport, BugReportMeta } from './types'
import { toMeta } from './report'

/**
 * Persistence for filed bug reports — IndexedDB, fail-soft throughout.
 *
 * **A separate database from the thumbnail store.** `thumbnailStore.ts` opens
 * `geometric-atlas` at version 1; adding an object store there would mean
 * bumping that version, and the moment it upgraded, the thumbnail store's own
 * `open(name, 1)` would fail with a `VersionError`. Bug reports are an
 * independent concern with an independent lifetime, so they get their own
 * database and the two can never collide.
 *
 * **Two object stores, not one.** Screenshots are ~0.2–1 MB each; the list
 * view needs only titles and dates. Splitting them keeps opening the panel
 * cheap and lets a screenshot load on demand.
 *
 * Every method fails soft: if IndexedDB is unavailable (private mode, a
 * blocked upgrade, an errored transaction) reads resolve to null/[] and writes
 * resolve without throwing. A bug reporter that throws while reporting a bug
 * is worse than useless.
 */

const DB_NAME = 'geometric-atlas-bugs'
const REPORTS = 'reports'
const SHOTS = 'screenshots'
const DB_VERSION = 1

/** Newest N kept; older reports are pruned on write so a long-running profile
 *  can't fill the origin's quota. */
export const MAX_STORED_REPORTS = 50

let dbPromise: Promise<IDBDatabase | null> | null = null
let persistenceRequested = false

/**
 * Ask the browser to mark this origin's storage **persistent**, so it is not
 * evicted under disk pressure.
 *
 * By default an origin gets *best-effort* storage, which browsers may clear
 * when space runs low — and these records are the fattest thing the app
 * stores (a screenshot each, up to `MAX_STORED_REPORTS`), so they raise the
 * odds of eviction rather than lowering them.
 *
 * Origin-wide, not bug-report-specific: granting it also protects the saved
 * pattern library and the Generator dataset. Called on the first save rather
 * than at startup because Firefox prompts, and a permission doorhanger before
 * the user has asked for anything to be kept is noise. (Chrome decides
 * silently from engagement heuristics and will often refuse on localhost —
 * hence `Promise<boolean>`, and hence this is a mitigation, not a guarantee.)
 *
 * Idempotent and fail-soft: never throws, never asks twice per session.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (persistenceRequested) return false
  persistenceRequested = true
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise<IDBDatabase | null>(resolve => {
    try {
      if (typeof indexedDB === 'undefined') { resolve(null); return }
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(REPORTS)) db.createObjectStore(REPORTS)
        if (!db.objectStoreNames.contains(SHOTS)) db.createObjectStore(SHOTS)
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
      req.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  return dbPromise
}

function withStores<T>(
  names: string[],
  mode: IDBTransactionMode,
  fn: (tx: IDBTransaction) => Promise<T> | T,
  fallback: T,
): Promise<T> {
  return openDb().then(async db => {
    if (!db) return fallback
    try {
      const tx = db.transaction(names, mode)
      const result = await fn(tx)
      return result
    } catch {
      return fallback
    }
  })
}

function request<T>(req: IDBRequest<T>, fallback: T): Promise<T> {
  return new Promise<T>(resolve => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => resolve(fallback)
  })
}

/** Every stored report, screenshots stripped, newest first. */
export function listReports(): Promise<BugReportMeta[]> {
  return withStores<BugReportMeta[]>([REPORTS], 'readonly', async tx => {
    const all = await request<BugReportMeta[]>(
      tx.objectStore(REPORTS).getAll() as IDBRequest<BugReportMeta[]>,
      [],
    )
    return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [])
}

/** A report's screenshot data URL, or null. */
export function getScreenshot(id: string): Promise<string | null> {
  return withStores<string | null>([SHOTS], 'readonly', async tx =>
    (await request<string | undefined>(
      tx.objectStore(SHOTS).get(id) as IDBRequest<string | undefined>,
      undefined,
    )) ?? null,
  null)
}

/** Rehydrate a full report (meta + screenshot). */
export async function getReport(id: string): Promise<BugReport | null> {
  const meta = await withStores<BugReportMeta | null>([REPORTS], 'readonly', async tx =>
    (await request<BugReportMeta | undefined>(
      tx.objectStore(REPORTS).get(id) as IDBRequest<BugReportMeta | undefined>,
      undefined,
    )) ?? null,
  null)
  if (!meta) return null
  const screenshot = meta.hasScreenshot ? await getScreenshot(id) : null
  const { hasScreenshot: _unused, ...rest } = meta
  return { ...rest, screenshot }
}

/**
 * Persist a report. Resolves **true only when it was actually stored** — the
 * caller must treat false as total loss and get the user exporting.
 */
export function saveReport(report: BugReport): Promise<boolean> {
  // Fire-and-forget: the outcome doesn't gate this write, and awaiting a
  // Firefox permission prompt would stall the save behind a doorhanger.
  void requestPersistentStorage()
  return withStores<boolean>([REPORTS, SHOTS], 'readwrite', async tx => {
    const meta = toMeta(report)
    await request(tx.objectStore(REPORTS).put(meta, report.id) as IDBRequest<IDBValidKey>, '' as IDBValidKey)
    if (report.screenshot) {
      await request(tx.objectStore(SHOTS).put(report.screenshot, report.id) as IDBRequest<IDBValidKey>, '' as IDBValidKey)
    }
    return true
  }, false).then(async ok => {
    if (ok) await pruneToLimit()
    return ok
  })
}

/** Remove a report and its screenshot. */
export function deleteReport(id: string): Promise<void> {
  return withStores<void>([REPORTS, SHOTS], 'readwrite', async tx => {
    await request(tx.objectStore(REPORTS).delete(id) as IDBRequest<undefined>, undefined)
    await request(tx.objectStore(SHOTS).delete(id) as IDBRequest<undefined>, undefined)
  }, undefined)
}

/** Drop everything older than the newest `MAX_STORED_REPORTS`. */
async function pruneToLimit(): Promise<void> {
  const all = await listReports()
  if (all.length <= MAX_STORED_REPORTS) return
  for (const stale of all.slice(MAX_STORED_REPORTS)) await deleteReport(stale.id)
}
