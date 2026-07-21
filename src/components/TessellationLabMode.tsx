import { useCallback, useEffect, useRef, useState } from 'react'
import type { Segment } from '../types/geometry'
import type { PatternConfig } from '../types/pattern'
import type { Action } from '../state/actions'
import { TILINGS } from '../tilings/index'
import type { TileTypeInfo } from '../types/tiling'
import { patternLibrary } from '../state/patternLibrary'
import { ConfigLibraryPanel } from './ConfigLibraryPanel'
import { PresetShelfPanel } from './PresetShelfPanel'
import {
  actionResetsDirty,
  buildPresetConfig,
  shouldShowStructuralEditNote,
  type PresetShelfEntry,
} from '../editor/presetShelf'
import { Canvas, type SelectedEdge } from './Canvas'
import type { PaintTarget, StrandPaintScope, VoidPaintScope } from '../rendering/DecorationPaintLayer'
import type { PaintVoid } from '../decoration/resolve'
import { defaultGradientStops, seedGradientSpec, type GradientDraft, type GradientSelection } from '../decoration/gradients'
import type { SectionKey } from './EditorBoundaryInwardLayer'
import { SandstoneEdge } from './SandstoneEdge'
import { TopBar } from './TopBar'
import { SAMPLE_EDITOR_CONFIG } from '../editor/sampleConfig'
import { LAB_DEFAULT_CONFIG } from '../state/labDefaults'
import type { Vec2 } from '../utils/math'
import { validateMultiPick, multiPickValidityLabel } from '../editor/patchSelectable'
import { editorTileTypes } from '../editor/tileTypes'
import { activeCell } from '../editor/active'
import { useEditorHistory } from '../editor/useEditorHistory'
import { FigureControls } from './strands/FigureControls'
import { pushRecentColour } from './ColourPicker'
import { SectionTitle, FieldLabel } from './lab/labShared'
import { StrandStyleControls } from './ui/StrandStyleControls'
import { EditorDesignControls } from './lab/EditorDesignControls'
import { buildExportMenuItems } from '../export/exportActions'
import type { AppMode, EditorMode } from '../types/appMode'
import type { EditorGuide, EditorGuidePatch } from '../types/editor'
import { DEFAULT_ANGLE_STEP, type GuideTool, type WorldBounds } from '../editor/guides'


/**
 * Tessellation Lab — workspace for prototyping tessellations and (next phase)
 * the user-editable tessellation editor. The Lab focus is the polygon
 * tessellation itself; strands (PIC contact lines) are an optional overlay,
 * off by default.
 *
 * State is owned by App so it survives mode toggles.
 */

interface Props {
  mode: AppMode
  onSelectMode: (mode: AppMode) => void
  config: PatternConfig
  dispatch: React.Dispatch<Action>
  showStrands: boolean
  onToggleShowStrands: (next: boolean) => void
  outlineWidth: number
  onSetOutlineWidth: (next: number) => void
}

