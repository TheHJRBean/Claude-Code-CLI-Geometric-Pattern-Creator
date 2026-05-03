import { useEffect, useRef, useState } from 'react'
import type { Segment } from '../types/geometry'
import type { PatternConfig } from '../types/pattern'
import type { Action } from '../state/actions'
import { TILINGS, SYMMETRY_GROUPS } from '../tilings/index'
import type { TileTypeInfo } from '../types/tiling'
import {
  type SavedTessellation,
  listSavedTessellations,
  saveTessellation,
  renameTessellation,
  deleteTessellation,
  duplicateTessellation,
  getTessellation,
} from '../state/customTessellations'
import { Canvas } from './Canvas'
import { SandstoneEdge } from './SandstoneEdge'
import { useTheme } from '../theme/ThemeContext'

/**
 * Tessellation Lab — workspace for prototyping tessellations and (next phase)
 * the user-editable tessellation editor. The Lab focus is the polygon
 * tessellation itself; strands (PIC contact lines) are an optional overlay,
 * off by default.
 *
 * State is owned by App so it survives mode toggles.
 */

interface Props {
  mode: 'main' | 'lab'
  onToggleMode: () => void
  config: PatternConfig
  dispatch: React.Dispatch<Action>
  showStrands: boolean
  onToggleShowStrands: (next: boolean) => void
  outlineWidth: number
  onSetOutlineWidth: (next: number) => void
  fillOnHover: boolean
  onToggleFillOnHover: (next: boolean) => void
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

export function TessellationLabMode({
  mode,
  onToggleMode,
  config,
  dispatch,
  showStrands,
  onToggleShowStrands,
  outlineWidth,
  onSetOutlineWidth,
  fillOnHover,
  onToggleFillOnHover,
}: Props) {
  const { theme, toggleTheme } = useTheme()
  const svgRef = useRef<SVGSVGElement>(null)
  const segmentsRef = useRef<Segment[]>([])
  const [cpVisible] = useState<Record<string, boolean>>({})
  const [cpActive] = useState<Record<string, number>>({})
  const [showAdvanced, setShowAdvanced] = useState(false)

  // ── Library ────────────────────────────────────────────
  const [library, setLibrary] = useState<SavedTessellation[]>(() => listSavedTessellations())
  const [activeSavedId, setActiveSavedId] = useState<string>('')
  const [libraryError, setLibraryError] = useState<string | null>(null)
  const refreshLibrary = () => setLibrary(listSavedTessellations())
  const flashError = (msg: string | null) => {
    setLibraryError(msg)
    if (msg) window.setTimeout(() => setLibraryError(null), 4000)
  }
  const activeSaved = activeSavedId ? library.find(e => e.id === activeSavedId) ?? null : null

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'lab-tessellations-v1') refreshLibrary()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const def = config.tiling.type ? TILINGS[config.tiling.type] : undefined
  const tileTypes: TileTypeInfo[] = def
    ? def.tileTypes ?? Array.from(new Set(def.vertexConfig)).map(n => ({ id: String(n), sides: n, label: `${n}-gon` }))
    : []

  const resetTessellationDefaults = () => {
    if (config.tiling.type) {
      dispatch({ type: 'SET_TILING_TYPE', payload: config.tiling.type })
    }
  }

  const handleLoadSaved = (id: string) => {
    setActiveSavedId(id)
    if (!id) return
    const entry = getTessellation(id)
    if (entry) dispatch({ type: 'LOAD_CONFIG', payload: entry.config })
  }

  const handleSave = () => {
    const suggested = activeSaved
      ? `${activeSaved.name} (modified)`
      : def
        ? def.label
        : 'Untitled'
    const name = window.prompt('Name this tessellation', suggested)
    if (name === null) return
    const result = saveTessellation(name, config)
    if (result.error) {
      flashError(result.error.message)
      return
    }
    refreshLibrary()
    if (result.entry) setActiveSavedId(result.entry.id)
  }

  const handleRename = () => {
    if (!activeSaved) return
    const next = window.prompt('Rename tessellation', activeSaved.name)
    if (next === null) return
    const err = renameTessellation(activeSaved.id, next)
    if (err) flashError(err.message)
    else refreshLibrary()
  }

  const handleDelete = () => {
    if (!activeSaved) return
    const ok = window.confirm(`Delete "${activeSaved.name}"? This cannot be undone.`)
    if (!ok) return
    const err = deleteTessellation(activeSaved.id)
    if (err) {
      flashError(err.message)
      return
    }
    refreshLibrary()
    setActiveSavedId('')
  }

  const handleDuplicate = () => {
    if (!activeSaved) return
    const result = duplicateTessellation(activeSaved.id)
    if (result.error) {
      flashError(result.error.message)
      return
    }
    refreshLibrary()
    if (result.entry) setActiveSavedId(result.entry.id)
  }

