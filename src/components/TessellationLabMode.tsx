import { useEffect, useRef, useState } from 'react'
import type { Segment } from '../types/geometry'
import type { PatternConfig } from '../types/pattern'
import type { Action } from '../state/actions'
import { TILINGS } from '../tilings/index'
import type { TileTypeInfo } from '../types/tiling'
import { createConfigLibrary } from '../state/configLibrary'
import { ConfigLibraryPanel } from './ConfigLibraryPanel'
import { Canvas, type SelectedEdge } from './Canvas'
import { SandstoneEdge } from './SandstoneEdge'
import { useTheme } from '../theme/ThemeContext'
import { SAMPLE_EDITOR_CONFIG } from '../editor/sampleConfig'
import { BOUNDARY_SIZE_MAX_BY_SHAPE } from '../editor/createDefault'
import { LAB_DEFAULT_CONFIG } from '../state/labDefaults'
import type { BoundaryShape } from '../types/editor'
import { editorTileTypes } from '../editor/tileTypes'
import { useEditorHistory } from '../editor/useEditorHistory'
import { detectPatchTilingStatus } from '../editor/nonTilingDetection'

const labLibrary = createConfigLibrary('lab-tessellations-v1')

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
  dispatch: rawDispatch,
  showStrands,
  onToggleShowStrands,
  outlineWidth,
  onSetOutlineWidth,
}: Props) {
  const { theme, toggleTheme } = useTheme()
  const svgRef = useRef<SVGSVGElement>(null)
  const segmentsRef = useRef<Segment[]>([])
  const [cpVisible] = useState<Record<string, boolean>>({})
  const [cpActive] = useState<Record<string, number>>({})
  const [showAdvanced, setShowAdvanced] = useState(false)

  // Step 17.9 — wrap dispatch so design-mode editor mutations push undo
  // snapshots. All Lab-side dispatches must use this `dispatch`; bypassing
  // it skips history. `LOAD_CONFIG` clears the stack inside the hook (Q12).
  const { dispatch, undo, redo, canUndo, canRedo } = useEditorHistory(
    config.editor,
    rawDispatch,
  )

  // Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z (or Ctrl+Y) drive undo / redo. Listener
  // is mounted only while Lab is active since the component unmounts on
  // mode toggle.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey
      if (!meta) return
      // Ignore if focus is in an input/textarea/select so typing into the
      // library Save / Rename prompt doesn't trigger undo.
      const target = e.target as HTMLElement | null
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  // ── Editor selection (Step 17.3) ───────────────────────
  const [selectedEdge, setSelectedEdge] = useState<SelectedEdge | null>(null)
  // Drop the selection whenever the editor patch is cleared or replaced.
  useEffect(() => {
    if (config.tiling.type !== 'editor' || !config.editor) setSelectedEdge(null)
  }, [config.tiling.type, config.editor])
  const handlePlaceTile = (sides: number) => {
    if (!selectedEdge) return
    dispatch({ type: 'EDITOR_PLACE_TILE_ON_EDGE', payload: { ...selectedEdge, sides } })
  }
  const handleDeleteTile = (tileId: string) => {
    dispatch({ type: 'EDITOR_DELETE_TILE', payload: { tileId } })
  }

  // ── Editor mode + Complete picker (Step 17.5) ──────────
  const [editorMode, setEditorMode] = useState<'place' | 'complete'>('place')
  const [firstVertexPick, setFirstVertexPick] = useState<{ x: number; y: number } | null>(null)
  // Step 17.6 — Design vs Strand-editor mode flip (Decision 15). Local UI
  // state — not persisted; figures persist independently per Q15.
  const [editorPhase, setEditorPhase] = useState<'design' | 'strand'>('design')
  // Step 17.6 — strand mode: show the patch boundary stamped on the lattice.
  const [showBoundaryLattice, setShowBoundaryLattice] = useState(false)
  // Step 17.6d — Design mode: low-opacity ghost copies of the patch at the
  // one-ring lattice neighbours so the user can preview how their patch
  // joins the surrounding stamps before flipping to Strand mode.
  const [showNeighbours, setShowNeighbours] = useState(false)
  const [showNeighbourBoundaries, setShowNeighbourBoundaries] = useState(false)
  const [showNeighbourStrands, setShowNeighbourStrands] = useState(false)
  // Mirror Main-mode's tile-visibility toggle.
  const [showTiles, setShowTiles] = useState(true)
  // Drop strand mode if the patch goes away.
  useEffect(() => {
    if (config.tiling.type !== 'editor' || !config.editor) setEditorPhase('design')
  }, [config.tiling.type, config.editor])
  // Reset picker state when patch changes or mode flips.
  useEffect(() => { setFirstVertexPick(null) }, [editorMode, config.editor])
  useEffect(() => {
    if (config.tiling.type !== 'editor' || !config.editor) {
      setEditorMode('place')
      setFirstVertexPick(null)
    }
  }, [config.tiling.type, config.editor])
  // Esc cancels an in-progress complete pick.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFirstVertexPick(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const handlePickVertex = (p: { x: number; y: number }) => {
    if (!firstVertexPick) {
      setFirstVertexPick(p)
      return
    }
    // Clicking the same vertex twice cancels.
    if (Math.abs(firstVertexPick.x - p.x) < 1e-6 && Math.abs(firstVertexPick.y - p.y) < 1e-6) {
      setFirstVertexPick(null)
      return
    }
    dispatch({ type: 'EDITOR_COMPLETE_GAP', payload: { pA: firstVertexPick, pB: p } })
    setFirstVertexPick(null)
  }

  // ── Library ────────────────────────────────────────────
  // Active-entry selection lives here so external buttons (Clear / New /
  // Sample) can reset it via the controlled prop on `ConfigLibraryPanel`.
  const [activeSavedId, setActiveSavedId] = useState<string>('')

  // ── Section collapse (matches Main mode pattern) ───────
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('lab-sidebar-collapsed-sections')
      return saved ? JSON.parse(saved) : {}
    } catch { return {} }
  })
  const toggleSection = (key: string) => {
    setCollapsedSections(prev => {
      const next = { ...prev, [key]: !prev[key] }
      try { localStorage.setItem('lab-sidebar-collapsed-sections', JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }
  const isOpen = (key: string) => !collapsedSections[key]

  const def = config.tiling.type ? TILINGS[config.tiling.type] : undefined
  // Editor patches don't have a `TilingDefinition` — derive their tile types
  // from the patch itself so the strand panel renders one card per distinct
  // n-gon (and one per distinct irregular signature) currently on canvas.
  const tileTypes: TileTypeInfo[] = config.tiling.type === 'editor' && config.editor
    ? editorTileTypes(config.editor)
    : def
      ? def.tileTypes ?? Array.from(new Set(def.vertexConfig)).map(n => ({ id: String(n), sides: n, label: `${n}-gon` }))
      : []

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
          {/* Editor — Step 17. 17.2 ships the Design-mode shell: when a patch
              is active, expose boundary shape + size + origin sides. The
              origin polygon auto-places at the patch centre per Decision 6;
              boundary size only rescales the lattice cell (Q9 Option B). */}
          <div style={{ paddingTop: 20 }}>
            <SectionTitle open={isOpen('editor')} onToggle={() => toggleSection('editor')}>Editor</SectionTitle>
            {isOpen('editor') && (config.tiling.type === 'editor' && config.editor ? (
              <EditorDesignControls
                editor={config.editor}
                dispatch={dispatch}
                onClear={() => {
                  setActiveSavedId('')
                  dispatch({ type: 'EDITOR_CLEAR' })
                }}
                editorMode={editorMode}
                onSetEditorMode={m => {
                  setEditorMode(m)
                  setSelectedEdge(null)
                  setFirstVertexPick(null)
                }}
                firstVertexPick={firstVertexPick}
                onCancelComplete={() => setFirstVertexPick(null)}
                editorPhase={editorPhase}
                onSetEditorPhase={p => {
                  // Step 17.7 — fire auto-complete on the Design→Strand
                  // transition when the user opted in. Reducer is idempotent
                  // on already-convex patches, so re-flips are safe.
                  if (
                    p === 'strand'
                    && editorPhase === 'design'
                    && config.editor?.autoComplete?.enabled
                  ) {
                    dispatch({ type: 'EDITOR_RUN_AUTO_COMPLETE' })
                  }
                  setEditorPhase(p)
                  // Clear in-flight design picks when entering strand mode.
                  if (p === 'strand') {
                    setSelectedEdge(null)
                    setFirstVertexPick(null)
                  }
                }}
                showBoundaryLattice={showBoundaryLattice}
                onToggleShowBoundaryLattice={setShowBoundaryLattice}
                showNeighbours={showNeighbours}
                onToggleShowNeighbours={setShowNeighbours}
                showNeighbourBoundaries={showNeighbourBoundaries}
                onToggleShowNeighbourBoundaries={setShowNeighbourBoundaries}
                showNeighbourStrands={showNeighbourStrands}
                onToggleShowNeighbourStrands={setShowNeighbourStrands}
                onUndo={undo}
                onRedo={redo}
                canUndo={canUndo}
                canRedo={canRedo}
              />
            ) : (
              <>
                <p style={{
                  marginTop: 0,
                  marginBottom: 10,
                  fontFamily: "'EB Garamond', Georgia, serif",
                  fontSize: 12.5,
                  color: 'var(--text-muted)',
                  lineHeight: 1.5,
                }}>
                  Build a tessellation patch from a chosen boundary and origin
                  polygon. Start with "New patch", or load the hand-built
                  sample to see what the renderer accepts.
                </p>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {([
                    {
                      label: 'New patch',
                      onClick: () => {
                        setActiveSavedId('')
                        dispatch({ type: 'EDITOR_NEW' })
                      },
                    },
                    {
                      label: 'Show sample patch',
                      onClick: () => {
                        setActiveSavedId('')
                        dispatch({
                          type: 'LOAD_CONFIG',
                          payload: {
                            ...LAB_DEFAULT_CONFIG,
                            tiling: { type: 'editor', scale: 100 },
                            editor: SAMPLE_EDITOR_CONFIG,
                          },
                        })
                      },
                    },
                  ] as const).map(b => (
                    <button
                      key={b.label}
                      onClick={b.onClick}
                      style={{
                        flex: '1 1 0',
                        minWidth: 0,
                        padding: '5px 0',
                        fontFamily: "'Cinzel', Georgia, serif",
                        fontSize: 9,
                        fontWeight: 600,
                        letterSpacing: '0.10em',
                        textTransform: 'uppercase',
                        cursor: 'pointer',
                        border: '1px solid var(--border-subtle)',
                        background: 'transparent',
                        color: 'var(--text-muted)',
                        transition: 'all 0.15s',
                      }}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
              </>
            ))}
          </div>

          {/* Library — Save / Rename / Duplicate / Delete + saved entries dropdown */}
          <div style={{ paddingTop: 22 }}>
            <SectionTitle open={isOpen('library')} onToggle={() => toggleSection('library')}>My Tessellations</SectionTitle>
            {isOpen('library') && (
              <ConfigLibraryPanel
                library={labLibrary}
                currentConfig={config}
                onLoad={c => dispatch({ type: 'LOAD_CONFIG', payload: c })}
                nounSingular="tessellation"
                activeId={activeSavedId}
                onActiveIdChange={setActiveSavedId}
              />
            )}
          </div>

          {/* Strands — basic per-tile-type controls.
              Visible when strands are on AND we have something to render
              over: a static tessellation definition, or an editor patch
              (17.6a — the strand panel's tile cards now reflect the patch). */}
          {showStrands && (def || (config.tiling.type === 'editor' && config.editor)) && (
            <div style={{ paddingTop: 22 }}>
              <SectionTitle open={isOpen('strands')} onToggle={() => toggleSection('strands')}>Strands</SectionTitle>
              {isOpen('strands') && (<>
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
              </>)}
            </div>
          )}

          {/* Display — strand overlay + outline weight + hover fill */}
          <div style={{ paddingTop: 22 }}>
            <SectionTitle open={isOpen('display')} onToggle={() => toggleSection('display')}>Display</SectionTitle>
            {isOpen('display') && (<>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              cursor: 'pointer',
              fontFamily: "'EB Garamond', Georgia, serif",
              fontSize: 13.5,
              color: showTiles ? 'var(--text)' : 'var(--text-muted)',
              transition: 'color 0.15s',
            }}>
              <input
                type="checkbox"
                className="pattern-checkbox"
                checked={showTiles}
                onChange={e => setShowTiles(e.target.checked)}
              />
              Show tiles
            </label>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginTop: 10,
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
            </>)}
          </div>
        </div>
      </div>
      <div className="sandstone-edge-wrapper" aria-hidden="true">
        <SandstoneEdge />
      </div>
      <Canvas
        config={config}
        showTileLayer={showTiles}
        showLines={showStrands}
        svgRef={svgRef}
        segmentsRef={segmentsRef}
        cpVisible={cpVisible}
        cpActive={cpActive}
        outlineWidth={outlineWidth}
        selectedEdge={selectedEdge}
        onSelectEdge={setSelectedEdge}
        onPlaceTile={handlePlaceTile}
        onDeleteTile={handleDeleteTile}
        editorMode={editorMode}
        firstVertexPick={firstVertexPick}
        onPickVertex={handlePickVertex}
        editorStrandMode={editorPhase === 'strand'}
        showBoundaryLattice={showBoundaryLattice}
        editorNeighbourPreview={editorPhase === 'design' && showNeighbours && !config.editor?.wrapBoundary}
        editorNeighbourBoundaries={showNeighbourBoundaries}
        editorNeighbourStrands={showNeighbourStrands}
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

function SectionChevron({ open }: { open: boolean }) {
  return (
    <svg
      width="9"
      height="9"
      viewBox="0 0 10 10"
      style={{
        transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
        transition: 'transform 0.2s ease',
        flexShrink: 0,
        color: 'var(--accent)',
        opacity: 0.5,
      }}
      aria-hidden="true"
    >
      <polyline points="2.5 4 5 6.5 7.5 4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function SectionTitle({ children, open, onToggle }: {
  children: React.ReactNode
  open?: boolean
  onToggle?: () => void
}) {
  const interactive = typeof onToggle === 'function'
  const isOpen = open ?? true
  const inner = (
    <>
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
      {interactive && <SectionChevron open={isOpen} />}
    </>
  )
  if (!interactive) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        marginBottom: 14,
      }}>
        {inner}
      </div>
    )
  }
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={isOpen}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        marginBottom: isOpen ? 14 : 2,
        width: '100%',
        background: 'transparent',
        border: 'none',
        padding: '6px 0',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'margin-bottom 0.2s ease',
      }}
    >
      {inner}
    </button>
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

