import { useCallback, useEffect, useRef, useState } from 'react'
import type { SavedConfig } from '../../state/configLibrary'
import { allThumbKeys, deleteThumb, getThumb, putThumb } from '../../state/thumbnailStore'
import { renderConfigToThumbnail } from '../../rendering/renderThumbnail'
import { nextBackfillId } from './galleryBrowser.logic'

/**
 * Manage the browser grid's thumbnails: load whatever is already stored, then
 * lazily backfill the rest one offscreen render at a time (ADR-0006, slice 5).
 *
 * The backfill is single-flight (`busyRef`) and self-continuing — each render
 * kicks the next via `pump` — so only one heavy offscreen Canvas mounts at a
 * time. Configs that fail to render are remembered in `failedRef` and skipped
 * so the loop advances instead of retrying forever (a wiped store just
 * re-backfills; a genuinely broken config degrades to a placeholder).
 */
export function useThumbnails(saves: SavedConfig[]): {
  thumbs: Record<string, string>
  markDeleted: (id: string) => void
} {
  const [thumbs, setThumbs] = useState<Record<string, string>>({})

  const savesRef = useRef(saves)
  savesRef.current = saves
  const thumbsRef = useRef(thumbs)
  thumbsRef.current = thumbs
  const failedRef = useRef<Set<string>>(new Set())
  const busyRef = useRef(false)
  const mountedRef = useRef(true)
  const pumpRef = useRef<() => void>(() => {})

  useEffect(() => () => { mountedRef.current = false }, [])

  const put = useCallback((id: string, url: string) => {
    if (!mountedRef.current) return
    setThumbs(prev => (prev[id] === url ? prev : { ...prev, [id]: url }))
  }, [])

  // Load already-stored thumbnails for the current saves.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const keys = new Set(await allThumbKeys())
      for (const s of saves) {
        if (cancelled) return
        if (keys.has(s.id) && !thumbsRef.current[s.id]) {
          const url = await getThumb(s.id)
          if (!cancelled && url) put(s.id, url)
        }
      }
    })()
    return () => { cancelled = true }
  }, [saves, put])

  // The backfill pump: render the first save missing a thumbnail, store it,
  // then recurse to the next. Kept in a ref so the effect below can trigger it
  // without re-creating the closure or racing itself.
  pumpRef.current = () => {
    if (busyRef.current) return
    const covered = new Set<string>([...Object.keys(thumbsRef.current), ...failedRef.current])
    const id = nextBackfillId(savesRef.current, covered)
    if (!id) return
    const save = savesRef.current.find(s => s.id === id)
    if (!save) return
    busyRef.current = true
    renderConfigToThumbnail(save.config)
      .then(url => {
        busyRef.current = false
        if (url) {
          void putThumb(id, url)
          put(id, url)
        } else {
          failedRef.current.add(id)
        }
        if (mountedRef.current) pumpRef.current()
      })
      .catch(() => {
        busyRef.current = false
        failedRef.current.add(id)
        if (mountedRef.current) pumpRef.current()
      })
  }

  useEffect(() => { pumpRef.current() }, [saves, thumbs])

  const markDeleted = useCallback((id: string) => {
    void deleteThumb(id)
    failedRef.current.delete(id)
    setThumbs(prev => {
      if (!(id in prev)) return prev
      const next = { ...prev }
      delete next[id]
      return next
    })
  }, [])

  return { thumbs, markDeleted }
}
