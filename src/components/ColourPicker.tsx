import { useEffect, useState, useSyncExternalStore } from 'react'
import {
  isHexColour,
  normaliseEyeDropperHex,
  pushRecentColour,
  subscribeRecents,
  getRecents,
  loadUserThemes,
  saveUserThemes,
  createUserTheme,
  addColourToTheme,
  removeColourFromTheme,
  deleteUserTheme,
  BUILT_IN_THEMES,
  ACTIVE_THEME_KEY,
  type ColourTheme,
} from './colourPicker.logic'

/**
 * ColourPicker — the Decoration Phase's paint-colour control.
 *
 * Three layers on top of the native colour input:
 * - **Themes** — curated built-in palettes plus user-created themes
 *   (persisted to localStorage). A theme is just a named set of swatches.
 * - **Theme creation** — "New" seeds a theme with the current colour; with a
 *   user theme selected, the current colour can be added, swatches removed,
 *   or the whole theme deleted.
 * - **Recent colours** — the last colours actually *used* to paint (not
 *   merely previewed). Callers record use via `pushRecentColour`; the row
 *   updates live through a module-level store + `useSyncExternalStore`.
 *
 * The non-JSX logic lives in `colourPicker.logic.ts` (tested). The store +
 * theme type are re-exported here so existing import sites stay stable.
 */
export { pushRecentColour }
export type { ColourTheme }

/* ── Eye dropper (native EyeDropper API, Chromium-only) ── */

interface EyeDropperAPI {
  open: () => Promise<{ sRGBHex: string }>
}

// `typeof window` guard: this module is evaluated under SSR/vitest too.
const eyeDropperSupported = typeof window !== 'undefined' && 'EyeDropper' in window

/* ── Component ────────────────────────────────────────── */

interface Props {
  value: string
  onChange: (colour: string) => void
}

const miniLabelStyle: React.CSSProperties = {
  fontFamily: "'Cinzel', Georgia, serif",
  fontSize: 9,
  fontWeight: 600,
  letterSpacing: '0.10em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
}

const miniButtonStyle: React.CSSProperties = {
  padding: '3px 7px',
  fontFamily: "'Cinzel', Georgia, serif",
  fontSize: 8,
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  border: '1px solid var(--border-subtle)',
  background: 'transparent',
  color: 'var(--text-muted)',
}

function Swatch({ colour, selected, removeMode, onPick }: {
  colour: string
  selected: boolean
  removeMode?: boolean
  onPick: (c: string) => void
}) {
  return (
    <button
      onClick={() => onPick(colour)}
      title={removeMode ? `Remove ${colour}` : colour}
      style={{
        width: 22,
        height: 22,
        padding: 0,
        background: colour,
        cursor: 'pointer',
        border: selected ? '2px solid var(--accent)' : '1px solid var(--border-subtle)',
        outline: removeMode ? '1px dashed #a85050' : 'none',
        outlineOffset: 1,
        position: 'relative',
        flexShrink: 0,
      }}
    >
      {removeMode && (
        <span style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 12, lineHeight: 1, textShadow: '0 0 2px #000',
        }}>×</span>
      )}
    </button>
  )
}