/* ── Step 17.10 — non-tiling patch warning ─────────────── */

function NonTilingWarning({ editor }: { editor: NonNullable<PatternConfig['editor']> }) {
  const status = detectPatchTilingStatus(editor)
  if (status.kind === 'tiling') return null
  const message = status.reason === 'overflows'
    ? "Patch extends past the boundary — stamped copies will overlap."
    : status.reason === 'empty'
      ? "Patch is empty — no tiles to stamp."
      : "Patch doesn't fill the boundary — stamped copies will leave gaps."
  return (
    <div style={{
      marginTop: 8,
      padding: '6px 8px',
      border: '1px solid #a85050',
      background: 'rgba(168, 80, 80, 0.08)',
      color: '#a85050',
      fontSize: 11.5,
      lineHeight: 1.4,
    }}>
      <span style={{
        fontFamily: "'Cinzel', Georgia, serif",
        fontSize: 9,
        fontWeight: 600,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        display: 'block',
        marginBottom: 3,
      }}>
        Non-tiling patch
      </span>
      {message}
    </div>
  )
}

/* ── Editor Design controls (17.2) ─────────────────────── */

const BOUNDARY_OPTIONS: { value: BoundaryShape; label: string }[] = [
  { value: 'triangle', label: 'Triangle' },
  { value: 'square', label: 'Square' },
  { value: 'hexagon', label: 'Hexagon' },
]