  return (
    <div className="app-layout">
      <div className="sidebar sidebar--open">
        {/* ── Header ──────────────────────────────────────── */}
        <div className="sidebar-header">
          <ModeToggleButton mode={mode} onToggleMode={onToggleMode} />

          <button
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>

          <h1 style={{
            fontFamily: "'Cinzel', Georgia, serif",
            fontSize: 16,
            fontWeight: 700,
            color: 'var(--text)',
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            marginTop: 48,
            marginBottom: 5,
          }}>
            Tessellation Lab
          </h1>

          <p style={{
            fontFamily: "'EB Garamond', Georgia, serif",
            fontStyle: 'italic',
            fontSize: 12.5,
            color: 'var(--text-muted)',
            letterSpacing: '0.06em',
            marginBottom: 12,
          }}>
            Editor workspace
          </p>
        </div>

        {/* ── Sections ────────────────────────────────────── */}
        <div className="sidebar-sections">
          {/* Editor placeholder — this is where the next phase docks. */}
          <div style={{ paddingTop: 20 }}>
            <SectionTitle>Editor</SectionTitle>
            <p style={{
              marginTop: 0,
              marginBottom: 0,
              padding: '10px 12px',
              border: '1px dashed var(--border-subtle)',
              fontFamily: "'EB Garamond', Georgia, serif",
              fontSize: 12.5,
              color: 'var(--text-muted)',
              lineHeight: 1.5,
            }}>
              Drag-and-drop tessellation editor coming soon. For now the Lab
              renders the standard tessellations below; saved layouts will
              appear in the library once the editor ships.
            </p>
          </div>

          <div style={{ paddingTop: 22 }}>
            <SectionTitle>Tessellation</SectionTitle>
            <FieldLabel label="Type" />
            <select
              className="pattern-select"
              value={config.tiling.type}
              onChange={e => {
                setActiveSavedId('')
                dispatch({ type: 'SET_TILING_TYPE', payload: e.target.value })
              }}
            >
              <option value="">— select a tessellation —</option>
              {SYMMETRY_GROUPS.map(group => (
                <optgroup key={group.fold} label={`${group.label} Symmetry`}>
                  {group.tilings.map(name => (
                    <option key={name} value={name}>{TILINGS[name].label}</option>
                  ))}
                </optgroup>
              ))}
            </select>

            {def && (
              <>
                <FieldLabel
                  label="Scale"
                  value={String(config.tiling.scale)}
                  unit=" px"
                />
                <input
                  type="range"
                  className="pattern-slider"
                  min={30}
                  max={300}
                  step={5}
                  value={config.tiling.scale}
                  onChange={e => dispatch({ type: 'SET_SCALE', payload: Number(e.target.value) })}
                />

                <button
                  onClick={resetTessellationDefaults}
                  style={{
                    marginTop: 14,
                    width: '100%',
                    padding: '7px 10px',
                    background: 'transparent',
                    color: 'var(--accent)',
                    border: '1px solid var(--border-accent)',
                    fontFamily: "'Cinzel', Georgia, serif",
                    fontSize: 9,
                    fontWeight: 600,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                    transition: 'border-color 0.15s, background 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-accent)' }}
                >
                  Reset to defaults
                </button>

                <div style={{
                  marginTop: 18,
                  padding: '10px 12px',
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--bg-surface, transparent)',
                  fontFamily: "'EB Garamond', Georgia, serif",
                  fontSize: 12.5,
                  color: 'var(--text-muted)',
                  letterSpacing: '0.02em',
                  lineHeight: 1.55,
                }}>
                  <div style={{
                    fontFamily: "'Cinzel', Georgia, serif",
                    fontSize: 9,
                    fontWeight: 600,
                    color: 'var(--accent)',
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    marginBottom: 6,
                  }}>
                    Info
                  </div>
                  <div><strong>Vertex&nbsp;config:</strong> {def.vertexConfig.join('.')}</div>
                  <div><strong>Fold:</strong> {def.foldSymmetry}</div>
                  <div><strong>Category:</strong> {def.category}</div>
                </div>
              </>
            )}
          </div>