export function ColourPicker({ value, onChange }: Props) {
  const recentColours = useSyncExternalStore(subscribeRecents, getRecents)
  const [userThemes, setUserThemes] = useState<ColourTheme[]>(loadUserThemes)
  const [activeThemeId, setActiveThemeId] = useState<string>(() => {
    try { return localStorage.getItem(ACTIVE_THEME_KEY) ?? BUILT_IN_THEMES[0].id } catch { return BUILT_IN_THEMES[0].id }
  })
  const [removeMode, setRemoveMode] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  // Hex text field draft — committed only when it parses as #rrggbb.
  const [hexDraft, setHexDraft] = useState(value)
  useEffect(() => { setHexDraft(value) }, [value])

  const allThemes = [...BUILT_IN_THEMES, ...userThemes]
  const activeTheme = allThemes.find(t => t.id === activeThemeId) ?? BUILT_IN_THEMES[0]
  const isUserTheme = userThemes.some(t => t.id === activeTheme.id)

  const setActiveTheme = (id: string) => {
    setActiveThemeId(id)
    setRemoveMode(false)
    try { localStorage.setItem(ACTIVE_THEME_KEY, id) } catch { /* ignore */ }
  }

  const updateUserThemes = (next: ColourTheme[]) => {
    setUserThemes(next)
    saveUserThemes(next)
  }

  const createTheme = () => {
    const theme = createUserTheme(newName, value, `user-${Date.now().toString(36)}`)
    if (!theme) return
    updateUserThemes([...userThemes, theme])
    setActiveTheme(theme.id)
    setCreating(false)
    setNewName('')
  }

  const addCurrentToTheme = () => {
    if (!isUserTheme) return
    updateUserThemes(addColourToTheme(userThemes, activeTheme.id, value))
  }

  const removeFromTheme = (colour: string) => {
    if (!isUserTheme) return
    updateUserThemes(removeColourFromTheme(userThemes, activeTheme.id, colour))
  }

  const deleteTheme = () => {
    if (!isUserTheme) return
    updateUserThemes(deleteUserTheme(userThemes, activeTheme.id))
    setActiveTheme(BUILT_IN_THEMES[0].id)
  }

  const handleSwatchPick = (c: string) => {
    if (removeMode && isUserTheme) removeFromTheme(c)
    else onChange(c)
  }

  const [pickingFromScreen, setPickingFromScreen] = useState(false)
  const pickFromScreen = async () => {
    const Ctor = (window as unknown as { EyeDropper?: new () => EyeDropperAPI }).EyeDropper
    if (!Ctor || pickingFromScreen) return
    setPickingFromScreen(true)
    try {
      const result = await new Ctor().open()
      const hex = normaliseEyeDropperHex(result.sRGBHex)
      if (hex) onChange(hex)
    } catch {
      // User cancelled (Esc) — nothing to do.
    } finally {
      setPickingFromScreen(false)
    }
  }

  return (
    <div>
      {/* Current colour: native picker + eye dropper + hex entry.
          (A div, not a label — a label would forward button clicks to the
          colour input and pop its dialog.) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ minWidth: 70 }}>Paint colour</span>
        <input
          type="color"
          value={isHexColour(value) ? value : '#000000'}
          onChange={e => onChange(e.target.value)}
          style={{ width: 36, height: 24, padding: 0, border: '1px solid var(--border-subtle)', background: 'transparent', cursor: 'pointer' }}
        />
        {eyeDropperSupported && (
          <button
            onClick={pickFromScreen}
            disabled={pickingFromScreen}
            title="Pick a colour from the screen"
            style={{
              width: 26,
              height: 24,
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              border: `1px solid ${pickingFromScreen ? 'var(--accent)' : 'var(--border-subtle)'}`,
              background: 'transparent',
              color: pickingFromScreen ? 'var(--accent)' : 'var(--text-muted)',
              cursor: pickingFromScreen ? 'wait' : 'pointer',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m2 22 1-1h3l9-9" />
              <path d="M3 21v-3l9-9" />
              <path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z" />
            </svg>
          </button>
        )}
        <input
          type="text"
          value={hexDraft}
          onChange={e => {
            const v = e.target.value
            setHexDraft(v)
            if (isHexColour(v)) onChange(v)
          }}
          onBlur={() => setHexDraft(value)}
          spellCheck={false}
          style={{
            width: 70,
            padding: '3px 6px',
            fontFamily: 'monospace',
            fontSize: 11,
            background: 'var(--bg-input)',
            color: 'var(--text)',
            border: `1px solid ${isHexColour(hexDraft) ? 'var(--border-subtle)' : '#a85050'}`,
            outline: 'none',
          }}
        />
      </div>

      {/* Theme selector + management */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={miniLabelStyle}>Theme</span>
        {!creating && (
          <button onClick={() => setCreating(true)} style={miniButtonStyle}>+ New</button>
        )}
      </div>
      {creating && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') createTheme(); if (e.key === 'Escape') { setCreating(false); setNewName('') } }}
            placeholder="Theme name"
            autoFocus
            style={{
              flex: 1,
              minWidth: 0,
              padding: '4px 8px',
              fontFamily: "'EB Garamond', Georgia, serif",
              fontSize: 12.5,
              background: 'var(--bg-input)',
              color: 'var(--text)',
              border: '1px solid var(--border-subtle)',
              outline: 'none',
            }}
          />
          <button onClick={createTheme} disabled={!newName.trim()} style={{ ...miniButtonStyle, opacity: newName.trim() ? 1 : 0.5, color: 'var(--accent)', borderColor: 'var(--accent)' }}>Create</button>
          <button onClick={() => { setCreating(false); setNewName('') }} style={miniButtonStyle}>Cancel</button>
        </div>
      )}
      <select
        className="pattern-select"
        value={activeTheme.id}
        onChange={e => setActiveTheme(e.target.value)}
        style={{ marginBottom: 8 }}
      >
        <optgroup label="Built-in">
          {BUILT_IN_THEMES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </optgroup>
        {userThemes.length > 0 && (
          <optgroup label="My themes">
            {userThemes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </optgroup>
        )}
      </select>

      {/* Theme swatches */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: isUserTheme ? 6 : 10 }}>
        {activeTheme.colours.map(c => (
          <Swatch
            key={c}
            colour={c}
            selected={!removeMode && c.toLowerCase() === value.toLowerCase()}
            removeMode={removeMode}
            onPick={handleSwatchPick}
          />
        ))}
        {activeTheme.colours.length === 0 && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
            Empty theme — add the current colour below.
          </span>
        )}
      </div>
      {isUserTheme && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
          <button onClick={addCurrentToTheme} style={miniButtonStyle} title="Add the current paint colour to this theme">
            + Add colour
            <span style={{
              display: 'inline-block', width: 9, height: 9, marginLeft: 5,
              background: value, border: '1px solid var(--border-subtle)', verticalAlign: 'middle',
            }} />
          </button>
          <button
            onClick={() => setRemoveMode(m => !m)}
            style={{
              ...miniButtonStyle,
              ...(removeMode ? { border: '1px solid #a85050', color: '#a85050' } : null),
            }}
            title="Click swatches to remove them from this theme"
          >
            {removeMode ? 'Done removing' : '– Remove'}
          </button>
          <button onClick={deleteTheme} style={{ ...miniButtonStyle, color: '#a85050' }}>Delete theme</button>
        </div>
      )}

      {/* Recent colours — colours actually painted with, newest first */}
      {recentColours.length > 0 && (
        <>
          <div style={{ ...miniLabelStyle, marginBottom: 6 }}>Recent</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 4 }}>
            {recentColours.map(c => (
              <Swatch
                key={c}
                colour={c}
                selected={c === value.toLowerCase()}
                onPick={onChange}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
