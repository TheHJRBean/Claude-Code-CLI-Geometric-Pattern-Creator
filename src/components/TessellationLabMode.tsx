import { useCallback, useEffect, useRef, useState } from 'react'
import type { Segment } from '../types/geometry'
import type { PatternConfig } from '../types/pattern'
import type { Action } from '../state/actions'
import { TILINGS } from '../tilings/index'
import type { TileTypeInfo } from '../types/tiling'
import { createConfigLibrary } from '../state/configLibrary'
import { ConfigLibraryPanel } from './ConfigLibraryPanel'
import { Canvas, type SelectedEdge } from './Canvas'
import type { PaintTarget } from '../rendering/DecorationPaintLayer'
import type { SectionKey } from './EditorBoundaryInwardLayer'
import { SandstoneEdge } from './SandstoneEdge'
import { useTheme } from '../theme/ThemeContext'
import { SAMPLE_EDITOR_CONFIG } from '../editor/sampleConfig'
import { BOUNDARY_SIZE_MAX_BY_SHAPE } from '../editor/createDefault'
import { LAB_DEFAULT_CONFIG } from '../state/labDefaults'
import type { BoundaryShape, ConfigurationId, FrameConfig, FrameShape, SymmetryMode } from '../types/editor'
import { DEFAULT_FRAME_SIZE, MIN_FRAME_SIZE, MAX_FRAME_SIZE, SQRT2 } from '../editor/frame'
import { DEFAULT_FRAME_RINGS, MIN_FRAME_RINGS, MAX_FRAME_RINGS } from '../editor/frameNRing'
import type { FrameType } from '../types/editor'
import type { Vec2 } from '../utils/math'
import { validateMultiPick, multiPickValidityLabel } from '../editor/patchSelectable'
import { editorTileTypes } from '../editor/tileTypes'
import { activeCell } from '../editor/active'
import { useEditorHistory } from '../editor/useEditorHistory'
import { detectCellTilingStatus } from '../editor/nonTilingDetection'
import { FigureControls } from './strands/FigureControls'

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
  const [cpVisible, setCpVisible] = useState<Record<string, boolean>>({})
  const [cpActive, setCpActive] = useState<Record<string, number>>({})
  const toggleCpVisible = useCallback((tileTypeId: string) => {
    setCpVisible(prev => ({ ...prev, [tileTypeId]: !prev[tileTypeId] }))
  }, [])
  const setCpActiveIndex = useCallback((tileTypeId: string, index: number) => {
    setCpActive(prev => (prev[tileTypeId] === index ? prev : { ...prev, [tileTypeId]: index }))
  }, [])
  const [showAdvanced, setShowAdvanced] = useState(false)

  // Step 17.9 — wrap dispatch so Design-Phase Builder mutations push undo
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
  // Step 17.12c — boundary-section selection is parallel to the edge picker;
  // selecting one clears the other so only one EditorPickerOverlay is open.
  const [selectedSection, setSelectedSection] = useState<SectionKey | null>(null)
  // Drop the selection whenever the editor patch is cleared or replaced.
  useEffect(() => {
    if (config.tiling.type !== 'editor' || !config.editor) {
      setSelectedEdge(null)
      setSelectedSection(null)
    }
  }, [config.tiling.type, config.editor])
  // Multi-cell: clicking an edge that belongs to a non-active Cell
  // auto-switches the active Cell first (pure pane swap, not undoable) so the
  // existing place / delete flow targets the right Cell via the reducer's
  // updateActiveCell routing. Single-cell: just sets the selection.
  // useCallback so the memoised EditorEdgeLayer / EditorBoundaryInwardLayer
  // bail on pan/zoom frames instead of re-rendering (Finding 1, 2026-06-05).
  const handleSelectEdge = useCallback((edge: SelectedEdge | null) => {
    if (
      edge?.hostCellId
      && config.editor
      && config.editor.cells.length > 1
      && config.editor.activeCellId !== edge.hostCellId
    ) {
      dispatch({ type: 'SET_ACTIVE_CELL', payload: { cellId: edge.hostCellId } })
    }
    setSelectedEdge(edge)
    if (edge) setSelectedSection(null)
  }, [config.editor, dispatch])
  const handleSelectSection = useCallback((section: SectionKey | null) => {
    setSelectedSection(section)
    if (section) setSelectedEdge(null)
  }, [])
  // `force` (flexible-placement): the user accepted the picker's overlap
  // warning, so the reducer skips the viability gate and places anyway.
  const handlePlaceTile = (sides: number, force?: boolean) => {
    if (!selectedEdge) return
    // EDITOR_PLACE_TILE_ON_EDGE routes through the active Cell, so by this
    // point the host Cell must be the active one (handleSelectEdge guarantees).
    dispatch({ type: 'EDITOR_PLACE_TILE_ON_EDGE', payload: {
      tileId: selectedEdge.tileId,
      edgeIndex: selectedEdge.edgeIndex,
      sides,
      force,
    } })
  }
  const handlePlaceTileOnBoundarySection = (sides: number, force?: boolean) => {
    if (!selectedSection) return
    dispatch({ type: 'EDITOR_PLACE_TILE_ON_BOUNDARY_SECTION', payload: {
      edgeIndex: selectedSection.edgeIndex,
      sectionIndex: selectedSection.sectionIndex,
      sides,
      force,
    } })
  }
  // Step 17.13c — vertex placement. Canvas owns the (selectedVertex,
  // pickedSides, orientationIndex) picker state and resolves the rotation +
  // force flag before dispatching; we just relay the payload to the reducer.
  const handlePlaceTileOnVertex = (payload: { vertexKey: string; sides: number; rotation: number; force?: boolean }) => {
    dispatch({ type: 'EDITOR_PLACE_TILE_ON_VERTEX', payload })
  }
  const handleDeleteTile = (tileId: string) => {
    dispatch({ type: 'EDITOR_DELETE_TILE', payload: { tileId } })
  }

  // ── Editor mode + Complete picker (Step 17.5 / 17.11) ──
  const [editorMode, setEditorMode] = useState<'place' | 'complete'>('place')
  // 17.11.3 — multi-pick state. `multiMode` is engaged by Ctrl/Cmd-click and
  // persists until Enter (commit) or Esc (cancel). When `multiMode` is false,
  // `picks` is the legacy 17.5 chord state (length 0 or 1) and clicking a
  // second vertex commits an `EDITOR_COMPLETE_GAP` exactly as before.
  const [picks, setPicks] = useState<Vec2[]>([])
  const [multiMode, setMultiMode] = useState(false)
  // Step 17.6 — Design Phase vs Composition Phase phase-switch (Decision 15).
  // Local UI state — not persisted; figures persist independently per Q15.
  const [editorPhase, setEditorPhase] = useState<'design' | 'strand' | 'decoration'>('design')
  // Step 19.3 — Decoration: the active Paint colour, shared by the side-panel
  // swatches and the canvas Paint overlay.
  const [decorationColor, setDecorationColor] = useState('#c0392b')
  // Step 19.3 — manual Paint target so Voids / Strands don't fight for the
  // cursor; Off frees panning.
  const [paintTarget, setPaintTarget] = useState<PaintTarget>('voids')
  // Step 17.6 — Composition Phase: show the Patch Boundary stamped on the lattice.
  const [showBoundaryLattice, setShowBoundaryLattice] = useState(false)
  // Step 17.6d — Design Phase: low-opacity ghost copies of the Patch at the
  // one-ring lattice neighbours so the user can preview how their Patch
  // joins the surrounding stamps before phase-switching to Composition.
  const [showNeighbours, setShowNeighbours] = useState(false)
  const [showNeighbourBoundaries, setShowNeighbourBoundaries] = useState(false)
  const [showNeighbourStrands, setShowNeighbourStrands] = useState(false)
  // Mirror Gallery's tile-visibility toggle.
  const [showTiles, setShowTiles] = useState(true)
  // Drop Composition Phase if the Patch goes away.
  useEffect(() => {
    if (config.tiling.type !== 'editor' || !config.editor) setEditorPhase('design')
  }, [config.tiling.type, config.editor])
  // Reset picker state when patch changes or mode flips.
  const resetPicks = () => { setPicks([]); setMultiMode(false) }
  useEffect(() => { resetPicks() }, [editorMode, config.editor])
  // Step 17.12 — drop the section selection when leaving Place mode. The
  // section layer is always-on in single-cell Place mode now (no boundary-
  // inward toggle), so there's no per-Cell flag to track.
  useEffect(() => {
    if (editorMode !== 'place') setSelectedSection(null)
  }, [editorMode])
  useEffect(() => {
    if (config.tiling.type !== 'editor' || !config.editor) {
      setEditorMode('place')
      resetPicks()
    }
  }, [config.tiling.type, config.editor])
  // Esc cancels an in-progress complete pick (chord OR multi). Enter commits
  // a multi-pick polygon (17.11.6). Skip when focus is in a form control so
  // library prompts and the boundary-size slider aren't hijacked.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      const tag = t?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === 'Escape') {
        resetPicks()
        return
      }
      if (e.key === 'Enter' && multiMode && picks.length >= 3) {
        dispatch({ type: 'EDITOR_COMPLETE_N_GAP', payload: { picks } })
        resetPicks()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dispatch, multiMode, picks])
  // useCallback so the memoised (Complete-mode) EditorVertexLayer bails on
  // pan/zoom frames. Identity changes only when `multiMode`/`picks` change —
  // i.e. on an actual pick, when the layer must re-render anyway.
  const handlePickVertex = useCallback((p: Vec2, ctrlOrCmd: boolean) => {
    // Ctrl/Cmd-click: engage / extend multi mode. Append the pick to whatever
    // is already there (a single chord-mode pick is promoted into the
    // multi-pick polygon).
    if (ctrlOrCmd) {
      setPicks(prev => [...prev, p])
      setMultiMode(true)
      return
    }
    // Already in multi mode: plain click still appends. Release of Ctrl is
    // a visual no-op (Decision f) — only Enter commits and Esc cancels.
    if (multiMode) {
      setPicks(prev => [...prev, p])
      return
    }
    // Chord mode (17.5 behaviour, unchanged).
    if (picks.length === 0) {
      setPicks([p])
      return
    }
    if (Math.abs(picks[0].x - p.x) < 1e-6 && Math.abs(picks[0].y - p.y) < 1e-6) {
      setPicks([])
      return
    }
    dispatch({ type: 'EDITOR_COMPLETE_GAP', payload: { pA: picks[0], pB: p } })
    setPicks([])
  }, [multiMode, picks, dispatch])
  // Extracted from the inline Canvas prop + useCallback'd so the memoised
  // EditorVertexLayer bails on pan frames. Reset is inlined (not via the
  // unstable `resetPicks`) to keep this identity stable across frames.
  const handleForceCommitMulti = useCallback(() => {
    if (multiMode && picks.length >= 3) {
      dispatch({ type: 'EDITOR_COMPLETE_N_GAP', payload: { picks, force: true } })
      setPicks([])
      setMultiMode(false)
    }
  }, [multiMode, picks, dispatch])

  // ── Library ────────────────────────────────────────────
  // Active-entry selection lives here so external buttons (Clear / New /
  // Sample) can reset it via the controlled prop on `ConfigLibraryPanel`.
  const [activeSavedId, setActiveSavedId] = useState<string>('')

  // ── Section collapse (matches Gallery pattern) ─────────
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
  // For multi-tile compositions (e.g. 4.8.8) aggregate across every boundary
  // tile's interior so both octagon and square tile types get strand cards.
  const tileTypes: TileTypeInfo[] = (() => {
    if (config.tiling.type === 'editor' && config.editor) {
      // `editorTileTypes` already walks `patch.cells`, deduping by tileTypeId
      // — single-Cell and multi-Cell Patches share the same walker.
      return editorTileTypes(config.editor)
    }
    return def
      ? def.tileTypes ?? Array.from(new Set(def.vertexConfig)).map(n => ({ id: String(n), sides: n, label: `${n}-gon` }))
      : []
  })()

  // 17.11.4 — preview validates in multi mode with ≥3 picks. Same gates the
  // reducer applies (selectable, real-Cell pick, non-overlapping,
  // non-self-intersecting, centroid outside tiles). Computed once and
  // consumed by previewValid, previewMessage, and previewForceable.
  const validity = multiMode && picks.length >= 3 && config.editor
    ? validateMultiPick(config.editor, picks)
    : null

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
            Builder
          </h1>

          <p style={{
            fontFamily: "'EB Garamond', Georgia, serif",
            fontStyle: 'italic',
            fontSize: 12.5,
            color: 'var(--text-muted)',
            letterSpacing: '0.06em',
            marginBottom: 12,
          }}>
            Exploratory Workspace
          </p>
        </div>

        {/* ── Sections ────────────────────────────────────── */}
        <div className="sidebar-sections">
          {/* Editor — Step 17. 17.2 ships the Design-Phase shell: when a Patch
              is active, expose Cell shape + size + Seed sides. The Seed Tile
              auto-places at the Cell centre per Decision 6; boundary size
              only rescales the lattice cell (Q9 Option B). */}
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
                  resetPicks()
                }}
                picks={picks}
                multiMode={multiMode}
                onCancelComplete={resetPicks}
                editorPhase={editorPhase}
                decorationColor={decorationColor}
                onSetDecorationColor={setDecorationColor}
                paintTarget={paintTarget}
                onSetPaintTarget={setPaintTarget}
                onSetEditorPhase={p => {
                  // Step 17.7 — fire auto-complete when leaving Design for any
                  // later phase (Composition or Decoration) if the user opted
                  // in. Reducer is idempotent on already-convex Cells, so
                  // re-switches are safe.
                  if (
                    p !== 'design'
                    && editorPhase === 'design'
                    && config.editor?.autoComplete?.enabled
                  ) {
                    dispatch({ type: 'EDITOR_RUN_AUTO_COMPLETE' })
                  }
                  setEditorPhase(p)
                  // Clear in-flight Design-Phase picks when leaving Design Phase
                  // (entering Composition).
                  if (p !== 'design') {
                    setSelectedEdge(null)
                    resetPicks()
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
          {/* Strand geometry (Figure recipe) is frozen in the Decoration Phase
              (ADR-0005) — hide these controls there; reshaping happens in
              Composition. */}
          {showStrands && editorPhase !== 'decoration' && (def || (config.tiling.type === 'editor' && config.editor)) && (
            <div style={{ paddingTop: 22 }}>
              <SectionTitle open={isOpen('strands')} onToggle={() => toggleSection('strands')} tooltip="Per-Tile-type controls for the Figure rendered in each polygon. A Strand is a chain of Rays across polygons; most sliders here actually adjust individual Rays — the Strand emerges from them.">Strands</SectionTitle>
              {isOpen('strands') && (() => {
                // Advanced controls (vertex Rays, decoupled vertex angle,
                // snap, curves) appear only in Composition phase for
                // Builder Patches. Static archimedean tilings have no
                // Design/Composition split, so the toggle is always
                // available there.
                const advancedAvailable =
                  config.tiling.type !== 'editor' || editorPhase !== 'design'
                const advancedActive = advancedAvailable && showAdvanced
                return (
                  <>
                    {tileTypes.map(tt => {
                      const fig = config.figures[tt.id]
                      if (!fig) return null
                      return (
                        <FigureControls
                          key={tt.id}
                          tileTypeId={tt.id}
                          sides={tt.sides}
                          displayLabel={tt.label}
                          angle={fig.contactAngle}
                          lineLength={fig.lineLength}
                          autoLen={fig.autoLineLength}
                          snapEnabled={fig.snapLineLength ?? false}
                          edgeEnabled={fig.edgeLinesEnabled !== false}
                          vertexEnabled={fig.vertexLinesEnabled ?? false}
                          vertexDecoupled={fig.vertexLinesDecoupled ?? false}
                          vertexAngle={fig.vertexContactAngle ?? fig.contactAngle}
                          vertexLineLength={fig.vertexLineLength ?? fig.lineLength}
                          vertexAutoLen={fig.vertexAutoLineLength ?? fig.autoLineLength}
                          curveEnabled={fig.curve?.enabled ?? false}
                          curvePoints={fig.curve?.points ?? [{ position: 0.5, offset: 0.2 }]}
                          curveAlternating={fig.curve?.alternating ?? false}
                          curveDirection={fig.curve?.direction ?? 'left'}
                          vertexCurveEnabled={(fig.vertexCurve ?? fig.curve)?.enabled ?? false}
                          vertexCurvePoints={(fig.vertexCurve ?? fig.curve)?.points ?? [{ position: 0.5, offset: 0.2 }]}
                          vertexCurveAlternating={(fig.vertexCurve ?? fig.curve)?.alternating ?? false}
                          vertexCurveDirection={(fig.vertexCurve ?? fig.curve)?.direction ?? 'left'}
                          cpShown={cpVisible[tt.id] ?? false}
                          onToggleCpShown={() => toggleCpVisible(tt.id)}
                          tilingType={config.tiling.type}
                          allFigures={config.figures}
                          dispatch={dispatch}
                          onCurvePointActivity={setCpActiveIndex}
                          advanced={advancedActive}
                        />
                      )
                    })}

                    {advancedAvailable && (
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
                    )}
                    <button
                      type="button"
                      onClick={() => dispatch({ type: 'RESET_FIGURES' })}
                      style={{
                        marginTop: 10,
                        width: '100%',
                        padding: '6px 0',
                        fontFamily: "'Cinzel', Georgia, serif",
                        fontSize: 10,
                        fontWeight: 600,
                        letterSpacing: '0.12em',
                        textTransform: 'uppercase',
                        cursor: 'pointer',
                        border: '1px solid var(--border-subtle)',
                        background: 'transparent',
                        color: 'var(--text-muted)',
                        transition: 'all 0.15s',
                      }}
                      title="Reset every Tile-type's Strand parameters (contact angle, line length, vertex Rays, curves) back to defaults."
                    >
                      Reset parameters
                    </button>
                  </>
                )
              })()}
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
        onSelectEdge={handleSelectEdge}
        onPlaceTile={handlePlaceTile}
        onDeleteTile={handleDeleteTile}
        selectedSection={selectedSection}
        onSelectSection={handleSelectSection}
        onPlaceTileOnBoundarySection={handlePlaceTileOnBoundarySection}
        onPlaceTileOnVertex={handlePlaceTileOnVertex}
        editorMode={editorMode}
        picks={picks}
        onPickVertex={handlePickVertex}
        previewValid={validity ? validity.kind === 'valid' : null}
        previewMessage={validity ? multiPickValidityLabel(validity) : null}
        previewForceable={
          // Soft failures the user can override via Accept-and-continue-anyway:
          // overlap false-positives and centroid-inside-tile. Hard geometric
          // failures (self-intersecting, duplicate vertex, etc.) stay blocked.
          validity ? validity.kind === 'overlaps-existing' || validity.kind === 'inside-tile' : false
        }
        onForceCommitMulti={handleForceCommitMulti}
        editorStrandMode={editorPhase !== 'design'}
        decorationActive={editorPhase === 'decoration'}
        decorationPaintActive={editorPhase === 'decoration' && paintTarget !== 'off'}
        paintColor={decorationColor}
        paintTarget={editorPhase === 'decoration' ? paintTarget : 'off'}
        onPaintVoid={sig => dispatch({ type: 'SET_DECORATION_VOID_FILL', payload: { signature: sig, colour: decorationColor } })}
        onPaintStrands={() => dispatch({ type: 'SET_DECORATION_STRAND_COLOR', payload: { colour: decorationColor } })}
        editorFrame={!!config.editor?.frame}
        showBoundaryLattice={showBoundaryLattice}
        editorNeighbourPreview={editorPhase === 'design' && showNeighbours && !(config.editor && activeCell(config.editor).wrapBoundary)}
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
      aria-label={inMain ? 'Open Lab' : 'Return to Gallery'}
      title={inMain ? 'Open Lab — Exploratory Workspace' : 'Return to Gallery'}
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
      {inMain ? 'Lab' : '← Gallery'}
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

function SectionTitle({ children, open, onToggle, tooltip }: {
  children: React.ReactNode
  open?: boolean
  onToggle?: () => void
  tooltip?: string
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
        textDecoration: tooltip ? 'underline dotted var(--text-muted)' : 'none',
        textUnderlineOffset: 4,
      }}>
        {children}
      </span>
      <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, var(--divider), transparent)' }} />
      {interactive && <SectionChevron open={isOpen} />}
    </>
  )
  if (!interactive) {
    return (
      <div
        title={tooltip}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          marginBottom: 14,
          cursor: tooltip ? 'help' : 'default',
        }}
      >
        {inner}
      </div>
    )
  }
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={isOpen}
      title={tooltip}
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

function FieldLabel({ label, value, unit, tooltip }: { label: string; value?: string; unit?: string; tooltip?: string }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      marginBottom: 7,
      marginTop: 12,
    }}>
      <span
        title={tooltip}
        style={{
          fontFamily: "'EB Garamond', Georgia, serif",
          fontSize: 13.5,
          color: 'var(--text-secondary)',
          letterSpacing: '0.02em',
          cursor: tooltip ? 'help' : 'default',
          textDecoration: tooltip ? 'underline dotted var(--text-muted)' : 'none',
          textUnderlineOffset: 3,
        }}
      >
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
  // Aggregate across every Cell: if any Cell is non-tiling, surface that as
  // the Patch-level warning. Multi-cell Configurations are non-tiling as soon
  // as a single Cell is — the lattice stamps depend on all Cells fitting.
  let status: ReturnType<typeof detectCellTilingStatus> | null = null
  for (const cell of editor.cells) {
    const s = detectCellTilingStatus(cell)
    if (s.kind === 'non-tiling') { status = s; break }
  }
  if (!status) return null
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