          {/* Library — Save / Rename / Duplicate / Delete + saved entries dropdown */}
          <div style={{ paddingTop: 22 }}>
            <SectionTitle>My Tessellations</SectionTitle>
            <FieldLabel label="Saved" />
            <select
              className="pattern-select"
              value={activeSavedId}
              onChange={e => handleLoadSaved(e.target.value)}
            >
              <option value="">— select a saved tessellation —</option>
              {library.map(e => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>

            <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
              {([
                { label: 'Save', onClick: handleSave, disabled: !config.tiling.type },
                { label: 'Rename', onClick: handleRename, disabled: !activeSaved },
                { label: 'Duplicate', onClick: handleDuplicate, disabled: !activeSaved },
                { label: 'Delete', onClick: handleDelete, disabled: !activeSaved, danger: true },
              ] as const).map(b => (
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
            {libraryError && (
              <p style={{
                marginTop: 6,
                marginBottom: 0,
                fontFamily: "'EB Garamond', Georgia, serif",
                fontSize: 12,
                color: '#a85050',
                lineHeight: 1.4,
              }}>
                {libraryError}
              </p>
            )}
            {!libraryError && activeSaved && (
              <p style={{
                marginTop: 6,
                marginBottom: 0,
                fontFamily: "'EB Garamond', Georgia, serif",
                fontStyle: 'italic',
                fontSize: 11.5,
                color: 'var(--text-muted)',
                lineHeight: 1.4,
              }}>
                Saved {new Date(activeSaved.createdAt).toLocaleString()}
              </p>
            )}
          </div>

          {/* Strands — basic per-tile-type controls.
              Only visible when strands are on AND a tessellation is selected. */}
          {showStrands && def && (
            <div style={{ paddingTop: 22 }}>
              <SectionTitle>Strands</SectionTitle>
              {tileTypes.map(tt => {
                const fig = config.figures[tt.id]
                if (!fig) return null
                return (
                  <div key={tt.id} style={{
                    marginBottom: 14,
                    padding: '10px 12px',
                    border: '1px solid var(--border-subtle)',
                  }}>
                    <span style={{
                      fontFamily: "'Cinzel', Georgia, serif",
                      fontSize: 9,
                      fontWeight: 600,
                      color: 'var(--accent)',
                      letterSpacing: '0.18em',
                      textTransform: 'uppercase',
                    }}>
                      {tt.label}
                    </span>

                    <FieldLabel label="Figure" />
                    <div style={{ display: 'flex', gap: 0, marginBottom: 4 }}>
                      {(['star', 'rosette'] as const).map(ft => {
                        const active = fig.type === ft
                        return (
                          <button
                            key={ft}
                            onClick={() => dispatch({ type: 'SET_FIGURE_TYPE', payload: { tileTypeId: tt.id, figureType: ft } })}
                            style={{
                              flex: 1,
                              padding: '5px 0',
                              fontFamily: "'Cinzel', Georgia, serif",
                              fontSize: 9,
                              fontWeight: 600,
                              letterSpacing: '0.10em',
                              textTransform: 'uppercase',
                              cursor: 'pointer',
                              border: `1px solid ${active ? 'var(--accent)' : 'var(--border-subtle)'}`,
                              background: active ? 'var(--accent-bg)' : 'transparent',
                              color: active ? 'var(--accent)' : 'var(--text-muted)',
                              transition: 'all 0.15s',
                            }}
                          >
                            {ft}
                          </button>
                        )
                      })}
                    </div>

                    <FieldLabel label="Contact angle" value={fig.contactAngle.toFixed(1)} unit="°" />
                    <input
                      type="range"
                      className="pattern-slider"
                      min={10}
                      max={85}
                      step={0.5}
                      value={fig.contactAngle}
                      onChange={e => dispatch({
                        type: 'SET_CONTACT_ANGLE',
                        payload: { tileTypeId: tt.id, angle: Number(e.target.value) },
                      })}
                    />

                    <label style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      marginTop: 10,
                      cursor: 'pointer',
                      fontFamily: "'EB Garamond', Georgia, serif",
                      fontSize: 13.5,
                      color: fig.autoLineLength ? 'var(--text)' : 'var(--text-muted)',
                      transition: 'color 0.15s',
                    }}>
                      <input
                        type="checkbox"
                        className="pattern-checkbox"
                        checked={fig.autoLineLength}
                        onChange={e => dispatch({
                          type: 'SET_AUTO_LINE_LENGTH',
                          payload: { tileTypeId: tt.id, auto: e.target.checked },
                        })}
                      />
                      Auto strand length
                    </label>

                    {!fig.autoLineLength && (
                      <>
                        <FieldLabel
                          label="Strand length"
                          value={(fig.lineLength * 100).toFixed(0)}
                          unit="%"
                        />
                        <input
                          type="range"
                          className="pattern-slider"
                          min={10}
                          max={500}
                          step={1}
                          value={Math.round(fig.lineLength * 100)}
                          onChange={e => dispatch({
                            type: 'SET_LINE_LENGTH',
                            payload: { tileTypeId: tt.id, lineLength: Number(e.target.value) / 100 },
                          })}
                        />
                      </>
                    )}
                  </div>
                )
              })}

              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                marginTop: 6,
                cursor: 'pointer',
                fontFamily: "'EB Garamond', Georgia, serif",
                fontSize: 13.5,
                color: showAdvanced ? 'var(--text)' : 'var(--text-muted)',
                transition: 'color 0.15s',
              }}>
                <input
                  type="checkbox"
                  className="pattern-checkbox"
                  checked={showAdvanced}
                  onChange={e => setShowAdvanced(e.target.checked)}
                />
                Show advanced
              </label>
              {showAdvanced && (
                <p style={{
                  marginTop: 8,
                  marginBottom: 0,
                  padding: '8px 10px',
                  border: '1px dashed var(--border-subtle)',
                  fontFamily: "'EB Garamond', Georgia, serif",
                  fontSize: 12,
                  color: 'var(--text-muted)',
                  lineHeight: 1.4,
                }}>
                  Advanced controls (vertex strands, curves, snap, decoupled
                  vertex angle) are available in Main mode. Surfacing them
                  in Lab is parked — switch to Main if you need them.
                </p>
              )}
            </div>
          )}

          {/* Display — strand overlay + outline weight + hover fill */}
          <div style={{ paddingTop: 22 }}>
            <SectionTitle>Display</SectionTitle>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              cursor: 'pointer',
              fontFamily: "'EB Garamond', Georgia, serif",
              fontSize: 13.5,
              color: showStrands ? 'var(--text)' : 'var(--text-muted)',
              transition: 'color 0.15s',
            }}>
              <input
                type="checkbox"
                className="pattern-checkbox"
                checked={showStrands}
                onChange={e => onToggleShowStrands(e.target.checked)}
              />
              Show strands
            </label>

            <FieldLabel
              label="Outline weight"
              value={outlineWidth.toFixed(1)}
              unit=" px"
            />
            <input
              type="range"
              className="pattern-slider"
              min={0.2}
              max={4}
              step={0.1}
              value={outlineWidth}
              onChange={e => onSetOutlineWidth(Number(e.target.value))}
            />

            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginTop: 14,
              cursor: 'pointer',
              fontFamily: "'EB Garamond', Georgia, serif",
              fontSize: 13.5,
              color: fillOnHover ? 'var(--text)' : 'var(--text-muted)',
              transition: 'color 0.15s',
            }}>
              <input
                type="checkbox"
                className="pattern-checkbox"
                checked={fillOnHover}
                onChange={e => onToggleFillOnHover(e.target.checked)}
              />
              Fill tile on hover
            </label>
          </div>
        </div>
      </div>

      <div className="sandstone-edge-wrapper" aria-hidden="true">
        <SandstoneEdge />
      </div>
      <Canvas
        config={config}
        showTileLayer={true}
        showLines={showStrands}
        svgRef={svgRef}
        segmentsRef={segmentsRef}
        cpVisible={cpVisible}
        cpActive={cpActive}
        outlineWidth={outlineWidth}
        fillOnHover={fillOnHover}
      />
    </div>
  )
}

