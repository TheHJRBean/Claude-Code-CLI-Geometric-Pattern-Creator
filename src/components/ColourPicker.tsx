import { useEffect, useState, useSyncExternalStore } from 'react'

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
 */

/* ── Recent-colours store (module-level, localStorage-backed) ── */

const RECENTS_KEY = 'recent-paint-colours'
const RECENTS_MAX = 10

function loadRecents(): string[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((c): c is string => typeof c === 'string' && isHexColour(c)).slice(0, RECENTS_MAX)
  } catch {
    return []
  }
}

let recents: string[] = loadRecents()
const recentsListeners = new Set<() => void>()

/** Record a colour as actually used (a paint landed). Call from the paint
 * dispatch sites, not from picker interactions — "recent" means used. */
export function pushRecentColour(colour: string) {
  const c = colour.toLowerCase()
  if (!isHexColour(c)) return
  if (recents[0] === c) return
  recents = [c, ...recents.filter(r => r !== c)].slice(0, RECENTS_MAX)
  try { localStorage.setItem(RECENTS_KEY, JSON.stringify(recents)) } catch { /* ignore */ }
  recentsListeners.forEach(l => l())
}

function subscribeRecents(l: () => void) {
  recentsListeners.add(l)
  return () => { recentsListeners.delete(l) }
}
const getRecents = () => recents

/* ── Themes ───────────────────────────────────────────── */

export interface ColourTheme {
  id: string
  name: string
  colours: string[]
}

const THEMES_KEY = 'user-colour-themes'
const ACTIVE_THEME_KEY = 'active-colour-theme'

const BUILT_IN_THEMES: ColourTheme[] = [
  {
    id: 'builtin-art-deco',
    name: 'Art Deco',
    colours: ['#c9943a', '#1b2a4a', '#7b1e26', '#0f6b5c', '#2c2c34', '#b87333', '#e8dcc0', '#f4ecd8'],
  },
  {
    id: 'builtin-nile',
    name: 'Nile & Gold',
    colours: ['#0e4d64', '#137a63', '#c9a227', '#e1bb80', '#88ab75', '#cd5334', '#2d3a3a', '#edf6f9'],
  },
  {
    id: 'builtin-lapis',
    name: 'Classic Lapis',
    colours: ['#1f3b73', '#2e5ea8', '#d4af37', '#7d1d1d', '#0d6e57', '#c97f4e', '#101418', '#f5f0e1'],
  },
  {
    id: 'builtin-desert',
    name: 'Desert Dusk',
    colours: ['#9c4a1a', '#d98e32', '#f2d0a4', '#5f0f40', '#0b3954', '#ef798a', '#310e68', '#fdf0d5'],
  },
  {
    id: 'builtin-jewel',
    name: 'Jewel Box',
    colours: ['#9b1d64', '#5727a3', '#1c5d99', '#0f8b8d', '#119822', '#f2bb05', '#dd7230', '#a4031f'],
  },
]

function loadUserThemes(): ColourTheme[] {
  try {
    const raw = localStorage.getItem(THEMES_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((t): t is ColourTheme =>
      !!t && typeof t === 'object' &&
      typeof (t as ColourTheme).id === 'string' &&
      typeof (t as ColourTheme).name === 'string' &&
      Array.isArray((t as ColourTheme).colours) &&
      (t as ColourTheme).colours.every(c => typeof c === 'string'))
  } catch {
    return []
  }
}

function saveUserThemes(themes: ColourTheme[]) {
  try { localStorage.setItem(THEMES_KEY, JSON.stringify(themes)) } catch { /* ignore */ }
}

function isHexColour(c: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(c)
}

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
    const name = newName.trim()
    if (!name) return
    const theme: ColourTheme = {
      id: `user-${Date.now().toString(36)}`,
      name,
      colours: [value.toLowerCase()],
    }
    updateUserThemes([...userThemes, theme])
    setActiveTheme(theme.id)
    setCreating(false)
    setNewName('')
  }

  const addCurrentToTheme = () => {
    if (!isUserTheme) return
    const c = value.toLowerCase()
    if (activeTheme.colours.includes(c)) return
    updateUserThemes(userThemes.map(t => t.id === activeTheme.id ? { ...t, colours: [...t.colours, c] } : t))
  }

  const removeFromTheme = (colour: string) => {
    if (!isUserTheme) return
    updateUserThemes(userThemes.map(t => t.id === activeTheme.id ? { ...t, colours: t.colours.filter(c => c !== colour) } : t))
  }

  const deleteTheme = () => {
    if (!isUserTheme) return
    updateUserThemes(userThemes.filter(t => t.id !== activeTheme.id))
    setActiveTheme(BUILT_IN_THEMES[0].id)
  }

  const handleSwatchPick = (c: string) => {
    if (removeMode && isUserTheme) removeFromTheme(c)
    else onChange(c)
  }

  return (
    <div>
      {/* Current colour: native picker + hex entry */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ minWidth: 70 }}>Paint colour</span>
        <input
          type="color"
          value={isHexColour(value) ? value : '#000000'}
          onChange={e => onChange(e.target.value)}
          style={{ width: 36, height: 24, padding: 0, border: '1px solid var(--border-subtle)', background: 'transparent', cursor: 'pointer' }}
        />
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
      </label>

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
