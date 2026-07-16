import { useEffect, useState } from 'react'
import type { PatternConfig } from '../types/pattern'
import type { ConfigLibrary, SavedConfig } from '../state/configLibrary'
import { TILINGS } from '../tilings/index'
import { TextPromptModal } from './TextPromptModal'
import { FieldLabel } from './ui/FieldLabel'

/**
 * Shared library panel — Save / Rename / Duplicate / Delete plus a saved-
 * entries dropdown over a `ConfigLibrary`.
 *
 * Used by both Lab ("My Tessellations") and Main ("My Patterns"). The
 * panel owns its dropdown state, error flash, and the in-app prompt
 * modal. Caller supplies the library binding, the current config to
 * save, and a `LOAD_CONFIG` callback.
 */

interface Props {
  library: ConfigLibrary
  currentConfig: PatternConfig
  onLoad: (config: PatternConfig) => void
  /** Fired after a successful Save — lets the caller clear its dirty flag. */
  onSaved?: () => void
  /** Singular noun for prompts and button labels — "tessellation" or "pattern". */
  nounSingular: string
  /** Label shown above the saved-entries dropdown. */
  dropdownLabel?: string
  /** Controlled active-entry id so external resets (e.g. Clear button) can wipe selection. */
  activeId: string
  onActiveIdChange: (id: string) => void
}

export function ConfigLibraryPanel({
  library,
  currentConfig,
  onLoad,
  onSaved,
  nounSingular,
  dropdownLabel = 'Saved',
  activeId,
  onActiveIdChange,
}: Props) {
  const [entries, setEntries] = useState<SavedConfig[]>(() => library.list())
  const [error, setError] = useState<string | null>(null)
  const [textModal, setTextModal] = useState<{
    title: string
    confirmLabel: string
    initialValue: string
    onConfirm: (value: string) => void
  } | null>(null)

  const refresh = () => setEntries(library.list())
  const flashError = (msg: string | null) => {
    setError(msg)
    if (msg) window.setTimeout(() => setError(null), 4000)
  }
  const activeEntry = activeId ? entries.find(e => e.id === activeId) ?? null : null

  // Cross-tab updates: another tab editing the same library should refresh us.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === library.storageKey) refresh()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
    // library.storageKey is stable across renders for a given binding
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [library.storageKey])

  const handleLoad = (id: string) => {
    onActiveIdChange(id)
    if (!id) return
    const entry = library.get(id)
    if (entry) onLoad(entry.config)
  }

  const suggestedName = (() => {
    if (activeEntry) return `${activeEntry.name} (modified)`
    const t = currentConfig.tiling.type
    if (!t) return 'Untitled'
    if (t === 'editor') return 'My patch'
    return TILINGS[t]?.label ?? 'Untitled'
  })()

  const handleSaveAsNew = () => {
    setTextModal({
      title: `Name this ${nounSingular}`,
      confirmLabel: 'Save',
      initialValue: suggestedName,
      onConfirm: name => {
        setTextModal(null)
        const result = library.save(name, currentConfig)
        if (result.error) {
          flashError(result.error.message)
          return
        }
        refresh()
        if (result.entry) onActiveIdChange(result.entry.id)
        onSaved?.()
      },
    })
  }

  const handleSave = () => {
    if (!activeEntry) {
      handleSaveAsNew()
      return
    }
    const result = library.update(activeEntry.id, currentConfig)
    if (result.error) {
      flashError(result.error.message)
      return
    }
    refresh()
    onSaved?.()
  }

  const handleRename = () => {
    if (!activeEntry) return
    setTextModal({
      title: `Rename ${nounSingular}`,
      confirmLabel: 'Rename',
      initialValue: activeEntry.name,
      onConfirm: next => {
        setTextModal(null)
        const err = library.rename(activeEntry.id, next)
        if (err) flashError(err.message)
        else refresh()
      },
    })
  }

  const handleDelete = () => {
    if (!activeEntry) return
    const ok = window.confirm(`Delete "${activeEntry.name}"? This cannot be undone.`)
    if (!ok) return
    const err = library.delete(activeEntry.id)
    if (err) {
      flashError(err.message)
      return
    }
    refresh()
    onActiveIdChange('')
  }

  const handleDuplicate = () => {
    if (!activeEntry) return
    const result = library.duplicate(activeEntry.id)
    if (result.error) {
      flashError(result.error.message)
      return
    }
    refresh()
    if (result.entry) onActiveIdChange(result.entry.id)
  }

  const buttons = [
    { label: 'Save', onClick: handleSave, disabled: !currentConfig.tiling.type },
    { label: 'Save As', onClick: handleSaveAsNew, disabled: !currentConfig.tiling.type || !activeEntry },
    { label: 'Rename', onClick: handleRename, disabled: !activeEntry },
    { label: 'Duplicate', onClick: handleDuplicate, disabled: !activeEntry },
    { label: 'Delete', onClick: handleDelete, disabled: !activeEntry, danger: true },
  ] as const

  return (
    <>
      <FieldLabel label={dropdownLabel} />
      <select
        className="pattern-select"
        value={activeId}
        onChange={e => handleLoad(e.target.value)}
      >
        <option value="">— select a saved {nounSingular} —</option>
        {entries.map(e => (
          <option key={e.id} value={e.id}>{e.name}</option>
        ))}
      </select>

      <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
        {buttons.map(b => (
          <button
            key={b.label}
            onClick={b.onClick}
            disabled={b.disabled}
            style={{
              flex: '1 1 0',
              minWidth: 0,
              padding: '5px 0',
              fontFamily: "'Cinzel', Georgia, serif",
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: '0.10em',
              textTransform: 'uppercase',
              cursor: b.disabled ? 'not-allowed' : 'pointer',
              border: '1px solid var(--border-subtle)',
              background: 'transparent',
              color: b.disabled
                ? 'var(--text-muted)'
                : 'danger' in b && b.danger
                  ? '#a85050'
                  : 'var(--text-muted)',
              opacity: b.disabled ? 0.5 : 1,
              transition: 'all 0.15s',
            }}
          >
            {b.label}
          </button>
        ))}
      </div>
      {error && (
        <p style={{
          marginTop: 6,
          marginBottom: 0,
          fontFamily: "'EB Garamond', Georgia, serif",
          fontSize: 12,
          color: '#a85050',
          lineHeight: 1.4,
        }}>
          {error}
        </p>
      )}
      {!error && activeEntry && (
        <p style={{
          marginTop: 6,
          marginBottom: 0,
          fontFamily: "'EB Garamond', Georgia, serif",
          fontStyle: 'italic',
          fontSize: 11.5,
          color: 'var(--text-muted)',
          lineHeight: 1.4,
        }}>
          Saved {new Date(activeEntry.createdAt).toLocaleString()}
        </p>
      )}

      <TextPromptModal
        open={textModal !== null}
        title={textModal?.title ?? ''}
        confirmLabel={textModal?.confirmLabel ?? 'Save'}
        initialValue={textModal?.initialValue ?? ''}
        onConfirm={value => textModal?.onConfirm(value)}
        onCancel={() => setTextModal(null)}
      />
    </>
  )
}