/* ── Local helpers ────────────────────────────────────── */

function ModeToggleButton({ mode, onToggleMode }: { mode: 'main' | 'lab'; onToggleMode: () => void }) {
  const inMain = mode === 'main'
  return (
    <button
      onClick={onToggleMode}
      aria-label={inMain ? 'Open Tessellation Lab' : 'Return to Main mode'}
      title={inMain ? 'Open Tessellation Lab' : 'Return to Main mode'}
      style={{
        position: 'absolute',
        top: 14,
        left: 12,
        height: 26,
        background: inMain ? 'transparent' : 'var(--accent-bg)',
        color: 'var(--accent)',
        border: `1px solid ${inMain ? 'var(--border-accent)' : 'var(--accent)'}`,
        padding: '0 10px',
        fontFamily: "'Cinzel', Georgia, serif",
        fontSize: 9,
        fontWeight: 600,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        cursor: 'pointer',
        zIndex: 5,
      }}
    >
      {inMain ? 'Lab' : '← Main'}
    </button>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 7,
      marginBottom: 14,
    }}>
      <span style={{
        fontFamily: "'Cinzel', Georgia, serif",
        fontSize: 10,
        fontWeight: 600,
        color: 'var(--accent)',
        letterSpacing: '0.20em',
        textTransform: 'uppercase' as const,
      }}>
        {children}
      </span>
      <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, var(--divider), transparent)' }} />
    </div>
  )
}

function FieldLabel({ label, value, unit }: { label: string; value?: string; unit?: string }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      marginBottom: 7,
      marginTop: 12,
    }}>
      <span style={{
        fontFamily: "'EB Garamond', Georgia, serif",
        fontSize: 13.5,
        color: 'var(--text-secondary)',
        letterSpacing: '0.02em',
      }}>
        {label}
      </span>
      {value !== undefined && (
        <span style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11,
          color: 'var(--accent)',
          letterSpacing: '0.04em',
        }}>
          {value}{unit}
        </span>
      )}
    </div>
  )
}

export { ModeToggleButton }
