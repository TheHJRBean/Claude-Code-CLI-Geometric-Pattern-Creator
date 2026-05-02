import { useEffect, useRef, useState } from 'react'
import type { Segment } from '../types/geometry'
import type { PatternConfig } from '../types/pattern'
import type { Action } from '../state/actions'
import { TILINGS, SYMMETRY_GROUPS } from '../tilings/index'
import type { TileTypeInfo } from '../types/tiling'
import { LAB_PRESETS, LAB_PRESETS_BY_ID } from '../state/labPresets'
import {
  type SavedTessellation,
  listSavedTessellations,
  saveTessellation,
  renameTessellation,
  deleteTessellation,
  duplicateTessellation,
  getTessellation,
} from '../state/customTessellations'
import { ALLOWED_OUTER_FOLDS, DEFAULT_MANDALA_CONFIG, allowedInnerFolds, defaultContactAngleForFold } from '../tilings/mandala'
import { DEFAULT_COMPOSITION_CONFIG, compositionPickerNames } from '../tilings/composition'
import { isPairVerified, verifiedBackgroundsFor } from '../tilings/compositionVerifiedPairs'
import { Canvas } from './Canvas'
import { SandstoneEdge } from './SandstoneEdge'
import { useTheme } from '../theme/ThemeContext'

