import { useRef, useState } from 'react'
import type { Segment } from '../types/geometry'
import type { PatternConfig } from '../types/pattern'
import type { Action } from '../state/actions'
import { TILINGS, SYMMETRY_GROUPS } from '../tilings/index'
import { LAB_PRESETS, LAB_PRESETS_BY_ID } from '../state/labPresets'
import { ALLOWED_OUTER_FOLDS, DEFAULT_MANDALA_CONFIG, allowedInnerFolds } from '../tilings/mandala'
import { DEFAULT_COMPOSITION_CONFIG, compositionPickerNames } from '../tilings/composition'
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
  activePresetId,
  onSetActivePresetId,
}: Props) {
  const { theme, toggleTheme } = useTheme()
  const svgRef = useRef<SVGSVGElement>(null)
  const segmentsRef = useRef<Segment[]>([])
  const [cpVisible] = useState<Record<string, boolean>>({})
  const [cpActive] = useState<Record<string, number>>({})

  const def = config.tiling.type ? TILINGS[config.tiling.type] : undefined

  const resetTessellationDefaults = () => {
    if (config.tiling.type) {
      dispatch({ type: 'SET_TILING_TYPE', payload: config.tiling.type })
    }
  }

  const handlePresetChange = (id: string) => {
    onSetActivePresetId(id)
    if (!id) return
    const preset = LAB_PRESETS_BY_ID[id]
    if (!preset) return
    dispatch({ type: 'LOAD_CONFIG', payload: preset.config })
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
            </select>
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
                  Strand rendering for mandalas arrives in Step 12.
                </p>
              </div>
            )
          })()}

          {/* Composition — only visible when a composition is selected */}
          {def?.category === 'composition' && (() => {
            const c = config.composition ?? DEFAULT_COMPOSITION_CONFIG
            const pickerNames = compositionPickerNames()
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
                  {pickerNames.map(name => (
                    <option key={name} value={name}>{TILINGS[name].label}</option>
                  ))}
                </select>

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
                  v1 ships hard-frame only. Strand-match across the boundary arrives in Step 13.
                </p>
              </div>
            )
          })()}

          {/* Display — strand overlay toggle */}
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