type BoundaryPickerKind =
  | { kind: 'shape'; shape: BoundaryShape }
  | { kind: 'configuration'; id: ConfigurationId }

const BOUNDARY_OPTIONS: { value: BoundaryPickerKind; label: string }[] = [
  { value: { kind: 'shape', shape: 'triangle' }, label: 'Triangle' },
  { value: { kind: 'shape', shape: 'square' }, label: 'Square' },
  { value: { kind: 'shape', shape: 'hexagon' }, label: 'Hexagon' },
  { value: { kind: 'configuration', id: '4.8.8' }, label: '4.8.8' },
  { value: { kind: 'configuration', id: '3.12.12' }, label: '3.12.12' },
  { value: { kind: 'configuration', id: '4.6.12' }, label: '4.6.12' },
  { value: { kind: 'configuration', id: '3.6.3.6' }, label: '3.6.3.6' },
  { value: { kind: 'configuration', id: '3.4.6.4' }, label: '3.4.6.4' },
]

interface EditorDesignControlsProps {
  editor: NonNullable<PatternConfig['editor']>
  dispatch: React.Dispatch<Action>
  onClear: () => void
  editorMode: 'place' | 'complete'
  onSetEditorMode: (m: 'place' | 'complete') => void
  picks: Vec2[]
  multiMode: boolean
  onCancelComplete: () => void
  editorPhase: 'design' | 'strand' | 'decoration'
  onSetEditorPhase: (p: 'design' | 'strand' | 'decoration') => void
  decorationColor: string
  onSetDecorationColor: (c: string) => void
  paintTarget: PaintTarget
  onSetPaintTarget: (t: PaintTarget) => void
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

const decorationButtonStyle: React.CSSProperties = {
  padding: '5px 8px',
  fontFamily: "'Cinzel', Georgia, serif",
  fontSize: 9,
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  border: '1px solid var(--border-subtle)',
  background: 'transparent',
  color: 'var(--text-muted)',
}

function EditorDesignControls({
  editor,
  dispatch,
  onClear,
  editorMode,
  onSetEditorMode,
  picks,
  multiMode,
  onCancelComplete,
  editorPhase,
  onSetEditorPhase,
  decorationColor,
  onSetDecorationColor,
  paintTarget,
  onSetPaintTarget,
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
  // Once the user has placed (or completed) any Tile in the active Cell
  // beyond the auto-placed Seed, changing Seed sides (or toggling No Seed)
  // would wipe their work — lock both controls until the Cell is cleared.
  // The "non-Seed" semantic (not `tiles.length > 1`) is what we want: with
  // `noSeed` on, even a single placed Tile counts and should lock the
  // controls.
  const cell = activeCell(editor)
  const multiCell = editor.cells.length > 1
  const originLocked = cell.tiles.some(t => t.source !== 'seed')
  const inStrand = editorPhase === 'strand'
  const inDecoration = editorPhase === 'decoration'
  // n-ring Frames are single-cell-only (square / hexagon / triangle) in v1 —
  // multi-cell Configurations + octagon/dodecagon are deferred.
  const nRingSupported = !multiCell && (cell.shape === 'square' || cell.shape === 'hexagon' || cell.shape === 'triangle')
  // Frame — update a Frame geometry field. Geometry changes move the frame
  // nodes, so clear `completedTiles` (frame-scoped completions are anchored to
  // the old outline; the user re-completes against the new edge).
  const updateFrameGeom = (partial: Partial<FrameConfig>) => {
    if (!editor.frame) return
    dispatch({ type: 'SET_FRAME', payload: { ...editor.frame, ...partial, completedTiles: [] } })
  }
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

      {/* Step 17.6 — Design / Composition phase-switch (Decision 15). */}
      <FieldLabel
        label="Phase"
        tooltip="Build workflow stage. Design = author Tiles into Cells of a Patch. Composition = see the Patch composed across the canvas with Strands rendered by PIC. Decoration = colour the Strands and Fill the Voids (strand geometry is frozen here — change it in Composition). The Frame is a persistent overlay across all phases (see below)."
      />
      <div style={{ display: 'flex', gap: 0, marginBottom: inStrand ? 4 : 12 }}>
        {(['design', 'strand', 'decoration'] as const).map(p => {
          const active = editorPhase === p
          const label = p === 'design' ? 'Design' : p === 'strand' ? 'Composition' : 'Decoration'
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
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                border: `1px solid ${active ? 'var(--accent)' : 'var(--border-subtle)'}`,
                background: active ? 'var(--accent-bg)' : 'transparent',
                color: active ? 'var(--accent)' : 'var(--text-muted)',
                transition: 'all 0.15s',
              }}
            >
              {label}
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
            Patch is stamped on the boundary's translation lattice. Edit
            strand controls below; flip back to Design to change tiles.
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
      {inDecoration && (() => {
        const strandRec = editor.decoration?.strandColours.find(r => r.scope === 'congruent')
        const voidCount = editor.decoration?.voidFills.filter(r => r.scope === 'congruent').length ?? 0
        const hasDecoration = !!strandRec || voidCount > 0
        return (
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
            <div style={{ marginBottom: 8 }}>
              Pick a colour and a Paint target, then click on the canvas. Voids
              Fill the whole congruent group; Strands colour all at once. Strand
              geometry is frozen here — flip back to Composition to reshape.
            </div>
            <FieldLabel label="Paint target" tooltip="What clicking on the canvas paints. Off frees panning; Voids fills the clicked Void's congruent group; Strands colours every Strand." />
            <div style={{ display: 'flex', gap: 0, marginBottom: 10 }}>
              {(['off', 'voids', 'strands'] as const).map(t => {
                const active = paintTarget === t
                return (
                  <button
                    key={t}
                    onClick={() => onSetPaintTarget(t)}
                    style={{
                      flex: 1,
                      padding: '5px 0',
                      fontFamily: "'Cinzel', Georgia, serif",
                      fontSize: 9,
                      fontWeight: 600,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      cursor: 'pointer',
                      border: `1px solid ${active ? 'var(--accent)' : 'var(--border-subtle)'}`,
                      background: active ? 'var(--accent-bg)' : 'transparent',
                      color: active ? 'var(--accent)' : 'var(--text-muted)',
                    }}
                  >
                    {t === 'off' ? 'Off' : t === 'voids' ? 'Voids' : 'Strands'}
                  </button>
                )
              })}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ minWidth: 70 }}>Paint colour</span>
              <input
                type="color"
                value={decorationColor}
                onChange={e => onSetDecorationColor(e.target.value)}
                style={{ width: 36, height: 24, padding: 0, border: '1px solid var(--border-subtle)', background: 'transparent', cursor: 'pointer' }}
              />
              <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{decorationColor}</span>
            </label>
            {paintTarget === 'strands' ? (
              <button
                onClick={() => dispatch({ type: 'SET_DECORATION_STRAND_COLOR', payload: { colour: decorationColor } })}
                style={decorationButtonStyle}
              >
                Colour all strands
                <span style={{
                  display: 'inline-block', width: 12, height: 12, marginLeft: 8,
                  background: strandRec ? strandRec.colour : 'transparent',
                  border: '1px solid var(--border-subtle)', verticalAlign: 'middle',
                }} />
              </button>
            ) : (
              <button
                onClick={() => dispatch({ type: 'SET_DECORATION_VOID_FILL', payload: { signature: '*', colour: decorationColor } })}
                style={decorationButtonStyle}
              >
                Colour all Voids
              </button>
            )}
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              {strandRec && (
                <button
                  onClick={() => dispatch({ type: 'SET_DECORATION_STRAND_COLOR', payload: { colour: null } })}
                  style={{ ...decorationButtonStyle, flex: 1 }}
                >
                  Reset strands
                </button>
              )}
              {hasDecoration && (
                <button
                  onClick={() => dispatch({ type: 'CLEAR_DECORATION' })}
                  style={{ ...decorationButtonStyle, flex: 1 }}
                >
                  Clear all
                </button>
              )}
            </div>
            {voidCount > 0 && (
              <div style={{ marginTop: 8, fontSize: 11 }}>{voidCount} Void class{voidCount === 1 ? '' : 'es'} filled</div>
            )}
          </div>
        )
      })()}

      {/* Frame — a persistent bounded-region overlay, present in both Design
          and Composition (read later by Decoration). The pattern clips to its
          outline. In Design + Complete mode, the frame's edge nodes become
          clickable completion targets (see Complete). */}
      {(
        <div style={{ marginTop: 0, marginBottom: 14 }}>
          <FieldLabel
            label="Frame"
            tooltip="A persistent bounded region the pattern clips to. In Complete mode, the frame's edge nodes are clickable targets so you can complete tiles out to the edge. Shape = parametric outline; n-Ring = whole-patch shells (clip-only)."
          />
          <div style={{
            padding: '8px 10px',
            marginBottom: 10,
            fontFamily: "'EB Garamond', Georgia, serif",
            fontSize: 12,
            color: 'var(--text-muted)',
            lineHeight: 1.45,
            border: '1px solid var(--border-subtle)',
          }}>
            A <strong>Frame</strong> bounds the pattern — it's clipped to the
            outline. Switch to <strong>Complete</strong> mode and the frame's
            edge <strong>nodes</strong> become clickable: pick frame nodes plus
            interior vertices to complete tiles out to the edge.
          </div>
          {!editor.frame ? (
            // No Frame imposed yet (the overlay stays opt-in). Both Frame types
            // are offered directly so the n-ring isn't buried behind a
            // shape-frame-then-switch detour.
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button
                onClick={() => dispatch({
                  type: 'SET_FRAME',
                  payload: { type: 'shape', shape: 'square', size: DEFAULT_FRAME_SIZE, boundaryTreatment: 'complete' },
                })}
                style={{
                  width: '100%',
                  padding: '7px 0',
                  fontFamily: "'Cinzel', Georgia, serif",
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  color: 'var(--accent)',
                  background: 'var(--accent-bg)',
                  border: '1px solid var(--accent)',
                }}
              >
                + Shape Frame
              </button>
              <button
                onClick={() => dispatch({
                  type: 'SET_FRAME',
                  payload: { type: 'n-ring', rings: DEFAULT_FRAME_RINGS },
                })}
                disabled={!nRingSupported}
                title={nRingSupported ? undefined : 'n-Ring frames need a single-cell square, hexagon, or triangle Patch.'}
                style={{
                  width: '100%',
                  padding: '7px 0',
                  fontFamily: "'Cinzel', Georgia, serif",
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  cursor: nRingSupported ? 'pointer' : 'default',
                  color: nRingSupported ? 'var(--accent)' : 'var(--border-subtle)',
                  background: nRingSupported ? 'var(--accent-bg)' : 'transparent',
                  border: `1px solid ${nRingSupported ? 'var(--accent)' : 'var(--border-subtle)'}`,
                }}
              >
                + n-Ring Frame
              </button>
            </div>
          ) : (
            <>
              <FieldLabel
                label="Frame type"
                tooltip="Shape = a parametric outline (square / √2 / hex / oct) the pattern is completed out to. n-Ring = the centre Patch plus N neighbour shells, clipped to whole patches (no completion)."
              />
              <select
                className="pattern-select"
                value={editor.frame.type}
                onChange={e => {
                  const type = e.target.value as FrameType
                  if (type === editor.frame!.type) return
                  dispatch({
                    type: 'SET_FRAME',
                    payload: type === 'n-ring'
                      ? { type: 'n-ring', rings: editor.frame!.rings ?? DEFAULT_FRAME_RINGS }
                      : { type: 'shape', shape: editor.frame!.shape ?? 'square', size: editor.frame!.size ?? DEFAULT_FRAME_SIZE, boundaryTreatment: 'complete' },
                  })
                }}
                style={{ marginBottom: 10 }}
              >
                <option value="shape">Shape (parametric)</option>
                <option value="n-ring" disabled={!nRingSupported}>n-Ring (whole patches)</option>
              </select>
              {editor.frame.type === 'shape' && (<>
              <FieldLabel
                label="Frame shape"
                tooltip="Outline shape the Composition is clipped to. A square + aspect √2 gives the A-series rectangle."
              />
              <select
                className="pattern-select"
                value={editor.frame.shape ?? 'square'}
                onChange={e => updateFrameGeom({ shape: e.target.value as FrameShape })}
                style={{ marginBottom: 10 }}
              >
                <option value="square">Square</option>
                <option value="hexagon">Hexagon</option>
                <option value="octagon">Octagon</option>
              </select>
              <FieldLabel
                label={`Frame size — ${Math.round(editor.frame.size ?? DEFAULT_FRAME_SIZE)}`}
                tooltip="Half-extent (centre → corner) of the Frame in world units."
              />
              <input
                type="range"
                min={MIN_FRAME_SIZE}
                max={MAX_FRAME_SIZE}
                step={1}
                value={editor.frame.size ?? DEFAULT_FRAME_SIZE}
                onChange={e => updateFrameGeom({ size: Number(e.target.value) })}
                style={{ width: '100%', marginBottom: 10 }}
              />
              <FieldLabel
                label={`Aspect (width ÷ height) — ${(editor.frame.aspect ?? 1).toFixed(2)}`}
                tooltip="Stretches the Frame's width. 1.00 = regular; √2 ≈ 1.41 gives the A-series rectangle from a square."
              />
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 10 }}>
                <input
                  type="range"
                  min={0.5}
                  max={2}
                  step={0.01}
                  value={editor.frame.aspect ?? 1}
                  onChange={e => updateFrameGeom({ aspect: Number(e.target.value) })}
                  style={{ flex: 1 }}
                />
                {([['1:1', 1], ['√2', SQRT2]] as const).map(([label, val]) => (
                  <button
                    key={label}
                    onClick={() => updateFrameGeom({ aspect: val })}
                    style={{
                      padding: '3px 6px',
                      fontFamily: "'EB Garamond', Georgia, serif",
                      fontSize: 11,
                      cursor: 'pointer',
                      color: 'var(--text-muted)',
                      background: 'transparent',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <FieldLabel
                label={`Rotation — ${Math.round(((editor.frame.rotation ?? 0) * 180) / Math.PI)}°`}
                tooltip="Turn the whole Frame about its origin."
              />
              <input
                type="range"
                min={0}
                max={360}
                step={1}
                value={Math.round(((editor.frame.rotation ?? 0) * 180) / Math.PI)}
                onChange={e => updateFrameGeom({ rotation: (Number(e.target.value) * Math.PI) / 180 })}
                style={{ width: '100%', marginBottom: 10 }}
              />
              <FieldLabel
                label={`Frame origin — (${Math.round(editor.frame.origin?.x ?? 0)}, ${Math.round(editor.frame.origin?.y ?? 0)})`}
                tooltip="Centre of the Frame in world coordinates. (0, 0) = the seed Patch centre."
              />
              <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                <input
                  type="range"
                  min={-800}
                  max={800}
                  step={1}
                  value={editor.frame.origin?.x ?? 0}
                  onChange={e => updateFrameGeom({ origin: { x: Number(e.target.value), y: editor.frame!.origin?.y ?? 0 } })}
                  style={{ flex: 1 }}
                />
                <input
                  type="range"
                  min={-800}
                  max={800}
                  step={1}
                  value={editor.frame.origin?.y ?? 0}
                  onChange={e => updateFrameGeom({ origin: { x: editor.frame!.origin?.x ?? 0, y: Number(e.target.value) } })}
                  style={{ flex: 1 }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, fontSize: 9, color: 'var(--text-muted)', fontFamily: "'Cinzel', Georgia, serif", letterSpacing: '0.08em' }}>
                <span>X</span><span>Y</span>
              </div>
              <button
                onClick={() => dispatch({
                  type: 'SET_FRAME',
                  payload: { ...editor.frame!, completedTiles: [] },
                })}
                disabled={!editor.frame.completedTiles?.length}
                style={{
                  width: '100%',
                  padding: '6px 0',
                  marginBottom: 10,
                  fontFamily: "'Cinzel', Georgia, serif",
                  fontSize: 9,
                  fontWeight: 600,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  cursor: editor.frame.completedTiles?.length ? 'pointer' : 'default',
                  color: editor.frame.completedTiles?.length ? 'var(--text-muted)' : 'var(--border-subtle)',
                  background: 'transparent',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                Clear frame tiles
              </button>
              </>)}
              {editor.frame.type === 'n-ring' && (
                <>
                  <div style={{
                    padding: '6px 9px',
                    marginBottom: 10,
                    fontFamily: "'EB Garamond', Georgia, serif",
                    fontSize: 11,
                    color: 'var(--text-muted)',
                    lineHeight: 1.4,
                    border: '1px solid var(--border-subtle)',
                  }}>
                    Clips to the centre Patch plus <strong>{editor.frame.rings ?? DEFAULT_FRAME_RINGS}</strong> shell{(editor.frame.rings ?? DEFAULT_FRAME_RINGS) === 1 ? '' : 's'} of
                    whole neighbour Patches — no completion (the field already
                    tiles the region exactly).
                  </div>
                  <FieldLabel
                    label={`Rings — ${editor.frame.rings ?? DEFAULT_FRAME_RINGS}`}
                    tooltip="Number of neighbour-Patch shells around the centre Patch. 0 = the centre Patch alone; each ring adds one surrounding shell."
                  />
                  <input
                    type="range"
                    min={MIN_FRAME_RINGS}
                    max={MAX_FRAME_RINGS}
                    step={1}
                    value={editor.frame.rings ?? DEFAULT_FRAME_RINGS}
                    onChange={e => dispatch({ type: 'SET_FRAME', payload: { ...editor.frame!, rings: Number(e.target.value) } })}
                    style={{ width: '100%', marginBottom: 10 }}
                  />
                  <FieldLabel
                    label={`Rotation — ${Math.round(((editor.frame.rotation ?? 0) * 180) / Math.PI)}°`}
                    tooltip="Turn the whole Frame outline about its centre. Clip-only — the outline still follows whole Patch edges, just oriented."
                  />
                  <input
                    type="range"
                    min={0}
                    max={360}
                    step={1}
                    value={Math.round(((editor.frame.rotation ?? 0) * 180) / Math.PI)}
                    onChange={e => updateFrameGeom({ rotation: (Number(e.target.value) * Math.PI) / 180 })}
                    style={{ width: '100%', marginBottom: 10 }}
                  />
                </>
              )}
              <button
                onClick={() => dispatch({ type: 'SET_FRAME', payload: null })}
                style={{
                  width: '100%',
                  padding: '6px 0',
                  fontFamily: "'Cinzel', Georgia, serif",
                  fontSize: 9,
                  fontWeight: 600,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                  background: 'transparent',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                Remove Frame
              </button>
            </>
          )}
        </div>
      )}

      {editorPhase === 'design' && <>
      <FieldLabel
        label="Boundary"
        tooltip="Cell shape (or multi-cell Configuration) the Patch is built into. Single-cell options like Square/Hex/Triangle give one Cell; Configurations like 4.8.8 give a multi-cell Patch."
      />
      <select
        className="pattern-select"
        value={
          multiCell && editor.configuration
            ? `configuration:${editor.configuration}`
            : `shape:${cell.shape}`
        }
        onChange={e => {
          const [kind, id] = e.target.value.split(':') as [
            'shape' | 'configuration',
            string,
          ]
          if (kind === 'configuration') {
            dispatch({ type: 'SET_BUILDER_CONFIGURATION', payload: id as ConfigurationId })
          } else {
            // Reducer handles the composition → single-shape transition by
            // seeding a fresh patch in the requested shape.
            dispatch({ type: 'SET_CELL_SHAPE', payload: id as BoundaryShape })
          }
        }}
        style={{ marginBottom: 4 }}
      >
        {BOUNDARY_OPTIONS.map(opt => {
          const value = opt.value.kind === 'configuration'
            ? `configuration:${opt.value.id}`
            : `shape:${opt.value.shape}`
          return (
            <option key={value} value={value}>
              {opt.label}
            </option>
          )
        })}
      </select>

      {multiCell && (
        <>
          <FieldLabel
            label="Editing Cell"
            tooltip="Which Cell of the multi-cell Patch you're authoring Tiles into. Composition Phase renders all Cells together; Design Phase lets you author them one at a time."
          />
          <select
            className="pattern-select"
            value={editor.activeCellId}
            onChange={e => dispatch({ type: 'SET_ACTIVE_CELL', payload: { cellId: e.target.value } })}
            style={{ marginBottom: 8 }}
          >
            {editor.cells.map(t => (
              <option key={t.id} value={t.id}>
                {t.id.charAt(0).toUpperCase() + t.id.slice(1)}
              </option>
            ))}
          </select>
        </>
      )}

      <label style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        marginTop: 10,
        cursor: 'pointer',
        fontFamily: "'EB Garamond', Georgia, serif",
        fontSize: 13,
        color: (multiCell ? editor.alternateOrientation : cell.alternateBoundary) ? 'var(--text)' : 'var(--text-muted)',
        transition: 'color 0.15s',
      }}>
        <input
          type="checkbox"
          checked={multiCell ? !!editor.alternateOrientation : !!cell.alternateBoundary}
          onChange={e => dispatch({ type: 'SET_EDITOR_ALTERNATE_BOUNDARY', payload: e.target.checked })}
        />
        Alternate orientation
      </label>

      {!multiCell && (
        <>
          <FieldLabel
            label="Boundary size"
            value={cell.boundarySize.toFixed(0)}
            unit=" u"
            tooltip="Diameter of the Cell's Boundary polygon in world units. Scales the Cell uniformly."
          />
          <input
            type="range"
            className="pattern-slider"
            min={80}
            max={BOUNDARY_SIZE_MAX_BY_SHAPE[cell.shape]}
            step={1}
            value={cell.boundarySize}
            onChange={e => dispatch({ type: 'SET_CELL_BOUNDARY_SIZE', payload: Number(e.target.value) })}
          />
        </>
      )}

      {multiCell && (
        <>
          <FieldLabel
            label="Lattice edge"
            value={editor.edgeLength.toFixed(0)}
            unit=" u"
            tooltip="Edge length shared by every Cell in this multi-cell Patch — drives the Lattice basis that stamps the Patch across the canvas in Composition Phase."
          />
          <input
            type="range"
            className="pattern-slider"
            // Min is the seeded lattice edge — i.e. the Seed Tile's size.
            // Scaling below this would pinch the Cell centres tighter than
            // the (fixed-size) Seed polygons can fit, making sibling Cells
            // overlap each other.
            min={100}
            max={400}
            step={1}
            value={editor.edgeLength}
            onChange={e => dispatch({ type: 'SET_CELL_BOUNDARY_SIZE', payload: Number(e.target.value) })}
          />
        </>
      )}
      {cell.wrapBoundary && (
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

      <FieldLabel
        label="Seed sides"
        value={String(cell.seedSides)}
        tooltip="Side count of the auto-placed Seed Tile — the starter polygon the Builder drops into a Cell so you have something to build from."
      />
      <input
        type="range"
        className="pattern-slider"
        min={3}
        max={24}
        step={1}
        value={cell.seedSides}
        disabled={originLocked}
        onChange={e => dispatch({ type: 'SET_CELL_SEED_SIDES', payload: Number(e.target.value) })}
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

      {/* Step 17.4 (re-enabled) — Symmetry picker. The chosen subgroup of
          the boundary's dihedral group governs how placements + deletes
          propagate. None = single-edge (17.3 behaviour, the default).
          Horizontal mirror is hidden for triangle (no horizontal mirror
          axis exists on an equilateral triangle). */}
      <FieldLabel label="Symmetry" />
      <select
        className="pattern-select"
        value={cell.symmetryMode ?? 'none'}
        onChange={e => dispatch({ type: 'SET_EDITOR_SYMMETRY_MODE', payload: e.target.value as SymmetryMode })}
      >
        <option value="none">None — single edge</option>
        <option value="full">Full — all rotations + mirrors</option>
        <option value="rotation">Rotation only</option>
        <option value="vertical">Vertical mirror only</option>
        {cell.shape !== 'triangle' && (
          <option value="horizontal">Horizontal mirror only</option>
        )}
      </select>
      {(cell.symmetryMode ?? 'none') !== 'none' && (
        <div style={{
          fontFamily: "'Cinzel', Georgia, serif",
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
          marginTop: 4,
          marginBottom: 4,
          lineHeight: 1.4,
        }}>
          Placements + deletes propagate under this subgroup.
        </div>
      )}

      {/* Wrap boundary — Design-Phase Boundary fitting (live). In a multi-Cell
          Patch the toggle is per-active-Cell: wraps the lattice cell to
          whichever Cell the user is currently editing. The reducer's
          applyWrap propagates the fit to sibling Cells so the 4.8.8
          invariant — every Cell's Boundary edge = lattice edge — holds. */}
      <div style={{ marginTop: 14 }}>
        <label style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          cursor: 'pointer',
          fontFamily: "'EB Garamond', Georgia, serif",
          fontSize: 13,
          color: cell.wrapBoundary ? 'var(--text)' : 'var(--text-muted)',
          transition: 'color 0.15s',
        }}>
          <input
            type="checkbox"
            checked={!!cell.wrapBoundary}
            onChange={e => dispatch({ type: 'SET_EDITOR_WRAP_BOUNDARY', payload: e.target.checked })}
          />
          Wrap boundary
        </label>
      </div>

      {/* Step 17.12 — No Seed Tile. Per-Cell: applies to whichever Cell is
          currently active in Design Phase (single-cell Patch or one Cell of a
          multi-cell Configuration). When on, the active Cell starts empty
          (no auto-placed Seed) — useful when authoring from the boundary
          inward via the always-on section picker. Locked while the Cell
          holds any non-Seed Tile (mirrors the existing Seed-sides slider
          lock); the reducer silently refuses out-of-lock toggles. */}
      <div style={{ marginTop: 10 }}>
        <label style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          cursor: originLocked ? 'not-allowed' : 'pointer',
          fontFamily: "'EB Garamond', Georgia, serif",
          fontSize: 13,
          color: cell.noSeed ? 'var(--text)' : 'var(--text-muted)',
          opacity: originLocked ? 0.5 : 1,
          transition: 'color 0.15s, opacity 0.15s',
        }}>
          <input
            type="checkbox"
            checked={!!cell.noSeed}
            disabled={originLocked}
            onChange={e => dispatch({ type: 'SET_CELL_NO_SEED', payload: e.target.checked })}
          />
          No Seed Tile
        </label>
        {originLocked && (
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
            Locked — clear the {multiCell ? 'cell' : 'patch'} to toggle the Seed Tile.
          </div>
        )}
      </div>

      {/* Step 17.6d — Show neighbours. Disabled while wrap is on (boundary
          edge moves under the user's feet). Triangle support added — the
          three edge-shared down-triangles are computed directly from the
          boundary vertices. */}
      {(() => {
        const wrapOn = !!cell.wrapBoundary
        const disabled = wrapOn
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
                Disable Wrap boundary to preview neighbours.
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

      {/* Step 17.5 — Tool toggle: Place edge Tiles vs. Complete gap Tiles. */}
      <div style={{ marginTop: 14 }}>
        <FieldLabel
          label="Tool"
          tooltip="Design-Phase tool. Place adds a single Tile on a clicked edge. Complete fills the gaps around your placed Tiles with regular polygons (or irregular fallbacks)."
        />
        <div style={{ display: 'flex', gap: 0 }}>
          {(['place', 'complete'] as const).map(m => {
            const active = editorMode === m
            const tooltip = m === 'place'
              ? 'Click a Cell edge to place a single Tile on that side.'
              : 'Fill the gaps around your placed Tiles with regular polygons (or irregular fallbacks). Fills with Tiles, not colour — colour-fill arrives later under the Decoration Phase.'
            return (
              <button
                key={m}
                onClick={() => onSetEditorMode(m)}
                title={tooltip}
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
              Auto-complete on phase-switch to Composition
            </label>
            <div style={{
              marginTop: 8,
              fontFamily: "'EB Garamond', Georgia, serif",
              fontSize: 12,
              color: 'var(--text-muted)',
              lineHeight: 1.4,
            }}>
              {multiMode
                ? `${picks.length} ${picks.length === 1 ? 'vertex' : 'vertices'} selected. Press Enter to commit, Esc to cancel.`
                : picks.length > 0
                  ? 'Pick a second outer vertex to fill the gap between them. Esc to cancel.'
                  : 'Pick two outer vertices to fill the gap, or hold Ctrl/Cmd and click N for a multi-vertex fill.'}
              {picks.length > 0 && (
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