interface EditorDesignControlsProps {
  editor: NonNullable<PatternConfig['editor']>
  dispatch: React.Dispatch<Action>
  onClear: () => void
  editorMode: 'place' | 'complete'
  onSetEditorMode: (m: 'place' | 'complete') => void
  firstVertexPick: { x: number; y: number } | null
  onCancelComplete: () => void
  editorPhase: 'design' | 'strand'
  onSetEditorPhase: (p: 'design' | 'strand') => void
  showBoundaryLattice: boolean
  onToggleShowBoundaryLattice: (next: boolean) => void
  showNeighbours: boolean
  onToggleShowNeighbours: (next: boolean) => void
  showNeighbourBoundaries: boolean
  onToggleShowNeighbourBoundaries: (next: boolean) => void
  showNeighbourStrands: boolean
  onToggleShowNeighbourStrands: (next: boolean) => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
}

function EditorDesignControls({
  editor,
  dispatch,
  onClear,
  editorMode,
  onSetEditorMode,
  firstVertexPick,
  onCancelComplete,
  editorPhase,
  onSetEditorPhase,
  showBoundaryLattice,
  onToggleShowBoundaryLattice,
  showNeighbours,
  onToggleShowNeighbours,
  showNeighbourBoundaries,
  onToggleShowNeighbourBoundaries,
  showNeighbourStrands,
  onToggleShowNeighbourStrands,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: EditorDesignControlsProps) {
  // Once the user has placed (or completed) any tile beyond the auto-placed
  // origin, changing origin sides would wipe their work — Decision: lock the
  // slider until the patch is cleared rather than risk an accidental drag.
  const originLocked = editor.tiles.length > 1
  const inStrand = editorPhase === 'strand'
  return (
    <>
      {/* Step 17.9 — Undo / Redo header (Q12). Visible in both phases:
          history is preserved across Design ↔ Strand flips, but only design-
          mode actions ever push to it. */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {([
          { label: '↶ Undo', onClick: onUndo, disabled: !canUndo },
          { label: '↷ Redo', onClick: onRedo, disabled: !canRedo },
        ] as const).map(b => (
          <button
            key={b.label}
            onClick={b.onClick}
            disabled={b.disabled}
            style={{
              flex: 1,
              padding: '5px 0',
              fontFamily: "'Cinzel', Georgia, serif",
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: '0.10em',
              textTransform: 'uppercase',
              cursor: b.disabled ? 'not-allowed' : 'pointer',
              border: '1px solid var(--border-subtle)',
              background: 'transparent',
              color: 'var(--text-muted)',
              opacity: b.disabled ? 0.4 : 1,
              transition: 'all 0.15s',
            }}
          >
            {b.label}
          </button>
        ))}
      </div>

      {/* Step 17.6 — Design / Strand-editor phase flip (Decision 15). */}
      <FieldLabel label="Phase" />
      <div style={{ display: 'flex', gap: 0, marginBottom: inStrand ? 4 : 12 }}>
        {(['design', 'strand'] as const).map(p => {
          const active = editorPhase === p
          return (
            <button
              key={p}
              onClick={() => onSetEditorPhase(p)}
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
              {p === 'design' ? 'Design' : 'Strand editor'}
            </button>
          )
        })}
      </div>
      {inStrand && (
        <div style={{
          marginTop: 0,
          marginBottom: 14,
          padding: '8px 10px',
          fontFamily: "'EB Garamond', Georgia, serif",
          fontSize: 12,
          color: 'var(--text-muted)',
          lineHeight: 1.45,
          border: '1px solid var(--border-subtle)',
        }}>
          <div>
            {editor.boundaryShape === 'triangle'
              ? 'Triangle lattice preview is deferred; you\'re seeing one stamp. Strand controls below still apply.'
              : 'Patch is stamped on the boundary\'s translation lattice. Edit strand controls below; flip back to Design to change tiles.'}
          </div>
          <NonTilingWarning editor={editor} />
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginTop: 8,
            cursor: 'pointer',
            color: showBoundaryLattice ? 'var(--text)' : 'var(--text-muted)',
          }}>
            <input
              type="checkbox"
              checked={showBoundaryLattice}
              onChange={e => onToggleShowBoundaryLattice(e.target.checked)}
            />
            Show boundary tessellation
          </label>
        </div>
      )}

      {!inStrand && <>
      <FieldLabel label="Boundary shape" />
      <div style={{ display: 'flex', gap: 0, marginBottom: 4 }}>
        {BOUNDARY_OPTIONS.map(opt => {
          const active = editor.boundaryShape === opt.value
          return (
            <button
              key={opt.value}
              onClick={() => dispatch({ type: 'SET_EDITOR_BOUNDARY_SHAPE', payload: opt.value })}
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
              {opt.label}
            </button>
          )
        })}
      </div>

      <label style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        marginTop: 10,
        cursor: 'pointer',
        fontFamily: "'EB Garamond', Georgia, serif",
        fontSize: 13,
        color: editor.alternateBoundary ? 'var(--text)' : 'var(--text-muted)',
        transition: 'color 0.15s',
      }}>
        <input
          type="checkbox"
          checked={!!editor.alternateBoundary}
          onChange={e => dispatch({ type: 'SET_EDITOR_ALTERNATE_BOUNDARY', payload: e.target.checked })}
        />
        Alternate orientation
      </label>

      <FieldLabel label="Boundary size" value={editor.boundarySize.toFixed(0)} unit=" u" />
      <input
        type="range"
        className="pattern-slider"
        min={80}
        max={BOUNDARY_SIZE_MAX_BY_SHAPE[editor.boundaryShape]}
        step={1}
        value={editor.boundarySize}
        onChange={e => dispatch({ type: 'SET_EDITOR_BOUNDARY_SIZE', payload: Number(e.target.value) })}
      />
      {editor.wrapBoundary && (
        <div
          style={{
            fontFamily: "'Cinzel', Georgia, serif",
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
            marginTop: 2,
            marginBottom: 4,
            lineHeight: 1.4,
          }}
        >
          Driven by Wrap boundary — drag to override.
        </div>
      )}

      <FieldLabel label="Origin sides" value={String(editor.originSides)} />
      <input
        type="range"
        className="pattern-slider"
        min={3}
        max={12}
        step={1}
        value={editor.originSides}
        disabled={originLocked}
        onChange={e => dispatch({ type: 'SET_EDITOR_ORIGIN_SIDES', payload: Number(e.target.value) })}
        style={originLocked ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
      />
      {originLocked && (
        <div
          style={{
            fontFamily: "'Cinzel', Georgia, serif",
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
            marginTop: 2,
            marginBottom: 4,
            lineHeight: 1.4,
          }}
        >
          Locked — clear the patch to change the origin shape.
        </div>
      )}

      {/* Wrap boundary — design-mode boundary fitting (live). */}
      <div style={{ marginTop: 14 }}>
        <label style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          cursor: 'pointer',
          fontFamily: "'EB Garamond', Georgia, serif",
          fontSize: 13,
          color: editor.wrapBoundary ? 'var(--text)' : 'var(--text-muted)',
          transition: 'color 0.15s',
        }}>
          <input
            type="checkbox"
            checked={!!editor.wrapBoundary}
            onChange={e => dispatch({ type: 'SET_EDITOR_WRAP_BOUNDARY', payload: e.target.checked })}
          />
          Wrap boundary
        </label>
      </div>

      {/* Step 17.6d — Show neighbours. Disabled while wrap is on (boundary
          edge moves under the user's feet) or on triangle (no v1 lattice). */}
      {(() => {
        const wrapOn = !!editor.wrapBoundary
        const triangle = editor.boundaryShape === 'triangle'
        const disabled = wrapOn || triangle
        const active = showNeighbours && !disabled
        return (
          <div style={{ marginTop: 10 }}>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              cursor: disabled ? 'not-allowed' : 'pointer',
              fontFamily: "'EB Garamond', Georgia, serif",
              fontSize: 13,
              color: active ? 'var(--text)' : 'var(--text-muted)',
              opacity: disabled ? 0.5 : 1,
              transition: 'color 0.15s, opacity 0.15s',
            }}>
              <input
                type="checkbox"
                checked={active}
                disabled={disabled}
                onChange={e => onToggleShowNeighbours(e.target.checked)}
              />
              Show neighbours
            </label>
            {disabled && (
              <div style={{
                fontFamily: "'Cinzel', Georgia, serif",
                fontSize: 9,
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
                marginTop: 2,
                marginBottom: 4,
                lineHeight: 1.4,
              }}>
                {wrapOn
                  ? 'Disable Wrap boundary to preview neighbours.'
                  : 'Triangle lattice preview is deferred.'}
              </div>
            )}
            {active && (
              <div style={{ marginTop: 6, marginLeft: 22, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  cursor: 'pointer',
                  fontFamily: "'EB Garamond', Georgia, serif",
                  fontSize: 12.5,
                  color: showNeighbourBoundaries ? 'var(--text)' : 'var(--text-muted)',
                  transition: 'color 0.15s',
                }}>
                  <input
                    type="checkbox"
                    checked={showNeighbourBoundaries}
                    onChange={e => onToggleShowNeighbourBoundaries(e.target.checked)}
                  />
                  Show boundaries
                </label>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  cursor: 'pointer',
                  fontFamily: "'EB Garamond', Georgia, serif",
                  fontSize: 12.5,
                  color: showNeighbourStrands ? 'var(--text)' : 'var(--text-muted)',
                  transition: 'color 0.15s',
                }}>
                  <input
                    type="checkbox"
                    checked={showNeighbourStrands}
                    onChange={e => onToggleShowNeighbourStrands(e.target.checked)}
                  />
                  Show strands
                </label>
              </div>
            )}
          </div>
        )
      })()}

      {/* Step 17.5 — Mode toggle: Place edge tiles vs. Complete gap tiles. */}
      <div style={{ marginTop: 14 }}>
        <FieldLabel label="Mode" />
        <div style={{ display: 'flex', gap: 0 }}>
          {(['place', 'complete'] as const).map(m => {
            const active = editorMode === m
            return (
              <button
                key={m}
                onClick={() => onSetEditorMode(m)}
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
                {m === 'place' ? 'Place' : 'Complete'}
              </button>
            )
          })}
        </div>
        {editorMode === 'complete' && (
          <>
            {/* Step 17.7 — Auto-complete on flip (Decision 11). Lives in
                Complete mode since it's a Complete-style operation that
                fires automatically on Design→Strand flip. */}
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginTop: 10,
              cursor: 'pointer',
              fontFamily: "'EB Garamond', Georgia, serif",
              fontSize: 13,
              color: editor.autoComplete?.enabled ? 'var(--text)' : 'var(--text-muted)',
              transition: 'color 0.15s',
            }}>
              <input
                type="checkbox"
                checked={!!editor.autoComplete?.enabled}
                onChange={e => dispatch({ type: 'SET_EDITOR_AUTO_COMPLETE_ENABLED', payload: e.target.checked })}
              />
              Auto-complete on entering Strand editor
            </label>
            <div style={{
              marginTop: 8,
              fontFamily: "'EB Garamond', Georgia, serif",
              fontSize: 12,
              color: 'var(--text-muted)',
              lineHeight: 1.4,
            }}>
              {firstVertexPick
                ? 'Pick a second outer vertex to fill the gap between them. Esc to cancel.'
                : 'Pick two outer vertices to fill the gap they bracket.'}
              {firstVertexPick && (
                <button
                  onClick={onCancelComplete}
                  style={{
                    marginLeft: 6,
                    padding: '1px 6px',
                    fontFamily: "'Cinzel', Georgia, serif",
                    fontSize: 9,
                    fontWeight: 600,
                    letterSpacing: '0.10em',
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                    border: '1px solid var(--border-subtle)',
                    background: 'transparent',
                    color: 'var(--text-muted)',
                  }}
                >
                  Cancel
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
        <button
          onClick={onClear}
          style={{
            flex: '1 1 0',
            minWidth: 0,
            padding: '5px 0',
            fontFamily: "'Cinzel', Georgia, serif",
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            border: '1px solid var(--border-subtle)',
            background: 'transparent',
            color: 'var(--text-muted)',
            transition: 'all 0.15s',
          }}
        >
          Clear
        </button>
      </div>
      </>}
    </>
  )
}
