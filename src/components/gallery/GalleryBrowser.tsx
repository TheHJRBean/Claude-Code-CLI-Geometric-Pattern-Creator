import { useEffect, useMemo, useState } from 'react'
import type { PatternConfig } from '../../types/pattern'
import type { ConfigLibrary, SavedConfig } from '../../state/configLibrary'
import { saveJSON } from '../../export/exportJSON'
import { TextPromptModal } from '../TextPromptModal'
import { PatternCard } from './PatternCard'
import { PatternDetailView } from './PatternDetailView'
import { useThumbnails } from './useThumbnails'
import { editAvailabilityFor, toCardModel } from './galleryBrowser.logic'
import {
  cardMetaFor,
  DEFAULT_GALLERY_SORT,
  GALLERY_SORT_STORAGE_KEY,
  groupedSortOptions,
  parseSortKey,
  sortSaves,
  type GallerySortKey,
} from './gallerySort'

/**
 * The Gallery saved-patterns browser (ADR-0006, slice 5) — a thumbnail grid
 * over the merged library with per-card manage actions and a pan/zoom detail
 * view. Editor saves render decorated + framed; legacy BFS/Taprats saves render
 * their legacy path (with their Gallery Frame) and carry a source badge.
 *
 * "Edit in Lab" hands the config up to `onEditInLab`, which loads editor saves
 * directly and converts tier-1 legacy saves one-way (the saved copy is kept —
 * see `resolveEditInLab`). Authoring lives entirely in the Lab now (ADR-0006
 * flip): `onGoToLab` switches workspaces so an empty Gallery has a way forward.
 *
 * The save's id rides along so a verbatim load stays linked to its library
 * entry and the Lab's Save updates it in place; the caller decides whether a
 * conversion keeps that link.
 */
interface Props {
  library: ConfigLibrary
  onEditInLab: (config: PatternConfig, savedId: string) => void
  onGoToLab: () => void
}

export function GalleryBrowser({ library, onEditInLab, onGoToLab }: Props) {
  const [entries, setEntries] = useState<SavedConfig[]>(() => library.list())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [textModal, setTextModal] = useState<{ title: string; initialValue: string; onConfirm: (v: string) => void } | null>(null)
  // The chosen order is a durable workspace preference — a user who sorts
  // alphabetically wants that grid again next visit, not the default.
  const [sortKey, setSortKey] = useState<GallerySortKey>(() => {
    try { return parseSortKey(localStorage.getItem(GALLERY_SORT_STORAGE_KEY)) } catch { return DEFAULT_GALLERY_SORT }
  })

  const sorted = useMemo(() => sortSaves(entries, sortKey), [entries, sortKey])
  // Thumbnail backfill follows the visible order, so the cards on screen render
  // before the ones further down the grid.
  const { thumbs, markDeleted } = useThumbnails(sorted)

  const refresh = () => setEntries(library.list())

  const selectSort = (next: GallerySortKey) => {
    setSortKey(next)
    try { localStorage.setItem(GALLERY_SORT_STORAGE_KEY, next) } catch { /* preference only */ }
  }

  // Opening a save (detail view or hand-off to the Lab) stamps it, which is
  // what the "recently opened" sort reads. Refreshing afterwards keeps the
  // grid's meta line honest; under that sort the card also moves, which is the
  // point of it.
  const handleOpen = (id: string) => {
    library.touchOpened(id)
    setSelectedId(id)
    refresh()
  }
  const flashError = (msg: string) => {
    setError(msg)
    window.setTimeout(() => setError(null), 4000)
  }

  // Cross-tab updates: another tab editing the library refreshes this grid.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === library.storageKey) refresh() }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [library.storageKey])

  const selected = selectedId ? entries.find(e => e.id === selectedId) ?? null : null
  // If the selected save vanished (deleted in another tab), drop the detail view.
  useEffect(() => {
    if (selectedId && !entries.some(e => e.id === selectedId)) setSelectedId(null)
  }, [entries, selectedId])

  const handleRename = (entry: SavedConfig) => {
    setTextModal({
      title: 'Rename pattern',
      initialValue: entry.name,
      onConfirm: next => {
        setTextModal(null)
        const err = library.rename(entry.id, next)
        if (err) flashError(err.message)
        else refresh()
      },
    })
  }

  const handleDuplicate = (entry: SavedConfig) => {
    const result = library.duplicate(entry.id)
    if (result.error) flashError(result.error.message)
    else refresh() // the copy's thumbnail backfills lazily
  }

  const handleDelete = (entry: SavedConfig) => {
    const ok = window.confirm(`Delete "${entry.name}"? This cannot be undone.`)
    if (!ok) return
    const err = library.delete(entry.id)
    if (err) { flashError(err.message); return }
    markDeleted(entry.id)
    if (selectedId === entry.id) setSelectedId(null)
    refresh()
  }

  return (
    <div className="gallery-browser">
      <div className="gallery-browser__header">
        <div>
          <h1 className="gallery-browser__title">My Patterns</h1>
          <p className="gallery-browser__subtitle">
            {entries.length === 0
              ? 'Your saved patterns will appear here.'
              : `${entries.length} saved ${entries.length === 1 ? 'pattern' : 'patterns'}`}
          </p>
        </div>
        <div className="gallery-browser__tools">
          {entries.length > 1 && (
            <label className="gallery-browser__sort">
              <span className="gallery-browser__sort-label">Sort</span>
              <select
                className="pattern-select gallery-browser__sort-select"
                value={sortKey}
                onChange={e => selectSort(parseSortKey(e.target.value))}
              >
                {groupedSortOptions().map(({ group, options }) => (
                  <optgroup key={group} label={group}>
                    {options.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                  </optgroup>
                ))}
              </select>
            </label>
          )}
          <button className="gallery-browser__new" onClick={onGoToLab}>New in Lab</button>
        </div>
      </div>

      {error && <p className="gallery-browser__error">{error}</p>}

      {entries.length === 0 ? (
        <div className="gallery-browser__empty">
          <p>Nothing saved yet.</p>
          <p>Start in the <strong>Lab</strong> — build or tune a pattern there, then save it to see it here.</p>
          <button className="gallery-browser__empty-cta" onClick={onGoToLab}>Open the Lab</button>
        </div>
      ) : (
        <div className="gallery-grid">
          {sorted.map(entry => (
            <PatternCard
              key={entry.id}
              model={toCardModel(entry)}
              meta={cardMetaFor(entry, sortKey)}
              thumbUrl={thumbs[entry.id]}
              onOpen={() => handleOpen(entry.id)}
              onRename={() => handleRename(entry)}
              onDuplicate={() => handleDuplicate(entry)}
              onDelete={() => handleDelete(entry)}
              onExport={() => saveJSON(entry.config)}
            />
          ))}
        </div>
      )}

      {selected && (
        <PatternDetailView
          save={selected}
          badge={toCardModel(selected).badge}
          editAvailability={editAvailabilityFor(selected.config)}
          onBack={() => setSelectedId(null)}
          onEditInLab={() => onEditInLab(selected.config, selected.id)}
        />
      )}

      <TextPromptModal
        open={textModal !== null}
        title={textModal?.title ?? ''}
        confirmLabel="Rename"
        initialValue={textModal?.initialValue ?? ''}
        onConfirm={value => textModal?.onConfirm(value)}
        onCancel={() => setTextModal(null)}
      />
    </div>
  )
}