/**
 * Tessellation Lab — stripped-down mode for prototyping new tessellations.
 * Lab focus is the polygon tessellation itself; strands (PIC contact lines)
 * are an optional overlay, off by default.
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
  activePresetId: string
  onSetActivePresetId: (id: string) => void
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
  activePresetId,
  onSetActivePresetId,
}: Props) {
  const { theme, toggleTheme } = useTheme()
  const svgRef = useRef<SVGSVGElement>(null)
  const segmentsRef = useRef<Segment[]>([])
  const [cpVisible] = useState<Record<string, boolean>>({})
  const [cpActive] = useState<Record<string, number>>({})
  const [showAdvanced, setShowAdvanced] = useState(false)

  // ── Library (Step 14) ─────────────────────────────────
  const [library, setLibrary] = useState<SavedTessellation[]>(() => listSavedTessellations())
  const [libraryError, setLibraryError] = useState<string | null>(null)
  const refreshLibrary = () => setLibrary(listSavedTessellations())
  const flashError = (msg: string | null) => {
    setLibraryError(msg)
    if (msg) window.setTimeout(() => setLibraryError(null), 4000)
  }
  // Saved entries appear in the Preset dropdown under a "saved::" prefix so
  // we can tell them apart from the built-in LAB_PRESETS.
  const SAVED_PREFIX = 'saved::'
  const activeSavedId = activePresetId.startsWith(SAVED_PREFIX)
    ? activePresetId.slice(SAVED_PREFIX.length)
    : ''
  const activeSaved = activeSavedId ? library.find(e => e.id === activeSavedId) ?? null : null

  // Keep library in sync if another tab edits it.
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
  const strandsBasicEligible = !!def && (def.category === 'archimedean' || def.category === 'rosette-patch')

  const resetTessellationDefaults = () => {
    if (config.tiling.type) {
      dispatch({ type: 'SET_TILING_TYPE', payload: config.tiling.type })
    }
  }

  const handlePresetChange = (id: string) => {
    onSetActivePresetId(id)
    if (!id) return
    if (id.startsWith(SAVED_PREFIX)) {
      const entry = getTessellation(id.slice(SAVED_PREFIX.length))
      if (entry) dispatch({ type: 'LOAD_CONFIG', payload: entry.config })
      return
    }
    const preset = LAB_PRESETS_BY_ID[id]
    if (!preset) return
    dispatch({ type: 'LOAD_CONFIG', payload: preset.config })
    if (preset.showStrands !== undefined) onToggleShowStrands(preset.showStrands)
  }

  // ── Library handlers ──────────────────────────────────
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
    if (result.entry) onSetActivePresetId(`${SAVED_PREFIX}${result.entry.id}`)
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
    onSetActivePresetId('')
  }

  const handleDuplicate = () => {
    if (!activeSaved) return
    const result = duplicateTessellation(activeSaved.id)
    if (result.error) {
      flashError(result.error.message)
      return
    }
    refreshLibrary()
    if (result.entry) onSetActivePresetId(`${SAVED_PREFIX}${result.entry.id}`)
  }

  return (
    <div className="app-layout">
      <div className="sidebar sidebar--open">
        {/* ── Header ──────────────────────────────────────── */}
        <div className="sidebar-header">
          {/* Mode toggle (return to Main) */}
          <ModeToggleButton mode={mode} onToggleMode={onToggleMode} />

          {/* Theme toggle */}
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
            Prototype workspace
          </p>
        </div>

        {/* ── Sections ────────────────────────────────────── */}
        <div className="sidebar-sections">
          <div style={{ paddingTop: 20 }}>
            <SectionTitle>Presets</SectionTitle>
            <FieldLabel label="Preset" />
            <select
              className="pattern-select"
              value={activePresetId}
              onChange={e => handlePresetChange(e.target.value)}
            >
              <option value="">— select a preset —</option>
              <optgroup label="Tessellations">
                {LAB_PRESETS.filter(p => p.category !== 'mandala' && p.category !== 'composition').map(p => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </optgroup>
              <optgroup label="Mandalas">
                {LAB_PRESETS.filter(p => p.category === 'mandala').map(p => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </optgroup>
              <optgroup label="Compositions">
                {LAB_PRESETS.filter(p => p.category === 'composition').map(p => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </optgroup>
              {library.length > 0 && (
                <optgroup label="My tessellations">
                  {library.map(e => (
                    <option key={e.id} value={`${SAVED_PREFIX}${e.id}`}>{e.name}</option>
                  ))}
                </optgroup>
              )}
            </select>

            {/* Library controls */}
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
                    border: `1px solid ${
                      'danger' in b && b.danger ? 'var(--border-subtle)' : 'var(--border-subtle)'
                    }`,
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

          <div style={{ paddingTop: 22 }}>
            <SectionTitle>Tessellation</SectionTitle>
            <FieldLabel label="Type" />
            <select
              className="pattern-select"
              value={config.tiling.type}
              onChange={e => {
                onSetActivePresetId('')
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
                {def.category !== 'composition' && (
                  <>
                    <FieldLabel
                      label={def.category === 'mandala' ? 'Outer radius' : 'Scale'}
                      value={String(config.tiling.scale)}
                      unit=" px"
                    />
                    <input
                      type="range"
                      className="pattern-slider"
                      min={30}
                      max={def.category === 'mandala' ? 600 : 300}
                      step={5}
                      value={config.tiling.scale}
                      onChange={e => dispatch({ type: 'SET_SCALE', payload: Number(e.target.value) })}
                    />
                  </>
                )}

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
                  Reset to default angle
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
                  {def.category === 'mandala' ? (
                    <>
                      <div><strong>Outer fold:</strong> {(config.mandala ?? DEFAULT_MANDALA_CONFIG).outerFold}</div>
                      <div><strong>Inner layers:</strong> {(config.mandala ?? DEFAULT_MANDALA_CONFIG).layers.length}</div>
                      <div><strong>Category:</strong> {def.category}</div>
                    </>
                  ) : def.category === 'composition' ? (() => {
                    const c = config.composition ?? DEFAULT_COMPOSITION_CONFIG
                    const centreLabel = TILINGS[c.centre]?.label ?? c.centre
                    const backgroundLabel = TILINGS[c.background]?.label ?? c.background
                    return (
                      <>
                        <div><strong>Centre:</strong> {centreLabel}</div>
                        <div><strong>Background:</strong> {backgroundLabel}</div>
                        <div><strong>Category:</strong> composition</div>
                      </>
                    )
                  })() : (
                    <>
                      <div><strong>Vertex&nbsp;config:</strong> {def.vertexConfig.join('.')}</div>
                      <div><strong>Fold:</strong> {def.foldSymmetry}</div>
                      <div><strong>Category:</strong> {def.category}</div>
                    </>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Layers — only visible when a layered mandala is selected */}
          {def?.category === 'mandala' && (() => {
            const m = config.mandala ?? DEFAULT_MANDALA_CONFIG
            return (
              <div style={{ paddingTop: 22 }}>
                <SectionTitle>Layers</SectionTitle>

                <FieldLabel label="Outer fold" />
                <select
                  className="pattern-select"
                  value={m.outerFold}
                  onChange={e => dispatch({ type: 'SET_MANDALA_OUTER_FOLD', payload: Number(e.target.value) })}
                >
                  {ALLOWED_OUTER_FOLDS.map(f => (
                    <option key={f} value={f}>{f}-fold</option>
                  ))}
                </select>

                {showStrands && (() => {
                  const angle = m.outerContactAngle ?? defaultContactAngleForFold(m.outerFold)
                  return (
                    <>
                      <FieldLabel label="Outer contact angle" value={angle.toFixed(1)} unit="°" />
                      <input
                        type="range"
                        className="pattern-slider"
                        min={10}
                        max={85}
                        step={0.5}
                        value={angle}
                        onChange={e => dispatch({
                          type: 'SET_MANDALA_OUTER_CONTACT_ANGLE',
                          payload: Number(e.target.value),
                        })}
                      />
                    </>
                  )
                })()}

                {m.layers.map((layer, i) => {
                  const opts = allowedInnerFolds(m.outerFold)
                  return (
                    <div key={i} style={{
                      marginTop: 14,
                      padding: '10px 12px',
                      border: '1px solid var(--border-subtle)',
                    }}>
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 6,
                      }}>
                        <span style={{
                          fontFamily: "'Cinzel', Georgia, serif",
                          fontSize: 9,
                          fontWeight: 600,
                          color: 'var(--accent)',
                          letterSpacing: '0.18em',
                          textTransform: 'uppercase',
                        }}>
                          Layer {i + 1}
                        </span>
                        <button
                          onClick={() => dispatch({ type: 'REMOVE_MANDALA_LAYER', payload: { index: i } })}
                          aria-label={`Remove layer ${i + 1}`}
                          style={{
                            background: 'transparent',
                            color: 'var(--text-muted)',
                            border: 'none',
                            fontSize: 14,
                            cursor: 'pointer',
                            padding: '0 4px',
                          }}
                        >
                          ×
                        </button>
                      </div>
                      <FieldLabel label="Fold" />
                      <select
                        className="pattern-select"
                        value={layer.fold}
                        onChange={e => dispatch({
                          type: 'SET_MANDALA_LAYER_FOLD',
                          payload: { index: i, fold: Number(e.target.value) },
                        })}
                      >
                        {opts.map(f => (
                          <option key={f} value={f}>{f}-fold</option>
                        ))}
                      </select>
                      <FieldLabel label="Scale" value={layer.scale.toFixed(2)} />
                      <input
                        type="range"
                        className="pattern-slider"
                        min={0.05}
                        max={1}
                        step={0.01}
                        value={layer.scale}
                        onChange={e => dispatch({
                          type: 'SET_MANDALA_LAYER_SCALE',
                          payload: { index: i, scale: Number(e.target.value) },
                        })}
                      />
                      {(() => {
                        const step = layer.rotationStep ?? 0
                        const btnStyle: React.CSSProperties = {
                          flex: '0 0 auto',
                          padding: '2px 8px',
                          background: 'transparent',
                          color: 'var(--text-primary)',
                          border: '1px solid var(--border-subtle)',
                          cursor: 'pointer',
                          fontSize: 11,
                          lineHeight: 1,
                        }
                        return (
                          <>
                            <FieldLabel label="Rotation" />
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                onClick={() => dispatch({
                                  type: 'SET_MANDALA_LAYER_ROTATION_STEP',
                                  payload: { index: i, step: step - 1 },
                                })}
                                aria-label={`Rotate layer ${i + 1} backward one step`}
                                style={btnStyle}
                              >
                                ◀
                              </button>
                              <button
                                onClick={() => dispatch({
                                  type: 'SET_MANDALA_LAYER_ROTATION_STEP',
                                  payload: { index: i, step: step + 1 },
                                })}
                                aria-label={`Rotate layer ${i + 1} forward one step`}
                                style={btnStyle}
                              >
                                ▶
                              </button>
                            </div>
                          </>
                        )
                      })()}
                      {showStrands && (() => {
                        const angle = layer.contactAngle ?? defaultContactAngleForFold(layer.fold)
                        return (
                          <>
                            <FieldLabel label="Contact angle" value={angle.toFixed(1)} unit="°" />
                            <input
                              type="range"
                              className="pattern-slider"
                              min={10}
                              max={85}
                              step={0.5}
                              value={angle}
                              onChange={e => dispatch({
                                type: 'SET_MANDALA_LAYER_CONTACT_ANGLE',
                                payload: { index: i, angle: Number(e.target.value) },
                              })}
                            />
                          </>
                        )
                      })()}
                    </div>
                  )
                })}

                <button
                  disabled={allowedInnerFolds(m.outerFold).length === 0 || m.layers.length >= 4}
                  onClick={() => {
                    const opts = allowedInnerFolds(m.outerFold)
                    if (opts.length === 0) return
                    // Default new layer: largest divisor not already used
                    const used = new Set(m.layers.map(l => l.fold))
                    const fold = [...opts].reverse().find(f => !used.has(f)) ?? opts[opts.length - 1]
                    dispatch({
                      type: 'ADD_MANDALA_LAYER',
                      payload: { fold, scale: 0.5 },
                    })
                  }}
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
                  }}
                >
                  + Add layer
                </button>

                <p style={{
                  marginTop: 12,
                  fontFamily: "'EB Garamond', Georgia, serif",
                  fontStyle: 'italic',
                  fontSize: 11.5,
                  color: 'var(--text-muted)',
                  lineHeight: 1.4,
                }}>
                  Inner folds restricted to divisors of the outer fold (strict-divisor rule).
                </p>
              </div>
            )
          })()}

          {/* Composition — only visible when a composition is selected */}
          {def?.category === 'composition' && (() => {
            const c = config.composition ?? DEFAULT_COMPOSITION_CONFIG
            const pickerNames = compositionPickerNames()
            const verifiedBgs = verifiedBackgroundsFor(c.centre)
            const hasVerifiedBg = verifiedBgs.length > 0
            const pairVerified = isPairVerified(c.centre, c.background)
            // Background dropdown contents: filtered to verified centres unless
            // "Show all backgrounds" is on. With the v1 allow-list empty, no
            // centre has a verified partner, so the filtered list is always
            // empty — when that happens we fall back to the full list and rely
            // on the inline notice to explain.
            const filterApplies = !c.showAllBackgrounds && hasVerifiedBg
            const backgroundOptions = filterApplies ? verifiedBgs : pickerNames
            return (
              <div style={{ paddingTop: 22 }}>
                <SectionTitle>Composition</SectionTitle>

                <FieldLabel label="Centre" />
                <select
                  className="pattern-select"
                  value={c.centre}
                  onChange={e => dispatch({ type: 'SET_COMPOSITION_CENTRE', payload: e.target.value })}
                >
                  {pickerNames.map(name => (
                    <option key={name} value={name}>{TILINGS[name].label}</option>
                  ))}
                </select>

                <FieldLabel label="Background" />
                <select
                  className="pattern-select"
                  value={c.background}
                  onChange={e => dispatch({ type: 'SET_COMPOSITION_BACKGROUND', payload: e.target.value })}
                >
                  {backgroundOptions.map(name => (
                    <option key={name} value={name}>{TILINGS[name].label}</option>
                  ))}
                </select>

                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  marginTop: 8,
                  cursor: 'pointer',
                  fontFamily: "'EB Garamond', Georgia, serif",
                  fontSize: 12.5,
                  color: 'var(--text-muted)',
                }}>
                  <input
                    type="checkbox"
                    className="pattern-checkbox"
                    checked={c.showAllBackgrounds}
                    onChange={e => dispatch({ type: 'SET_COMPOSITION_SHOW_ALL_BACKGROUNDS', payload: e.target.checked })}
                  />
                  Show all backgrounds
                </label>
                {!hasVerifiedBg && (
                  <p style={{
                    marginTop: 6,
                    marginBottom: 0,
                    fontFamily: "'EB Garamond', Georgia, serif",
                    fontSize: 11.5,
                    color: 'var(--text-muted)',
                    lineHeight: 1.4,
                    fontStyle: 'italic',
                  }}>
                    No backgrounds analytically verified to strand-match this
                    centre yet — every pair currently falls back to hard frame.
                  </p>
                )}

                <FieldLabel label="Centre scale" value={String(c.centreScale)} unit=" px" />
                <input
                  type="range"
                  className="pattern-slider"
                  min={20}
                  max={300}
                  step={5}
                  value={c.centreScale}
                  onChange={e => dispatch({ type: 'SET_COMPOSITION_CENTRE_SCALE', payload: Number(e.target.value) })}
                />

                <FieldLabel label="Background scale" value={String(c.backgroundScale)} unit=" px" />
                <input
                  type="range"
                  className="pattern-slider"
                  min={20}
                  max={300}
                  step={5}
                  value={c.backgroundScale}
                  onChange={e => dispatch({ type: 'SET_COMPOSITION_BACKGROUND_SCALE', payload: Number(e.target.value) })}
                />

                <FieldLabel label="Region radius" value={String(c.regionRadius)} unit=" px" />
                <input
                  type="range"
                  className="pattern-slider"
                  min={50}
                  max={800}
                  step={5}
                  value={c.regionRadius}
                  onChange={e => dispatch({ type: 'SET_COMPOSITION_REGION_RADIUS', payload: Number(e.target.value) })}
                />

                <FieldLabel label="Boundary" />
                <div style={{ display: 'flex', gap: 0, marginBottom: 4 }}>
                  {([
                    { key: 'match' as const, label: 'Match strands' },
                    { key: 'frame' as const, label: 'Hard frame' },
                  ]).map(opt => {
                    const active = c.boundary === opt.key
                    const matchDisabled = opt.key === 'match' && !pairVerified
                    return (
                      <button
                        key={opt.key}
                        disabled={matchDisabled}
                        title={matchDisabled
                          ? 'This pair is not in the verified strand-match allow-list — falls back to hard frame.'
                          : undefined}
                        onClick={() => dispatch({ type: 'SET_COMPOSITION_BOUNDARY', payload: opt.key })}
                        style={{
                          flex: 1,
                          padding: '5px 0',
                          fontFamily: "'Cinzel', Georgia, serif",
                          fontSize: 9,
                          fontWeight: 600,
                          letterSpacing: '0.10em',
                          textTransform: 'uppercase',
                          cursor: matchDisabled ? 'not-allowed' : 'pointer',
                          border: `1px solid ${active ? 'var(--accent)' : 'var(--border-subtle)'}`,
                          background: active ? 'var(--accent-bg)' : 'transparent',
                          color: matchDisabled
                            ? 'var(--text-muted)'
                            : active ? 'var(--accent)' : 'var(--text-muted)',
                          opacity: matchDisabled ? 0.5 : 1,
                          transition: 'all 0.15s',
                        }}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
                {c.boundary === 'match' && !pairVerified && (
                  <p style={{
                    marginTop: 4,
                    marginBottom: 0,
                    fontFamily: "'EB Garamond', Georgia, serif",
                    fontSize: 11.5,
                    color: 'var(--text-muted)',
                    lineHeight: 1.4,
                    fontStyle: 'italic',
                  }}>
                    Pair not verified — rendering as hard frame.
                  </p>
                )}

                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  cursor: 'pointer',
                  marginTop: 14,
                  fontFamily: "'EB Garamond', Georgia, serif",
                  fontSize: 13.5,
                  color: c.frameEnabled ? 'var(--text)' : 'var(--text-muted)',
                  transition: 'color 0.15s',
                }}>
                  <input
                    type="checkbox"
                    className="pattern-checkbox"
                    checked={c.frameEnabled}
                    onChange={e => dispatch({ type: 'SET_COMPOSITION_FRAME_ENABLED', payload: e.target.checked })}
                  />
                  Show frame
                </label>

                {c.frameEnabled && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                    <FieldLabel label="Frame colour" />
                    <input
                      type="color"
                      value={c.frameColor.startsWith('#') ? c.frameColor : '#c89b3c'}
                      onChange={e => dispatch({ type: 'SET_COMPOSITION_FRAME_COLOR', payload: e.target.value })}
                      style={{
                        width: 32,
                        height: 24,
                        padding: 0,
                        border: '1px solid var(--border-subtle)',
                        background: 'transparent',
                        cursor: 'pointer',
                      }}
                    />
                  </div>
                )}

                <p style={{
                  marginTop: 12,
                  marginBottom: 0,
                  fontFamily: "'EB Garamond', Georgia, serif",
                  fontSize: 12,
                  color: 'var(--text-muted)',
                  lineHeight: 1.4,
                }}>
                  Strand-match requires analytically-verified centre/background
                  pairs (CS-1). The allow-list is empty in v1, so every preset
                  currently renders as hard frame regardless of this toggle.
                </p>
              </div>
            )
          })()}

          {/* Strands — basic per-tile-type controls.
              Only visible when strands are on AND the active tessellation
              uses the standard PIC pipeline (archimedean / rosette-patch).
              Mandala / composition show a placeholder pointing at Step 12 / 13. */}
          {showStrands && def && (
            <div style={{ paddingTop: 22 }}>
              <SectionTitle>Strands</SectionTitle>
              {strandsBasicEligible ? (
                <>
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
                </>
              ) : (
                <p style={{
                  marginTop: 0,
                  marginBottom: 0,
                  padding: '8px 10px',
                  border: '1px dashed var(--border-subtle)',
                  fontFamily: "'EB Garamond', Georgia, serif",
                  fontSize: 12,
                  color: 'var(--text-muted)',
                  lineHeight: 1.4,
                }}>
                  {def.category === 'mandala'
                    ? 'Per-layer contact angles live in the Layers panel above.'
                    : 'Per-side strand controls live in Main mode for now. Boundary and pair selection are in the Composition panel above.'}
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