export function TessellationLabMode({
  mode,
  onSelectMode,
  config,
  dispatch: rawDispatch,
  showStrands,
  onToggleShowStrands,
  outlineWidth,
  onSetOutlineWidth,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const segmentsRef = useRef<Segment[]>([])
  // Canvas keeps this current with its visible world-rect; MorphPanel reads
  // it on Add Boundary so the default position lands on screen.
  const viewBoundsRef = useRef<WorldBounds | null>(null)
  const [pngTransparent, setPngTransparent] = useState(false)
  const [maxFillExport, setMaxFillExport] = useState(false)
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
  const { dispatch: historyDispatch, undo, redo, canUndo, canRedo } = useEditorHistory(
    config.editor,
    rawDispatch,
  )

  // ── Presets shelf (ADR-0006 slice 4) ───────────────────
  // Unsaved-changes guard: any config mutation since the last load / save /
  // new marks the working copy dirty; loading a preset over dirty work asks
  // first. A ref (not state) — read only at click time, never rendered.
  const dirtyRef = useRef(false)
  // One-time structural-edit note for converted presets (Q5). Persisted at
  // show time so it appears once ever; dismissing just hides the banner.
  const STRUCTURAL_NOTE_KEY = 'preset-structural-note-shown-v1'
  const structuralNoteShownRef = useRef<boolean>((() => {
    try { return localStorage.getItem(STRUCTURAL_NOTE_KEY) === 'true' } catch { return true }
  })())
  const [structuralNoteVisible, setStructuralNoteVisible] = useState(false)
  const presetId = config.editor?.presetId
  const dispatch = useCallback((action: Action) => {
    dirtyRef.current = !actionResetsDirty(action)
    if (shouldShowStructuralEditNote(action, presetId, structuralNoteShownRef.current)) {
      structuralNoteShownRef.current = true
      try { localStorage.setItem(STRUCTURAL_NOTE_KEY, 'true') } catch { /* ignore */ }
      setStructuralNoteVisible(true)
    }
    historyDispatch(action)
  }, [historyDispatch, presetId])

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
  // Selections are pure local UI state — the placement actions carry the
  // selection's `hostCellId`, so no active-Cell switch is needed on select
  // (the old SET_ACTIVE_CELL auto-switch re-ran the whole editorBase PIC
  // memo on every click and raced per-Cell control edits — a control edit
  // could repoint `activeCellId` while a picker was open, landing the Tile
  // in the wrong Cell).
  // useCallback so the memoised EditorEdgeLayer / EditorBoundaryInwardLayer
  // bail on pan/zoom frames instead of re-rendering (Finding 1, 2026-06-05).
  const handleSelectEdge = useCallback((edge: SelectedEdge | null) => {
    setSelectedEdge(edge)
    if (edge) setSelectedSection(null)
  }, [])
  const handleSelectSection = useCallback((section: SectionKey | null) => {
    setSelectedSection(section)
    if (section) setSelectedEdge(null)
  }, [])
  // `force` (flexible-placement): the user accepted the picker's overlap
  // warning, so the reducer skips the viability gate and places anyway.
  const handlePlaceTile = (sides: number, force?: boolean) => {
    if (!selectedEdge) return
    dispatch({ type: 'EDITOR_PLACE_TILE_ON_EDGE', payload: {
      tileId: selectedEdge.tileId,
      edgeIndex: selectedEdge.edgeIndex,
      sides,
      force,
      hostCellId: selectedEdge.hostCellId,
    } })
  }
  const handlePlaceTileOnBoundarySection = (sides: number, force?: boolean) => {
    if (!selectedSection) return
    dispatch({ type: 'EDITOR_PLACE_TILE_ON_BOUNDARY_SECTION', payload: {
      edgeIndex: selectedSection.edgeIndex,
      sectionIndex: selectedSection.sectionIndex,
      sides,
      force,
      hostCellId: selectedSection.hostCellId,
    } })
  }
  // Step 17.13c — vertex placement. Canvas owns the (selectedVertex,
  // pickedSides, orientationIndex) picker state and resolves the rotation +
  // force flag before dispatching; we just relay the payload to the reducer.
  const handlePlaceTileOnVertex = (payload: { vertexKey: string; sides: number; rotation: number; force?: boolean; hostCellId?: string }) => {
    dispatch({ type: 'EDITOR_PLACE_TILE_ON_VERTEX', payload })
  }
  // Guides slice 3 / #33 — place a single n-gon at a Guide Anchor. Canvas owns
  // the picker state + resolves the rotation/force; the reducer decides whether
  // the result is a world-space guideTile or an active-Cell Tile (via stamp).
  const handlePlaceTileOnAnchor = (payload: { anchor: Vec2; sides: number; rotation: number; force?: boolean }) => {
    dispatch({ type: 'EDITOR_PLACE_TILE_ON_ANCHOR', payload })
  }
  const handleDeleteTile = (tileId: string) => {
    dispatch({ type: 'EDITOR_DELETE_TILE', payload: { tileId } })
  }

  // ── Editor mode + Complete picker (Step 17.5 / 17.11) ──
  const [editorMode, setEditorMode] = useState<EditorMode>('place')
  // ── Construct mode (Guides slice 1) ────────────────────
  // Toolbar state — angle-snap step + snap toggle (spec Decision 7). Session
  // UI state, not persisted. Guides themselves live on `editor.guides`.
  const [constructAngleStep, setConstructAngleStep] = useState<number>(DEFAULT_ANGLE_STEP)
  const [constructTool, setConstructTool] = useState<GuideTool>('line')
  const [constructSnap, setConstructSnap] = useState(true)
  // Composition-Phase Guides overlay toggle — hidden by default (Decision 9).
  const [showGuides, setShowGuides] = useState(false)
  // Morph overlay visibility toggle (2026-07-18) — shown by default; lets the
  // user view the Composition without the Boundary lines/handles while the
  // Morph stays enabled. MorphPanel flips it back on when adding a Boundary
  // so a fresh Boundary can't land invisibly.
  const [showMorphBoundaries, setShowMorphBoundaries] = useState(true)
  const handleAddGuide = useCallback((guide: EditorGuide) => {
    dispatch({ type: 'EDITOR_ADD_GUIDE', payload: { guide } })
  }, [dispatch])
  const handleUpdateGuide = useCallback((guideId: string, patch: EditorGuidePatch) => {
    dispatch({ type: 'EDITOR_UPDATE_GUIDE', payload: { guideId, patch } })
  }, [dispatch])
  const handleDeleteGuide = useCallback((guideId: string) => {
    dispatch({ type: 'EDITOR_DELETE_GUIDE', payload: { guideId } })
  }, [dispatch])
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
  // Stage 2 — per-target Paint scope: how far one click reaches (ADR-0005
  // Grouping-scope ladder).
  const [voidScope, setVoidScope] = useState<VoidPaintScope>('congruent')
  const [strandScope, setStrandScope] = useState<StrandPaintScope>('all')
  // Stamp target — the Void shape picked on the canvas for the panel's
  // inspector / shape-canvas export / image-upload flow.
  const [stampSelection, setStampSelection] = useState<PaintVoid | null>(null)
  // Gradient target (#44) — the working gradient draft (type + stops) canvas
  // clicks paint, and the group last painted (anchors the focus editor).
  const [gradientDraft, setGradientDraft] = useState<GradientDraft>(
    () => ({ type: 'linear', stops: defaultGradientStops('#c0392b') }),
  )
  const [gradientSelection, setGradientSelection] = useState<GradientSelection | null>(null)
  // Stamp target — latest Void hit-targets mirrored up from the Canvas so
  // "Export all shapes" can enumerate every distinct shape on demand. A ref
  // (not state): it updates on every pan/zoom and nothing renders from it.
  const decorationVoidsRef = useRef<PaintVoid[]>([])
  const handleDecorationVoids = useCallback((v: PaintVoid[]) => { decorationVoidsRef.current = v }, [])
  const getStampVoids = useCallback(() => decorationVoidsRef.current, [])
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
        // Don't commit-and-wipe an invalid polygon: the reducer would no-op
        // and resetting here would also clear the rejection pill, so the
        // failure read as "nothing happened". Keep the picks + pill visible
        // — forceable rules already offer Accept-and-continue.
        if (config.editor && validateMultiPick(config.editor, picks).kind !== 'valid') return
        dispatch({ type: 'EDITOR_COMPLETE_N_GAP', payload: { picks } })
        resetPicks()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dispatch, multiMode, picks, config.editor])
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
    // Don't clear eagerly: on success the config.editor effect above resets
    // the picker; on a reducer no-op the first pick stays selected so the
    // failed chord isn't a silent wipe.
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

  // Shelf click → fresh working copy (never the catalogue object itself).
  // Tier-1 loads a fresh conversion; view-only tiers load the legacy config.
  const handleLoadPreset = (entry: PresetShelfEntry) => {
    if (dirtyRef.current) {
      const ok = window.confirm(
        `Load "${entry.label}"? Your current work has unsaved changes and will be replaced.`,
      )
      if (!ok) return
    }
    const preset = buildPresetConfig(entry.id)
    if (!preset) return
    setActiveSavedId('')
    dispatch({ type: 'LOAD_CONFIG', payload: preset })
  }

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

  // ── Export ─────────────────────────────────────────────
  // The single shared menu (buildExportMenuItems) — identical for every config
  // source now that the Gallery tuning sidebar is gone (ADR-0006 flip). Image
  // export runs against the live `<svg>`; Save-JSON round-trips the whole
  // PatternConfig.
  const exportItems = buildExportMenuItems({
    svgRef,
    config,
    onLoad: loaded => dispatch({ type: 'LOAD_CONFIG', payload: loaded }),
    pngTransparent,
    onTogglePngTransparent: () => setPngTransparent(t => !t),
    maxFill: maxFillExport,
    onToggleMaxFill: () => setMaxFillExport(v => !v),
  })

  const labTitle = config.tiling.type === 'editor'
    ? (config.editor?.configuration ?? 'Builder patch')
    : (def?.label ?? 'Tessellation')

  return (
    <div className="app-shell">
      <TopBar
        mode={mode}
        onSelectMode={onSelectMode}
        title={labTitle}
        exportItems={exportItems}
      />
      <div className="app-layout">
      <div className="sidebar sidebar--open">
        {/* ── Header ──────────────────────────────────────── */}
        <div className="sidebar-header">
          <h1 style={{
            fontFamily: "'Cinzel', Georgia, serif",
            fontSize: 16,
            fontWeight: 700,
            color: 'var(--text)',
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            marginTop: 2,
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
                config={config}
                editor={config.editor}
                dispatch={dispatch}
                viewBoundsRef={viewBoundsRef}
                showMorphBoundaries={showMorphBoundaries}
                onSetShowMorphBoundaries={setShowMorphBoundaries}
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
                constructAngleStep={constructAngleStep}
                onSetConstructAngleStep={setConstructAngleStep}
                constructTool={constructTool}
                onSetConstructTool={setConstructTool}
                constructSnap={constructSnap}
                onSetConstructSnap={setConstructSnap}
                showGuides={showGuides}
                onToggleShowGuides={setShowGuides}
                picks={picks}
                multiMode={multiMode}
                onCancelComplete={resetPicks}
                editorPhase={editorPhase}
                decorationColor={decorationColor}
                onSetDecorationColor={setDecorationColor}
                paintTarget={paintTarget}
                onSetPaintTarget={setPaintTarget}
                voidScope={voidScope}
                onSetVoidScope={setVoidScope}
                strandScope={strandScope}
                onSetStrandScope={setStrandScope}
                stampSelection={stampSelection}
                getStampVoids={getStampVoids}
                gradientDraft={gradientDraft}
                onSetGradientDraft={setGradientDraft}
                gradientSelection={gradientSelection}
                onClearGradientSelection={() => setGradientSelection(null)}
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

          {/* Presets shelf (ADR-0006 slice 4) — read-only template cards.
              Clicking loads a fresh conversion (tier-1) or the legacy render
              config (view-only tiers) as the working config. */}
          <div style={{ paddingTop: 22 }}>
            <SectionTitle open={isOpen('presets')} onToggle={() => toggleSection('presets')} tooltip="Template catalogue. Loading a preset opens a fresh editable copy (or a view-only legacy render where conversion isn't available yet); save your edits to My Tessellations.">Presets</SectionTitle>
            {isOpen('presets') && (
              <PresetShelfPanel onLoadPreset={handleLoadPreset} />
            )}
          </div>

          {/* Library — Save / Rename / Duplicate / Delete + saved entries dropdown */}
          <div style={{ paddingTop: 22 }}>
            <SectionTitle open={isOpen('library')} onToggle={() => toggleSection('library')}>My Tessellations</SectionTitle>
            {isOpen('library') && (
              <ConfigLibraryPanel
                library={patternLibrary}
                currentConfig={config}
                onLoad={c => dispatch({ type: 'LOAD_CONFIG', payload: c })}
                onSaved={() => { dirtyRef.current = false }}
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
                          extraSets={fig.extraSets}
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

            {/* Strand stroke controls (width / style / lacing) — shared with
                the Gallery via StrandStyleControls. Only offered while Strands
                draw; the Design-phase ghost split skips weaving regardless. */}
            {showStrands && (
              <div style={{ marginLeft: 26 }}>
                <StrandStyleControls strand={config.strand} dispatch={dispatch} />
              </div>
            )}

            <FieldLabel
              label="Tile outline weight"
              value={outlineWidth.toFixed(1)}
              unit=" px"
              tooltip="Stroke weight of the faint Tile outlines (Show tiles) — not the Strands; use Strand width above for those."
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

          <div style={{ paddingBottom: 28 }} />
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
        viewBoundsRef={viewBoundsRef}
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
        onPlaceTileOnAnchor={handlePlaceTileOnAnchor}
        editorMode={editorMode}
        constructSnap={constructSnap}
        constructAngleStep={constructAngleStep}
        constructTool={constructTool}
        showGuides={showGuides}
        onAddGuide={handleAddGuide}
        onUpdateGuide={handleUpdateGuide}
        onDeleteGuide={handleDeleteGuide}
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
        paintColor={paintTarget === 'gradient' ? gradientDraft.stops[0].colour : decorationColor}
        paintTarget={editorPhase === 'decoration' ? paintTarget : 'off'}
        paintVoidScope={voidScope}
        paintStrandScope={strandScope}
        onPaintVoid={p => { pushRecentColour(decorationColor); dispatch({ type: 'SET_DECORATION_VOID_FILL', payload: { ...p, colour: decorationColor } }) }}
        onPaintGradientVoid={(v, p) => {
          // Pick-to-edit: if the clicked group already carries a *different*
          // gradient, load it into the draft and select it instead of painting
          // over it — otherwise there's no way to resume editing an existing
          // gradient without clobbering it. A group whose gradient already
          // matches the draft falls through to the paint/unpaint toggle below,
          // so a just-painted group can still be clicked off.
          const existing = config.editor?.decoration?.voidFills.find(
            r => r.scope === p.scope && r.key === p.key && r.gradient,
          )?.gradient
          if (existing) {
            const sameAsDraft =
              existing.type === gradientDraft.type &&
              JSON.stringify(existing.stops) === JSON.stringify(gradientDraft.stops)
            if (!sameAsDraft) {
              setGradientDraft({ type: existing.type, stops: existing.stops })
              setGradientSelection({ void: v, scope: p.scope, key: p.key })
              return
            }
          }
          // Seed the gradient's geometry off the clicked shape's canonical
          // pose so the record replicates like a stamp (mirrors included).
          const spec = seedGradientSpec(gradientDraft.type, gradientDraft.stops, v.keyPolygon ?? v.polygon)
          if (!spec) return
          pushRecentColour(gradientDraft.stops[0].colour)
          dispatch({ type: 'SET_DECORATION_VOID_GRADIENT', payload: { ...p, colour: gradientDraft.stops[0].colour, gradient: spec, toggle: true } })
          setGradientSelection({ void: v, scope: p.scope, key: p.key })
        }}
        onPaintStrand={p => { pushRecentColour(decorationColor); dispatch({ type: 'SET_DECORATION_STRAND_COLOR', payload: { ...p, colour: decorationColor } }) }}
        onSelectStampVoid={setStampSelection}
        selectedStampSignature={paintTarget === 'stamp' ? stampSelection?.signature ?? null : null}
        onDecorationVoids={handleDecorationVoids}
        editorFrame={!!config.editor?.frame}
        showBoundaryLattice={showBoundaryLattice}
        editorNeighbourPreview={editorPhase === 'design' && showNeighbours && !(config.editor && activeCell(config.editor).wrapBoundary)}
        editorNeighbourBoundaries={showNeighbourBoundaries}
        editorNeighbourStrands={showNeighbourStrands}
        showMorphOverlay={editorPhase === 'strand' && showMorphBoundaries}
        onSetMorphOrigin={p => dispatch({ type: 'SET_MORPH_ORIGIN', payload: p })}
        onSetMorphDirection={d => dispatch({ type: 'SET_MORPH_DIRECTION', payload: d })}
        onSetMorphBoundaryPosition={(boundaryId, position) => dispatch({ type: 'SET_MORPH_BOUNDARY_POSITION', payload: { boundaryId, position } })}
        onDeleteMorphBoundary={boundaryId => dispatch({ type: 'DELETE_MORPH_BOUNDARY', payload: { boundaryId } })}
      />
      </div>
      {/* One-time structural-edit note (Q5) — first place / delete / Complete
          / boundary resize on a converted preset. Informational banner only:
          the edit has already been applied, nothing is blocked. */}
      {structuralNoteVisible && (
        <div
          role="status"
          style={{
            position: 'fixed',
            top: 64,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 40,
            maxWidth: 420,
            padding: '12px 16px',
            background: 'var(--bg, #f5f0e8)',
            border: '1px solid var(--border-subtle)',
            boxShadow: '0 2px 12px rgba(0,0,0,0.18)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
          }}
        >
          <p style={{
            margin: 0,
            fontFamily: "'EB Garamond', Georgia, serif",
            fontSize: 12.5,
            color: 'var(--text)',
            lineHeight: 1.5,
          }}>
            You're restructuring a converted preset. Placing, deleting,
            completing, or resizing the boundary can break the tessellation —
            the non-tiling tag will flag it if that happens. Edits are never
            blocked; this note won't appear again.
          </p>
          <button
            onClick={() => setStructuralNoteVisible(false)}
            style={{
              flexShrink: 0,
              padding: '3px 8px',
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
            Got it
          </button>
        </div>
      )}
    </div>
  )
}
