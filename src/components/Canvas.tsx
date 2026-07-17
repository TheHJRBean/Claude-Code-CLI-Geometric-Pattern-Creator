import { useRef, useEffect, useCallback, useState, useDeferredValue, useMemo } from 'react'
import type { PatternConfig } from '../types/pattern'
import type { Segment } from '../types/geometry'
import type { Vec2 } from '../utils/math'
import { usePattern } from '../hooks/usePattern'
import { frameOutlinePolygon, computeFrameSections, frameNodePoints } from '../editor/frame'
import { nRingOutline, compositionNRingOutline, DEFAULT_FRAME_RINGS } from '../editor/frameNRing'
import { usePanZoom } from '../hooks/usePanZoom'
import type { PanZoomHandlers } from '../hooks/usePanZoom'
import { PatternSVG } from '../rendering/PatternSVG'
import { screenToWorld, worldToScreen } from '../rendering/screenSpace'
import { DecorationPaintLayer, type PaintPayload, type PaintTarget, type StrandPaintScope, type VoidPaintScope } from '../rendering/DecorationPaintLayer'
import type { PaintVoid } from '../decoration/resolve'
import { RotationDial } from './RotationDial'
import { ZoomControl } from './ZoomControl'
import type { ExposedEdge } from '../editor/exposedEdges'
import type { EditorCell } from '../types/editor'
import { computeExposedEdges } from '../editor/exposedEdges'
import { computeAllCycles, computeBoundaryCycle, type BoundaryVertex } from '../editor/boundary'
import { EDITOR_EPS } from '../editor/exposedEdges'
import { applyStamp } from '../editor/lattice'
import { patchRotation } from '../editor/compositionLattice'
import { viableSidesForEdge, viableSidesForVertexOrbit, vertexOrientationsWithOrbit } from '../editor/orbit'
import { applyCellTransform, worldProbeCell } from '../editor/patchSelectable'
import { cellPlacementEdgeLength } from '../editor/active'
import { EditorEdgeLayer } from './EditorEdgeLayer'
import { EditorPickerOverlay } from './EditorPickerOverlay'
import { OverlapConfirmModal } from './OverlapConfirmModal'
import { EditorVertexLayer } from './EditorVertexLayer'
import { EditorBoundaryInwardLayer, type SectionKey } from './EditorBoundaryInwardLayer'
import { EditorVertexPlacementLayer, vertexUid } from './EditorVertexPlacementLayer'
import { computeBoundarySections, viableSidesForBoundarySection, type BoundarySection } from '../editor/boundaryInward'
import {
  computeExposedVertices,
  makeAnchorVertex,
  placeRegularNGonOnVertex,
  placeableSidesForVertex,
  vertexKeyOf,
  type ExposedVertex,
  type VertexKey,
} from '../editor/vertexPlacement'
import { PICKER_SIDES } from '../editor/placement'
import { regularPolygonVertices } from '../editor/regularPolygon'
import { PerfHud } from './PerfHud'
import type { EditorMode } from '../types/appMode'
import type { EditorGuide, EditorGuidePatch } from '../types/editor'
import {
  collectGuideAnchors,
  collectSnapPoints,
  createGuideCircle,
  createGuideLine,
  DEFAULT_ANGLE_STEP,
  type GuideTool,
  snapAngle,
  snapToPoint,
  type SnapPoint,
  type WorldBounds,
} from '../editor/guides'
import { EditorGuideLayer, type GuideHandle } from './EditorGuideLayer'
import { GuidePopupOverlay } from './GuidePopupOverlay'
import { midpoint as vecMidpoint, pointsEqual } from '../utils/math'
import { EditorMorphLayer } from './EditorMorphLayer'
import { morphDistance } from '../pic/morph'

/**
 * Each **Cell** in a Patch lives in Patch-local coords via its own `center` +
 * `rotation`. Picker overlays (edges, vertices) are computed per-Cell in
 * Cell-local coords; we lift them into Patch-local coords via the canonical
 * `applyCellTransform` (shared with the reducer + patch-selection validation).
 * For a single-cell Patch with the lone Cell at the Patch origin this is the
 * identity. The thin `transformEdge` / `transformBoundaryVertex` wrappers just
 * map every point of a structured value through that transform.
 */
type CellLike = { center: Vec2; rotation: number }

function transformEdge(e: ExposedEdge, cell: CellLike, patchRot: number): ExposedEdge {
  return {
    ...e,
    p1: applyCellTransform(e.p1, cell, patchRot),
    p2: applyCellTransform(e.p2, cell, patchRot),
    midpoint: applyCellTransform(e.midpoint, cell, patchRot),
    sourceCenter: applyCellTransform(e.sourceCenter, cell, patchRot),
  }
}

function transformBoundaryVertex(v: BoundaryVertex, cell: CellLike, patchRot: number): BoundaryVertex {
  return { ...v, p: applyCellTransform(v.p, cell, patchRot) }
}

export interface SelectedEdge {
  tileId: string
  edgeIndex: number
  /**
   * The Cell id this edge belongs to — used to auto-switch the active Cell
   * when the user clicks an edge inside an inactive Cell. Always populated
   * in v3; the field stays optional so legacy persisted picks don't crash.
   */
  hostCellId?: string
}

interface Props {
  config: PatternConfig
  showTileLayer: boolean
  showLines: boolean
  svgRef: React.RefObject<SVGSVGElement>
  segmentsRef: React.MutableRefObject<Segment[]>
  cpVisible: Record<string, boolean>
  cpActive: Record<string, number>
  outlineWidth?: number
  /** Step 17.3 — editor-mode interaction handlers. Active only when an editor patch is loaded. */
  selectedEdge?: SelectedEdge | null
  onSelectEdge?: (edge: SelectedEdge | null) => void
  onPlaceTile?: (sides: number, force?: boolean) => void
  onDeleteTile?: (tileId: string) => void
  /** Step 17.12 — boundary-inward placement. Always available in Design
   *  Phase + Place mode (single-cell Patches only — locked decision b). */
  selectedSection?: SectionKey | null
  onSelectSection?: (section: SectionKey | null) => void
  onPlaceTileOnBoundarySection?: (sides: number, force?: boolean) => void
  /** Step 17.13c — vertex-anchored placement. Always available in Design
   *  Phase + Place mode (single-cell only). The picker is two-page: shape
   *  grid → orientation arrows + live preview. */
  onPlaceTileOnVertex?: (payload: { vertexKey: VertexKey; sides: number; rotation: number; force?: boolean; hostCellId?: string }) => void
  /** Guides slice 3 / #33 — place a single regular n-gon at a Guide Anchor
   *  (Patch-world coords). Shares the Place vertex picker; the reducer routes
   *  the result to `guideTiles` (non-stamping) or an active-Cell Tile (stamping). */
  onPlaceTileOnAnchor?: (payload: { anchor: Vec2; sides: number; rotation: number; force?: boolean }) => void
  /** Step 17.5 — Design-Phase tool: 'place' shows the edge picker, 'complete'
   *  the vertex picker, 'construct' the Guide drawing layer (spec Decision 11). */
  editorMode?: EditorMode
  /** Construct mode — snap-while-drawing toggle (points + angles). */
  constructSnap?: boolean
  /** Construct mode — angle-snap step in degrees (spec Decision 7). */
  constructAngleStep?: number
  /** Construct mode — which Guide the two-click gesture draws (spec Decision 11). */
  constructTool?: GuideTool
  /** Composition Phase — Guides overlay show/hide (hidden by default). In
   *  Design Phase Guides always render. */
  showGuides?: boolean
  /** Construct mode — a completed two-click Guide (line or circle). */
  onAddGuide?: (guide: EditorGuide) => void
  /** Construct mode — per-Guide popup edits + handle drags. */
  onUpdateGuide?: (guideId: string, patch: EditorGuidePatch) => void
  onDeleteGuide?: (guideId: string) => void
  /** Step 17.11 — accumulated picks (chord mode: 0–1; multi mode: 0+). */
  picks?: Vec2[]
  /** Step 17.11 — `ctrlOrCmd` reflects whether the modifier was held during the click. */
  onPickVertex?: (p: Vec2, ctrlOrCmd: boolean) => void
  /**
   * Step 17.11.4 — preview-polygon validity. `null` = no preview shown
   * (chord mode, or multi mode with N<3); `true|false` toggles the
   * accent-vs-danger tint of the preview polygon.
   */
  previewValid?: boolean | null
  /** Bug 12 — rejection reason text rendered next to the in-progress preview. */
  previewMessage?: string | null
  /** True when the rejection is a soft rule (overlap / inside-tile) that the
   *  user can override via the Accept-and-continue-anyway button. */
  previewForceable?: boolean
  /** Fired when the user clicks Accept-and-continue-anyway in the preview. */
  onForceCommitMulti?: () => void
  /** Step 17.6 — when true, the Builder Patch is stamped on the Boundary's translation lattice (Composition Phase). Hides Design-Phase overlays. */
  editorStrandMode?: boolean
  /** Step 17.6 — when true in the Composition Phase, draw the Patch Boundary outline at every lattice stamp. */
  showBoundaryLattice?: boolean
  /** Step 17.6d — Design-Phase neighbour preview. Ignored in the Composition Phase. */
  editorNeighbourPreview?: boolean
  /** Step 17.6d — Design-Phase neighbour preview: also draw Boundary outlines at each neighbour stamp. */
  editorNeighbourBoundaries?: boolean
  /** Step 17.6d — Design-Phase neighbour preview: include ghosts in PIC so Strands flow across boundaries. */
  editorNeighbourStrands?: boolean
  /** Frame overlay present — clip the Composition to the Patch's Shape Frame
   * outline, draw the outline, and expose its edge nodes as Complete-mode pick
   * targets. Persistent across Design + Composition. */
  editorFrame?: boolean
  /** Step 19.3 — Decoration phase active: render resolved Void fills + strand
   * colour over the Composition. */
  decorationActive?: boolean
  /** Stage 2 — Paint-mode: Fill the clicked Void's group at the given
   * Grouping-scope rung with the active colour. */
  onPaintVoid?: (payload: PaintPayload) => void
  /** Stage 2 — Paint-mode: colour the clicked Strand's group at the given
   * rung. */
  onPaintStrand?: (payload: PaintPayload) => void
  /** Step 19.3 — active Paint colour (used for the hover highlight). */
  paintColor?: string
  /** Step 19.3 — manual Paint target (Off · Voids · Strands). */
  paintTarget?: PaintTarget
  /** Stage 2 — how far a Void click reaches (congruent / patch / instance). */
  paintVoidScope?: VoidPaintScope
  /** Stage 2 — how far a Strand click reaches (all / congruent / patch). */
  paintStrandScope?: StrandPaintScope
  /** Stamp target — a Void click selects its congruent shape for the
   * Decoration panel's inspector / export / upload flow. */
  onSelectStampVoid?: (v: PaintVoid) => void
  /** Signature of the selected stamp shape (persistent highlight). */
  selectedStampSignature?: string | null
  /** Stamp target — surfaces the current Void hit-targets so the Decoration
   * panel's "Export all shapes" can enumerate every distinct shape. */
  onDecorationVoids?: (voids: PaintVoid[]) => void
  /** Step 20 slice 2 (#38) — Morph overlay live: Composition Phase onward
   *  (not frozen in Decoration, per the spec's literal scoping). */
  showMorphOverlay?: boolean
  onSetMorphOrigin?: (p: Vec2) => void
  onSetMorphDirection?: (d: Vec2) => void
  onSetMorphBoundaryPosition?: (boundaryId: string, position: number) => void
  onDeleteMorphBoundary?: (boundaryId: string) => void
}

const INITIAL_ZOOM = 1

export function Canvas({ config, showTileLayer, showLines, svgRef, segmentsRef, cpVisible, cpActive, outlineWidth, selectedEdge, onSelectEdge, onPlaceTile, onDeleteTile, selectedSection, onSelectSection, onPlaceTileOnBoundarySection, onPlaceTileOnVertex, onPlaceTileOnAnchor, editorMode = 'place', constructSnap = true, constructAngleStep = DEFAULT_ANGLE_STEP, constructTool = 'line', showGuides = false, onAddGuide, onUpdateGuide, onDeleteGuide, picks, onPickVertex, previewValid = null, previewMessage = null, previewForceable = false, onForceCommitMulti, editorStrandMode = false, showBoundaryLattice = false, editorNeighbourPreview = false, editorNeighbourBoundaries = false, editorNeighbourStrands = false, editorFrame = false, decorationActive = false, onPaintVoid, onPaintStrand, paintColor = '#c0392b', paintTarget = 'voids', paintVoidScope = 'congruent', paintStrandScope = 'all', onSelectStampVoid, selectedStampSignature, onDecorationVoids, showMorphOverlay = false, onSetMorphOrigin, onSetMorphDirection, onSetMorphBoundaryPosition }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight })

  useEffect(() => {
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        setSize({ width: entry.contentRect.width, height: entry.contentRect.height })
      }
    })
    if (containerRef.current) observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  // Centre world origin at the canvas centre so tessellations that anchor
  // at (0, 0) — mandalas in particular — appear in the middle of the view.
  // Archimedean / rosette-patch tessellations fill the viewport regardless,
  // so the shift is invisible there.
  const initialX = -size.width / 2
  const initialY = -size.height / 2
  const { viewTransform, handlers, setViewTransform } = usePanZoom(
    INITIAL_ZOOM, svgRef, initialX, initialY,
  )
  // Defer the heavy tiling computation so pointer events stay responsive.
  // NB: only viewTransform (pan/zoom) is deferred — NOT config. Deferring config
  // was tried (555ccfd) and reverted: during a continuous slider drag the
  // recompute can't keep pace, so useDeferredValue kept deferring and the
  // preview only updated on release (no live feedback). Parameter edits must
  // stay synchronous for a live preview; the real fix for their cost is the
  // periodicity-PIC lever (cheap recompute), not deferral.
  const deferredVT = useDeferredValue(viewTransform)
  const { polygons, segments, boundaryOutlines, ghostPolygons, neighbourStamps, seedOutlineCount, ghostPolygonIds, compositionStamps, voidFills, instanceVoidFills, voidStamps, decorationVoids, decorationStrandHits, decorationOrbitStamps, decorationCellFrames, strandIdentitySource } = usePattern(
    config,
    deferredVT,
    size.width,
    size.height,
    editorStrandMode,
    showBoundaryLattice,
    editorNeighbourPreview,
    editorNeighbourBoundaries,
    editorNeighbourStrands,
    editorFrame,
    decorationActive,
    // Stamp mode needs the same Void hit-targets as Voids painting.
    !decorationActive ? 'off' : paintTarget === 'stamp' ? 'voids' : paintTarget,
  )

  // Mirror the Void hit-targets up so the Decoration panel can export every
  // distinct shape without re-running the extraction.
  useEffect(() => {
    onDecorationVoids?.(decorationVoids ?? [])
  }, [decorationVoids, onDecorationVoids])

  // The Frame outline to clip the Composition to — a persistent overlay across
  // Design + Composition (read later by Decoration). Shape Frames give a
  // parametric outline; n-ring Frames give the outer boundary of the centre
  // Patch + N neighbour shells (clip only). Absent frames yield null → no clip.
  const frameOutline = useMemo(() => {
    // In the Builder the Frame lives on `editor.frame` (and may be an n-ring);
    // in the Gallery it's the top-level clip-only Shape Frame.
    if (editorFrame) {
      const frame = config.editor?.frame
      if (!frame || !config.editor) return null
      if (frame.type === 'n-ring') {
        const patch = config.editor
        // Multi-cell Configurations stamp the whole Patch (every Cell's
        // Boundary) across the ring; single-cell Patches stamp the one Cell.
        if (patch.cells.length > 1) {
          return compositionNRingOutline(patch, frame.rings ?? DEFAULT_FRAME_RINGS, frame.rotation ?? 0)
        }
        const active = patch.cells.find(c => c.id === patch.activeCellId) ?? patch.cells[0]
        return active ? nRingOutline(active, frame.rings ?? DEFAULT_FRAME_RINGS, frame.rotation ?? 0) : null
      }
      return frameOutlinePolygon(frame)
    }
    // Gallery Frame — only parametric Shape Frames are ever stored here, and
    // only the Gallery (non-editor tiling) clips to it; the Lab's own frame
    // lives on `editor.frame` and is handled above.
    if (config.tiling.type === 'editor') return null
    const gFrame = config.frame
    if (!gFrame || gFrame.type !== 'shape') return null
    return frameOutlinePolygon(gFrame)
  }, [editorFrame, config.editor, config.frame, config.tiling.type])
  // Frame nodes — points spaced one seed edgeLength apart along the outline
  // (including corners). In Complete mode these become clickable completion
  // pick targets (see `frameVertices`). Shape Frames only — n-ring Frames are
  // clip-only (no nodes). Frame-scoped completion Tiles render through
  // usePattern's `polygons` so PIC emits Strands through them.
  const editorEdgeLength = config.editor?.edgeLength
  const isShapeFrame = editorFrame && config.editor?.frame?.type === 'shape'
  const frameSections = useMemo(
    () => (isShapeFrame && frameOutline && editorEdgeLength ? computeFrameSections(frameOutline, editorEdgeLength) : null),
    [isShapeFrame, frameOutline, editorEdgeLength],
  )
  const frameNodes = useMemo(() => (frameSections ? frameNodePoints(frameSections) : null), [frameSections])
  // Decorative Frame border stroke (FrameConfig.stroke, set from the
  // Decoration panel). When enabled, PatternSVG draws it in place of the
  // accent guide line.
  const frameStrokeCfg = editorFrame
    ? config.editor?.frame?.stroke
    : config.tiling.type !== 'editor' ? config.frame?.stroke : undefined
  const frameStroke = frameStrokeCfg?.enabled ? frameStrokeCfg : null

  const resetCamera = useCallback(() => {
    setViewTransform({
      x: -size.width / 2,
      y: -size.height / 2,
      zoom: INITIAL_ZOOM,
      rotation: 0,
    })
  }, [setViewTransform, size.width, size.height])

  const onRotation = useCallback((degrees: number) => {
    setViewTransform(prev => ({ ...prev, rotation: degrees }))
  }, [setViewTransform])

  // Manual zoom, anchored on the canvas centre so the view doesn't drift.
  // Mirrors the wheel handler's math with the anchor fixed at (w/2, h/2).
  const zoomBy = useCallback((factor: number) => {
    const sx = size.width / 2
    const sy = size.height / 2
    setViewTransform(prev => {
      const newZoom = prev.zoom * factor
      const px = prev.x + sx / prev.zoom
      const py = prev.y + sy / prev.zoom
      return { ...prev, zoom: newZoom, x: px - sx / newZoom, y: py - sy / newZoom }
    })
  }, [setViewTransform, size.width, size.height])

  const resetZoom = useCallback(() => {
    zoomBy(INITIAL_ZOOM / viewTransform.zoom)
  }, [zoomBy, viewTransform.zoom])

  // Keyboard shortcut: Home key to reset camera
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Home' || (e.key === '0' && (e.ctrlKey || e.metaKey))) {
        e.preventDefault()
        resetCamera()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [resetCamera])

  // Keep segments ref up to date for export.
  // CAVEAT (Lever A, perf.ts): in Composition when the periodicity fast-path
  // engages, `segments` is ONE fundamental domain, not the full tiled field
  // (which lives as <use> clones in the DOM). `exportUnwovenSVG(segmentsRef…)`
  // would therefore emit a single unit cell. The Builder currently wires no
  // such export; any future Builder save/export must use DOM-based export
  // (`exportSVG`) or re-derive the full field — NOT this ref.
  segmentsRef.current = segments

  // ── Builder overlay (Step 17.3) ──────────────────────
  const editorActive = config.tiling.type === 'editor' && config.editor != null
  // Multi-cell "Alternate orientation" rotates the whole Patch rigidly; the
  // picker overlays must turn with the tiles, so fold the Patch rotation into
  // every Cell transform (0 for single-cell + non-alternate Patches).
  const patchRot = editorActive && config.editor ? patchRotation(config.editor) : 0
  // Per-Cell picker geometry: edges/vertices are computed per Cell in Cell-local
  // coords; the canvas renders Cells at Patch-local coords. We keep the raw
  // (Cell-local) edges as the source of truth for validation + dispatch, and
  // transform a parallel list (Patch-local) for rendering / picker placement.
  //
  // Aggregating across every Cell lets the user place inside any Cell
  // (auto-switches active on click). Each edge is tagged with its host Cell id;
  // the Cell-local edge stays the source of truth for validation.
  const exposedEdges = useMemo(() => {
    if (!editorActive || !config.editor) return [] as ExposedEdge[]
    const out: ExposedEdge[] = []
    for (const cell of config.editor.cells) {
      for (const e of computeExposedEdges(cell, config.editor.edgeLength)) {
        out.push({ ...e, hostCellId: cell.id })
      }
    }
    return out
  }, [editorActive, config.editor])
  const renderedEdges = useMemo(() => {
    if (!editorActive || !config.editor) return exposedEdges
    const cellById = new Map<string, CellLike>()
    for (const cell of config.editor.cells) {
      cellById.set(cell.id, cell)
    }
    return exposedEdges.map(e => {
      const cell = e.hostCellId ? cellById.get(e.hostCellId) : undefined
      return cell ? transformEdge(e, cell, patchRot) : e
    })
  }, [exposedEdges, editorActive, config.editor, patchRot])
  const [hoveredEdge, setHoveredEdge] = useState<SelectedEdge | null>(null)
  useEffect(() => { if (!editorActive) setHoveredEdge(null) }, [editorActive])

  const selectedEdgeData = selectedEdge && exposedEdges.find(
    e => e.tileId === selectedEdge.tileId
      && e.edgeIndex === selectedEdge.edgeIndex
      && (selectedEdge.hostCellId ?? null) === (e.hostCellId ?? null),
  )

  // Step 17.5 / 17.11 — outer + pocket cycles for the vertex picker, only
  // computed when complete mode is active to keep the place-mode hot path
  // cheap. Pockets are 17.11.0's interior holes.
  const allCycles = useMemo(
    () => {
      if (!editorActive || !config.editor || editorMode !== 'complete') {
        return { outer: [] as BoundaryVertex[], pockets: [] as BoundaryVertex[][] }
      }
      // Expose every Cell's cycles so the user can pick vertices from any
      // Cell in Complete mode. Each cycle is in its own Cell-local coords; we
      // transform via the Cell's centre + rotation to bring them into shared
      // Patch-local coords for rendering. Vertex tileIds are namespaced
      // (e.g. `octagon/seed`) so React keys stay unique across Cells — the
      // reducer routes completion by position match, not tileId.
      const outer: BoundaryVertex[] = []
      const pockets: BoundaryVertex[][] = []
      for (const cell of config.editor.cells) {
        const cycles = computeAllCycles(cell)
        for (const v of cycles.outer) {
          outer.push({ ...transformBoundaryVertex(v, cell, patchRot), tileId: `${cell.id}/${v.tileId}` })
        }
        for (const cycle of cycles.pockets) {
          pockets.push(cycle.map(v => ({
            ...transformBoundaryVertex(v, cell, patchRot),
            tileId: `${cell.id}/${v.tileId}`,
          })))
        }
      }
      return { outer, pockets }
    },
    [editorActive, config.editor, editorMode, patchRot],
  )
  const boundaryCycle = allCycles.outer
  // Pocket vertices are clickable in Complete mode. Flatten the per-pocket
  // cycles into a single array — variant rendering doesn't need the grouping.
  const pocketVertices = useMemo(
    () => allCycles.pockets.flat(),
    [allCycles.pockets],
  )
  // Boundary-polygon corners — clickable in Complete mode so the user can
  // fill regions bounded by the Boundary outline. Filtered to drop corners
  // that coincide with Cell outer-cycle vertices (would render twice).
  // Aggregate corners from every Cell, same as cycles.
  const boundaryCorners = useMemo(() => {
    if (!editorActive || !config.editor || editorMode !== 'complete') return []
    const collected: BoundaryVertex[] = []
    for (const cell of config.editor.cells) {
      const raw = computeBoundaryCycle(cell)
      for (const v of raw) {
        collected.push({ ...transformBoundaryVertex(v, cell, patchRot), tileId: `${cell.id}/${v.tileId}` })
      }
    }
    return collected.filter(c => !boundaryCycle.some(v =>
      Math.abs(v.p.x - c.p.x) < EDITOR_EPS && Math.abs(v.p.y - c.p.y) < EDITOR_EPS,
    ))
  }, [editorActive, config.editor, editorMode, boundaryCycle, patchRot])
  // Step 17.11 — neighbour-stamp vertices, exposed only when "Show neighbours"
  // is on so cross-boundary picks line up with the visible ghost geometry. The
  // stamp set (full visible lattice minus the centre copy) comes straight from
  // `usePattern.neighbourStamps`, the exact set the ghost polygons were drawn
  // from. For each stamp we lift every Cell's full selectable set — outer tile
  // cycle + interior pockets + Cell-Boundary corners — from Cell-local to
  // Patch-local (Cell transform) then apply the stamp, mirroring the live
  // Patch's exposure so neighbour Cell vertices are clickable too. Flatten to a
  // single array since variant styling already tags them as ghosts.
  const neighbourVertices = useMemo(() => {
    if (!editorActive || !config.editor || editorMode !== 'complete') return []
    if (!editorNeighbourPreview || editorStrandMode || !neighbourStamps) return []
    const patch = config.editor
    const out: BoundaryVertex[] = []
    for (let s = 0; s < neighbourStamps.length; s++) {
      const stamp = neighbourStamps[s]
      for (const cell of patch.cells) {
        const cycles = computeAllCycles(cell)
        const cellLocal: Vec2[] = [
          ...cycles.outer.map(v => v.p),
          ...cycles.pockets.flat().map(v => v.p),
          ...computeBoundaryCycle(cell).map(v => v.p),
        ]
        for (let i = 0; i < cellLocal.length; i++) {
          const patchLocal = applyCellTransform(cellLocal[i], cell, patchRot)
          out.push({
            p: applyStamp(patchLocal, stamp),
            tileId: `neighbour-${s}/${cell.id}`,
            vertexIndex: i,
          })
        }
      }
    }
    return out
  }, [editorActive, config.editor, editorMode, editorNeighbourPreview, editorStrandMode, neighbourStamps, patchRot])

  // Cell-centre completion nodes — one per no-Seed Cell, exposed only in
  // Complete mode. An empty Cell has no interior anchor (only Boundary corners
  // around the rim), so the centre node gives the user a radial "start here"
  // pick to build wedge Tiles from the middle out. Cell-local origin (0, 0) is
  // where `editorBoundaryVertices` centres every Boundary; lift into Patch-local
  // like every other pick target. Kept in sync with `cellLocalSelectableVertices`
  // (patchSelectable.ts) so the reducer accepts exactly these points.
  const centreVertices = useMemo<BoundaryVertex[]>(() => {
    if (!editorActive || !config.editor || editorMode !== 'complete') return []
    const out: BoundaryVertex[] = []
    for (const cell of config.editor.cells) {
      if (!cell.noSeed) continue
      out.push({
        p: applyCellTransform({ x: 0, y: 0 }, cell, patchRot),
        tileId: `${cell.id}/centre`,
        vertexIndex: 0,
      })
    }
    return out
  }, [editorActive, config.editor, editorMode, patchRot])

  // Frame nodes are clickable completion targets in Complete mode (the Frame
  // is a persistent overlay). Picking a frame node together with interior
  // vertices completes a tile out to the frame edge; the reducer stores such
  // completions frame-scoped (world space, non-repeating). Shape Frames only —
  // `frameNodes` is null for n-ring / no frame.
  const frameVertices = useMemo<BoundaryVertex[]>(() => {
    if (!editorActive || editorMode !== 'complete' || editorStrandMode || !frameNodes) return []
    return frameNodes.map((p, i) => ({ p, tileId: `frame/${i}`, vertexIndex: i }))
  }, [editorActive, editorMode, editorStrandMode, frameNodes])

  // Guide Anchors are clickable completion targets in Complete mode (slice 3):
  // every point a Guide exposes (endpoints/ticks/divisions/manual + Guide×Guide
  // and Guide×Tile-edge/Boundary crossings) in Patch-world coords, tagged with
  // `stamp` so the dot colour signals world-space vs Patch-relative. Picking one
  // routes through the reducer's Guide-completion path.
  const guideAnchorVertices = useMemo<Array<BoundaryVertex & { stamp: boolean }>>(() => {
    if (!editorActive || !config.editor || editorMode !== 'complete' || editorStrandMode) return []
    return collectGuideAnchors(config.editor, patchRot).map((a, i) => ({
      p: a.p,
      tileId: `guide-anchor/${a.guideId}`,
      vertexIndex: i,
      stamp: a.stamp,
    }))
  }, [editorActive, config.editor, editorMode, editorStrandMode, patchRot])

  // Lookup of Cell by id — shared by the section + vertex overlays to
  // transform each Cell's Cell-local geometry into Patch-local coords.
  const cellById = useMemo(() => {
    const m = new Map<string, EditorCell>()
    if (config.editor) for (const c of config.editor.cells) m.set(c.id, c)
    return m
  }, [config.editor])

  // Step 17.12 — Boundary-section highlights, always rendered in Design Phase
  // Place mode (no enabling toggle). Sections are computed per Cell in
  // Cell-local coords (the Boundary is always centred at (0, 0) per
  // `editorBoundaryVertices`), aggregated across EVERY Cell of the Patch (each
  // tagged with its host Cell id), then lifted into Patch-local via that Cell's
  // transform. All Cells are exposed at once — clicking a section auto-routes
  // placement to its host Cell (no active-Cell selector).
  const sectionsActive = !!(
    editorActive && config.editor
    && editorMode === 'place'
    && !editorStrandMode
  )
  const cellLocalSections = useMemo(() => {
    if (!sectionsActive || !config.editor) return [] as Array<BoundarySection & { hostCellId: string }>
    const out: Array<BoundarySection & { hostCellId: string }> = []
    for (const cell of config.editor.cells) {
      for (const s of computeBoundarySections(cell)) out.push({ ...s, hostCellId: cell.id })
    }
    return out
  }, [sectionsActive, config.editor])
  const renderedSections = useMemo(() => {
    return cellLocalSections.map(s => {
      const cell = cellById.get(s.hostCellId)
      if (!cell) return s
      return {
        ...s,
        p1: applyCellTransform(s.p1, cell, patchRot),
        p2: applyCellTransform(s.p2, cell, patchRot),
        midpoint: applyCellTransform(s.midpoint, cell, patchRot),
      }
    })
  }, [cellLocalSections, cellById, patchRot])
  const [hoveredSection, setHoveredSection] = useState<SectionKey | null>(null)
  useEffect(() => { if (!sectionsActive) setHoveredSection(null) }, [sectionsActive])
  const selectedSectionData = selectedSection && cellLocalSections.find(
    s => s.edgeIndex === selectedSection.edgeIndex
      && s.sectionIndex === selectedSection.sectionIndex
      && (selectedSection.hostCellId ?? null) === (s.hostCellId ?? null),
  )
  const selectedSectionCell = selectedSectionData ? cellById.get(selectedSectionData.hostCellId) ?? null : null

  // ── Vertex placement (Step 17.13c) ───────────────────
  // Active in Design Phase + Place mode, single-cell AND multi-cell alike.
  // Vertices are computed per Cell in Cell-local coords, aggregated across
  // EVERY Cell of the Patch (each tagged with its host Cell id), then lifted
  // into Patch-local via that Cell's transform. All Cells are exposed at once;
  // a click routes placement to its host Cell (the action carries hostCellId).
  // State machine:
  //   selectedVertex !== null && pickedSides === null → page 1 (shape grid)
  //   selectedVertex !== null && pickedSides !== null → page 2 (orientations)
  const vertexPlacementActive = !!(
    editorActive && config.editor
    && editorMode === 'place'
    && !editorStrandMode
    && onPlaceTileOnVertex
  )
  // Real Cell vertices (Cell-local coords, tagged with host Cell) plus Guide
  // Anchors injected as synthetic full-2π vertices (Guides slice 3 / #33).
  // Anchor `p` is Patch-world coords with NO host Cell, and the picker runs
  // viability against a world probe Cell. One shared pass computes both the
  // Cell-local set (picker round-trips) and the world-position set (dot
  // rendering); the Anchor-vs-real-vertex drop uses the same 1e-4 rounded-key
  // grid as `vertexKeyOf` / `dedupeAnchors`, so a conceptually-coincident
  // Anchor arriving via a different float path still collapses onto the real
  // vertex (whose proper open sectors win). Anchors only appear when the
  // commit handler is wired — a consumer wiring `onPlaceTileOnVertex` alone
  // must not render dead-click Anchor targets.
  const { cellLocalVertices, renderedVertices } = useMemo(() => {
    if (!vertexPlacementActive || !config.editor) {
      return { cellLocalVertices: [] as ExposedVertex[], renderedVertices: [] as ExposedVertex[] }
    }
    const patch = config.editor
    const cellLocal: ExposedVertex[] = []
    const rendered: ExposedVertex[] = []
    const worldKeys = new Set<string>()
    for (const cell of patch.cells) {
      for (const v of computeExposedVertices(cell)) {
        const local = { ...v, hostCellId: cell.id }
        cellLocal.push(local)
        const w = applyCellTransform(v.p, cell, patchRot)
        rendered.push({ ...local, p: w })
        worldKeys.add(vertexKeyOf(w))
      }
    }
    if (onPlaceTileOnAnchor) {
      for (const a of collectGuideAnchors(patch, patchRot)) {
        if (worldKeys.has(vertexKeyOf(a.p))) continue
        const anchorVertex: ExposedVertex = {
          ...makeAnchorVertex(a.p),
          guideAnchor: { guideId: a.guideId, stamp: a.stamp },
        }
        cellLocal.push(anchorVertex)
        rendered.push(anchorVertex)
      }
    }
    return { cellLocalVertices: cellLocal, renderedVertices: rendered }
  }, [vertexPlacementActive, config.editor, patchRot, onPlaceTileOnAnchor])
  // Selection / hover tracked by composite uid (host Cell + Cell-local key)
  // since keys can collide between Cells.
  const [selectedVertex, setSelectedVertex] = useState<{ key: VertexKey; hostCellId?: string } | null>(null)
  const [hoveredVertexKey, setHoveredVertexKey] = useState<string | null>(null)
  const [vertexPickedSides, setVertexPickedSides] = useState<number | null>(null)
  const [vertexOrientationIdx, setVertexOrientationIdx] = useState(0)
  // Flexible-placement overlap confirmation. Set when the user picks a size /
  // orientation that would overlap; the popover's "Accept and continue" runs
  // `commit`. `pos` anchors the popover at the picker's screen position so it
  // reads as a local confirmation, not a screen overlay.
  const [overlapConfirm, setOverlapConfirm] = useState<
    { sides: number; symmetry: boolean; pos: { x: number; y: number }; commit: () => void } | null
  >(null)
  useEffect(() => {
    if (!vertexPlacementActive) {
      setSelectedVertex(null)
      setHoveredVertexKey(null)
      setVertexPickedSides(null)
      setVertexOrientationIdx(0)
    }
  }, [vertexPlacementActive])
  // Drop the picker when the underlying vertex disappears (e.g. another
  // placement covered it). Stops a stale picker from dispatching against a
  // vertex key that's been resolved away.
  useEffect(() => {
    if (selectedVertex && !cellLocalVertices.some(
      v => v.key === selectedVertex.key && (v.hostCellId ?? undefined) === (selectedVertex.hostCellId ?? undefined),
    )) {
      setSelectedVertex(null)
      setVertexPickedSides(null)
      setVertexOrientationIdx(0)
    }
  }, [cellLocalVertices, selectedVertex])
  const selectedVertexData = selectedVertex
    ? cellLocalVertices.find(
        v => v.key === selectedVertex.key && (v.hostCellId ?? undefined) === (selectedVertex.hostCellId ?? undefined),
      ) ?? null
    : null
  // Host Cell of the selected vertex — drives viability / preview / edge length.
  const selectedVertexCell = selectedVertexData?.hostCellId
    ? cellById.get(selectedVertexData.hostCellId) ?? null
    : null
  // Edge length for a candidate placed Tile — sized to the host Cell's own
  // Tiles, not `patch.edgeLength` (the lattice constant in a multi-cell Patch
  // after the boundary-size slider). Must match the reducer
  // (`cellPlacementEdgeLength`) so the picker badges + preview reflect what
  // actually gets placed.
  const placementEdgeLength = selectedVertexCell && config.editor
    ? cellPlacementEdgeLength(selectedVertexCell, config.editor.edgeLength, config.editor.cells)
    : 0
  // Guide Anchor placement (slice 3 / #33): the selected vertex is a synthetic
  // Anchor in Patch-world coords. Viability + preview run against a probe Cell
  // holding EVERY world Tile (all Cells + prior world completions) at identity
  // transform (`center 0, rotation 0, symmetry none`), sized to the Patch edge
  // length — mirrors the reducer's `placeTileOnGuideAnchor`.
  const selectedIsGuideAnchor = !!selectedVertexData?.guideAnchor
  const guideProbeCell = useMemo<EditorCell | null>(() => {
    if (!selectedIsGuideAnchor || !config.editor) return null
    return worldProbeCell(config.editor, patchRot)
  }, [selectedIsGuideAnchor, config.editor, patchRot])
  // Effective probe Cell + edge length used by every viability / preview memo —
  // the world probe Cell for a Guide Anchor, else the host Cell. Anchor
  // placements size to the ACTIVE Cell's Tiles (`cellPlacementEdgeLength`, not
  // the raw lattice constant) — must match the reducer's
  // `placeTileOnGuideAnchor` so preview and commit agree.
  const effectiveVertexCell = selectedIsGuideAnchor ? guideProbeCell : selectedVertexCell
  const anchorEdgeLength = (() => {
    if (!selectedIsGuideAnchor || !config.editor) return 0
    const patch = config.editor
    const active = patch.cells.find(c => c.id === patch.activeCellId) ?? patch.cells[0]
    return cellPlacementEdgeLength(active, patch.edgeLength, patch.cells)
  })()
  const effectiveEdgeLength = selectedIsGuideAnchor ? anchorEdgeLength : placementEdgeLength
  const vertexPickerViableSides = useMemo<number[]>(() => {
    if (!selectedVertexData || !effectiveVertexCell || !config.editor) return []
    // Orbit-aware: under symmetry a size is only "clean" if its full orbit
    // places without force. Mirrors the edge picker's viableSidesForEdge.
    // (Guide probe Cell is symmetry 'none' → degrades to the base check.)
    return viableSidesForVertexOrbit(
      selectedVertexData,
      effectiveEdgeLength,
      effectiveVertexCell,
      PICKER_SIDES,
    )
  }, [selectedVertexData, effectiveVertexCell, config.editor, effectiveEdgeLength])
  // Sizes that only produce overlapping orientations — placeable via the
  // skippable warning. The complement of clean within the angularly-placeable
  // set (sizes with no fitting sector at all stay disabled).
  const vertexPickerForceableSides = useMemo<number[]>(() => {
    if (!selectedVertexData || !effectiveVertexCell || !config.editor) return []
    const placeable = placeableSidesForVertex(
      selectedVertexData,
      effectiveEdgeLength,
      effectiveVertexCell,
      PICKER_SIDES,
    )
    return placeable.filter(n => !vertexPickerViableSides.includes(n))
  }, [selectedVertexData, effectiveVertexCell, config.editor, effectiveEdgeLength, vertexPickerViableSides])
  const vertexOrientations = useMemo(() => {
    if (!selectedVertexData || vertexPickedSides === null || !effectiveVertexCell || !config.editor) {
      return []
    }
    // Orbit-aware overlap flags so page-2 orientation badges + the commit's
    // force routing match what the reducer's all-or-nothing orbit placer does.
    return vertexOrientationsWithOrbit(
      selectedVertexData,
      vertexPickedSides,
      effectiveEdgeLength,
      effectiveVertexCell,
    )
  }, [selectedVertexData, vertexPickedSides, effectiveVertexCell, config.editor, effectiveEdgeLength])
  useEffect(() => {
    // Clamp orientation index if the available orientations shrank.
    if (vertexOrientationIdx >= vertexOrientations.length && vertexOrientations.length > 0) {
      setVertexOrientationIdx(0)
    }
  }, [vertexOrientations, vertexOrientationIdx])

  // Live preview of the candidate Tile, rendered as a translucent polygon in
  // the editor overlay. Built in Cell-local coords then transformed into
  // Patch-local for rendering via the host Cell's transform — keeps centring +
  // rotation consistent with the Cell the vertex belongs to.
  const vertexPreviewPoints = useMemo<string | null>(() => {
    if (!selectedVertexData || vertexPickedSides === null || !effectiveVertexCell || !config.editor) {
      return null
    }
    const orientation = vertexOrientations[vertexOrientationIdx]
    if (!orientation) return null
    const tile = placeRegularNGonOnVertex(
      vertexPickedSides,
      effectiveEdgeLength,
      selectedVertexData,
      orientation.rotation,
      '__preview__',
    )
    const verts = regularPolygonVertices(tile.sides, tile.center, tile.edgeLength, tile.rotation)
    return verts.map(v => {
      // Guide Anchor tiles are already in Patch-world coords (anchor `p` was
      // world); real-vertex tiles are Cell-local and lift via the host Cell.
      const w = selectedIsGuideAnchor ? v : applyCellTransform(v, effectiveVertexCell, patchRot)
      return `${w.x},${w.y}`
    }).join(' ')
  }, [selectedVertexData, vertexPickedSides, vertexOrientations, vertexOrientationIdx, effectiveVertexCell, selectedIsGuideAnchor, config.editor, patchRot, effectiveEdgeLength])

  // Closing the picker without committing — also clears the page-2 state.
  // useCallback so the memoised EditorVertexPlacementLayer (whose onSelect
  // depends on this) bails on pan frames (Finding 1, 2026-06-05).
  const closeVertexPicker = useCallback(() => {
    setSelectedVertex(null)
    setVertexPickedSides(null)
    setVertexOrientationIdx(0)
  }, [])
  // Vertex-dot selection. Extracted from the inline overlay prop + useCallback'd
  // so the memoised EditorVertexPlacementLayer bails when nothing changed.
  const handleSelectVertexPlacement = useCallback((v: ExposedVertex | null) => {
    // Clear sibling pickers so only one overlay is open.
    if (v) {
      onSelectEdge?.(null)
      onSelectSection?.(null)
      setSelectedVertex({ key: v.key, hostCellId: v.hostCellId })
      setVertexPickedSides(null)
      setVertexOrientationIdx(0)
    } else {
      closeVertexPicker()
    }
  }, [onSelectEdge, onSelectSection, closeVertexPicker])

  // ── Construct mode (Guides, spec Decision 11) ─────────
  // Two-click Guide-line drawing + select/drag/popup. Empty-canvas clicks are
  // detected by wrapping the svg-level pan handlers (pointerdown→up within a
  // slop radius), because usePanZoom pointer-captures the svg on pointerdown —
  // an in-layer capture rect would never receive the retargeted pointerup.
  const constructActive = editorActive && !editorStrandMode && !decorationActive
    && editorMode === 'construct' && !!onAddGuide
  const guides = useMemo(() => config.editor?.guides ?? [], [config.editor])
  // Draft: the committed first click (plus the edge direction it snapped to,
  // feeding the angle-snap reference set) — then the live snapped cursor.
  const [guideDraftStart, setGuideDraftStart] = useState<{ p: Vec2; edgeAngle?: number } | null>(null)
  const [constructCursor, setConstructCursor] = useState<Vec2 | null>(null)
  const [guideSnapTarget, setGuideSnapTarget] = useState<SnapPoint | null>(null)
  const [selectedGuideId, setSelectedGuideId] = useState<string | null>(null)
  // Dismissing the popup by clicking the canvas fires close (pointerdown) then
  // the click (pointerup) — swallow that click so it doesn't drop a draft point.
  const swallowClickUntil = useRef(0)
  useEffect(() => {
    if (!constructActive) {
      setGuideDraftStart(null)
      setConstructCursor(null)
      setGuideSnapTarget(null)
      setSelectedGuideId(null)
    }
  }, [constructActive])
  // Drop a stale selection if the Guide vanished (undo / delete / new patch).
  useEffect(() => {
    if (selectedGuideId && !guides.some(g => g.id === selectedGuideId)) setSelectedGuideId(null)
  }, [guides, selectedGuideId])
  // Switching Guide tool mid-draw abandons the half-drawn draft (a committed
  // first click shouldn't reinterpret as the other shape's anchor).
  useEffect(() => {
    setGuideDraftStart(null)
    setGuideSnapTarget(null)
  }, [constructTool])
  // Esc cancels the in-progress draft (and closes the popup via its own key
  // handler).
  useEffect(() => {
    if (!constructActive) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setGuideDraftStart(null)
        setGuideSnapTarget(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [constructActive])

  // Snap candidates (Patch-local world coords). While a Guide is selected its
  // own Anchors are excluded so an endpoint drag can't snap to itself.
  const guideSnapPoints = useMemo<SnapPoint[]>(() => {
    if (!constructActive || !config.editor) return []
    const patch = selectedGuideId
      ? { ...config.editor, guides: guides.filter(g => g.id !== selectedGuideId) }
      : config.editor
    return collectSnapPoints(patch, patchRot)
  }, [constructActive, config.editor, guides, selectedGuideId, patchRot])

  // Visible world rectangle, padded to the view diagonal so rotation never
  // exposes an unclipped corner — extended Guide lines clip to this.
  const guideBounds = useMemo<WorldBounds>(() => {
    const vw = size.width / viewTransform.zoom
    const vh = size.height / viewTransform.zoom
    const cx = viewTransform.x + vw / 2
    const cy = viewTransform.y + vh / 2
    const half = Math.hypot(vw, vh) / 2
    return { minX: cx - half, minY: cy - half, maxX: cx + half, maxY: cy + half }
  }, [size.width, size.height, viewTransform])

  /** Resolve a screen-px pointer position into a (possibly snapped) world
   *  point. Point snap wins; else, with a draft in progress, angle snap from
   *  the draft start. `freehand` (Shift) bypasses both. */
  const resolveConstructPoint = useCallback((screen: Vec2, freehand: boolean): { p: Vec2; snap: SnapPoint | null } => {
    const w = screenToWorld(screen, viewTransform, size.width, size.height)
    if (!constructSnap || freehand) return { p: w, snap: null }
    const tol = 14 / viewTransform.zoom
    const snap = snapToPoint(w, guideSnapPoints, tol)
    if (snap) return { p: snap.p, snap }
    if (guideDraftStart) {
      return { p: snapAngle(guideDraftStart.p, w, constructAngleStep, guideDraftStart.edgeAngle), snap: null }
    }
    return { p: w, snap: null }
  }, [viewTransform, size.width, size.height, constructSnap, guideSnapPoints, guideDraftStart, constructAngleStep])

  const handleConstructMove = useCallback((screen: Vec2, freehand: boolean) => {
    const { p, snap } = resolveConstructPoint(screen, freehand)
    setConstructCursor(p)
    setGuideSnapTarget(snap)
  }, [resolveConstructPoint])

  const handleConstructPoint = useCallback((screen: Vec2, freehand: boolean) => {
    if (performance.now() < swallowClickUntil.current) return
    // A click with the popup open just dismisses it (the popup's own
    // outside-click close already fired on pointerdown).
    if (selectedGuideId) {
      setSelectedGuideId(null)
      return
    }
    const { p, snap } = resolveConstructPoint(screen, freehand)
    if (!guideDraftStart) {
      setGuideDraftStart({ p, edgeAngle: snap?.edgeAngle })
      return
    }
    // Second click: zero-extent is a no-op (double-click on the same point).
    if (pointsEqual(guideDraftStart.p, p, 1e-6)) return
    const guide = constructTool === 'line'
      ? createGuideLine(guideDraftStart.p, p, guides)
      : createGuideCircle(guideDraftStart.p, p, constructTool === 'divided-circle', guides)
    onAddGuide?.(guide)
    setGuideDraftStart(null)
    setGuideSnapTarget(null)
  }, [selectedGuideId, resolveConstructPoint, guideDraftStart, onAddGuide, guides, constructTool])

  // Handle drag on the selected Guide: point-snap (own Anchors excluded),
  // else angle-snap. Line endpoints pivot about the fixed opposite endpoint;
  // a circle's centre translates, its radius handle resizes + rotates about
  // the centre.
  const handleDragHandle = useCallback((id: string, handle: GuideHandle, screen: Vec2) => {
    const g = guides.find(g => g.id === id)
    if (!g || !onUpdateGuide) return
    const w = screenToWorld(screen, viewTransform, size.width, size.height)
    const tol = 14 / viewTransform.zoom
    const snap = constructSnap ? snapToPoint(w, guideSnapPoints, tol) : null
    if (g.kind === 'line' && (handle === 'start' || handle === 'end')) {
      const p = snap ? snap.p : (constructSnap ? snapAngle(handle === 'start' ? g.end : g.start, w, constructAngleStep) : w)
      onUpdateGuide(id, { [handle]: p })
      return
    }
    if (g.kind === 'circle' && handle === 'center') {
      onUpdateGuide(id, { center: snap ? snap.p : w })
      return
    }
    if (g.kind === 'circle' && handle === 'radius') {
      // Snap the radius endpoint to a point if near one; else angle-snap the
      // direction about the centre (free radius, snapped phase).
      const p = snap ? snap.p : (constructSnap ? snapAngle(g.center, w, constructAngleStep) : w)
      const dx = p.x - g.center.x
      const dy = p.y - g.center.y
      const radius = Math.hypot(dx, dy)
      if (radius < 1e-6) return
      onUpdateGuide(id, { radius, phase: Math.atan2(dy, dx) })
    }
  }, [guides, onUpdateGuide, viewTransform, size.width, size.height, constructSnap, guideSnapPoints, constructAngleStep])

  // Wrap the pan/zoom handlers with click-slop detection while Construct is
  // live. Guide strokes + endpoint handles stopPropagation on pointerdown, so
  // neither pans the canvas nor registers as a draw click.
  const constructDownRef = useRef<{ x: number; y: number } | null>(null)
  const svgScreenPos = useCallback((e: React.PointerEvent<SVGSVGElement>): Vec2 => {
    const rect = svgRef.current?.getBoundingClientRect()
    return { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) }
  }, [svgRef])
  const svgHandlers = useMemo<PanZoomHandlers>(() => {
    if (!constructActive) return handlers
    return {
      onPointerDown: e => {
        constructDownRef.current = { x: e.clientX, y: e.clientY }
        handlers.onPointerDown(e)
      },
      onPointerMove: e => {
        handlers.onPointerMove(e)
        handleConstructMove(svgScreenPos(e), e.shiftKey)
      },
      onPointerUp: e => {
        handlers.onPointerUp(e)
        const down = constructDownRef.current
        constructDownRef.current = null
        if (!down) return
        if (Math.abs(e.clientX - down.x) > 5 || Math.abs(e.clientY - down.y) > 5) return
        handleConstructPoint(svgScreenPos(e), e.shiftKey)
      },
    }
  }, [constructActive, handlers, handleConstructMove, handleConstructPoint, svgScreenPos])

  // Guides render across Design modes (they're scaffolding for Place /
  // Complete too); in Composition only behind the overlay toggle; never in
  // Decoration (v1). Interactive only in Construct mode.
  const guideLayerVisible = editorActive && !decorationActive
    && (guides.length > 0 || constructActive)
    && (!editorStrandMode || showGuides)
  const guideLayer = guideLayerVisible && config.editor ? (
    <EditorGuideLayer
      guides={guides}
      patchEdgeLength={config.editor.edgeLength}
      bounds={guideBounds}
      interactive={constructActive}
      zoom={viewTransform.zoom}
      draftStart={guideDraftStart?.p ?? null}
      draftCursor={constructCursor}
      draftTool={constructTool === 'line' ? 'line' : 'circle'}
      snapTarget={guideSnapTarget}
      selectedGuideId={selectedGuideId}
      onSelectGuide={setSelectedGuideId}
      onDragHandle={handleDragHandle}
    />
  ) : null

  // Per-Guide popup anchor — over a line's midpoint / a circle's north point.
  const selectedGuide = selectedGuideId ? guides.find(g => g.id === selectedGuideId) ?? null : null
  const guidePopupAnchor = selectedGuide
    ? selectedGuide.kind === 'circle'
      ? { x: selectedGuide.center.x, y: selectedGuide.center.y - selectedGuide.radius }
      : vecMidpoint(selectedGuide.start, selectedGuide.end)
    : null
  const guidePopupScreenPos = selectedGuide && guidePopupAnchor && constructActive
    ? worldToScreen(guidePopupAnchor, viewTransform, size.width, size.height)
    : null

  // ── Morph overlay (Step 20 slice 2, #38) ────────────────
  // Selected Boundary drives the transient bottom position slider. Local —
  // like `selectedGuideId`, not persisted, not synced with the sidebar's own
  // expand/collapse (the spec only ties canvas selection to the bottom
  // slider).
  const [selectedMorphBoundaryId, setSelectedMorphBoundaryId] = useState<string | null>(null)
  useEffect(() => {
    if (!showMorphOverlay) setSelectedMorphBoundaryId(null)
  }, [showMorphOverlay])
  // Drop a stale selection if the Boundary vanished (delete / undo / new patch).
  useEffect(() => {
    if (selectedMorphBoundaryId && !config.morph?.boundaries.some(b => b.id === selectedMorphBoundaryId)) {
      setSelectedMorphBoundaryId(null)
    }
  }, [config.morph, selectedMorphBoundaryId])

  const handleDragMorphOrigin = useCallback((screen: Vec2) => {
    onSetMorphOrigin?.(screenToWorld(screen, viewTransform, size.width, size.height))
  }, [viewTransform, size.width, size.height, onSetMorphOrigin])

  const handleDragMorphDirection = useCallback((screen: Vec2) => {
    if (!config.morph) return
    const w = screenToWorld(screen, viewTransform, size.width, size.height)
    const dx = w.x - config.morph.origin.x
    const dy = w.y - config.morph.origin.y
    const len = Math.hypot(dx, dy)
    if (len < 1e-6) return
    onSetMorphDirection?.({ x: dx / len, y: dy / len })
  }, [config.morph, viewTransform, size.width, size.height, onSetMorphDirection])

  const handleDragMorphBoundary = useCallback((id: string, screen: Vec2) => {
    if (!config.morph) return
    const w = screenToWorld(screen, viewTransform, size.width, size.height)
    let position = morphDistance(config.morph, w)
    if (config.morph.mode === 'radial') position = Math.max(0, position)
    onSetMorphBoundaryPosition?.(id, position)
  }, [config.morph, viewTransform, size.width, size.height, onSetMorphBoundaryPosition])

  const morphLayer = showMorphOverlay && config.morph ? (
    <EditorMorphLayer
      morph={config.morph}
      bounds={guideBounds}
      interactive
      zoom={viewTransform.zoom}
      selectedBoundaryId={selectedMorphBoundaryId}
      onSelectBoundary={setSelectedMorphBoundaryId}
      onDragOrigin={handleDragMorphOrigin}
      onDragDirection={handleDragMorphDirection}
      onDragBoundary={handleDragMorphBoundary}
    />
  ) : null

  // Composition Phase hides every Design-Phase overlay — the canvas is the
  // lattice preview only, and Strand controls in the side panel drive what
  // changes. Multi-Cell Design Phase keeps the picker live: edges are
  // computed in each Cell's local coords and parallel-transformed via the
  // Cell's transform for rendering, so clicks place Tiles inside their host
  // Cell via the action's hostCellId routing. Useful once the
  // lattice-edge slider has been dragged past the seeded edge — at the seed,
  // the Seed Tile fills the Boundary exactly so any placement would land
  // outside the Cell.
  const editorOverlay = editorActive && !editorStrandMode
    ? editorMode === 'complete' && onPickVertex
      ? (
        <EditorVertexLayer
          vertices={boundaryCycle}
          boundaryCorners={boundaryCorners}
          pocketVertices={pocketVertices}
          neighbourVertices={neighbourVertices}
          frameVertices={frameVertices}
          centreVertices={centreVertices}
          guideAnchorVertices={guideAnchorVertices}
          picks={picks ?? []}
          previewValid={previewValid}
          previewMessage={previewMessage}
          previewForceable={previewForceable}
          onForceCommitMulti={onForceCommitMulti}
          onPickVertex={onPickVertex}
        />
      )
      : editorMode === 'place' && onSelectEdge ? (
        <g>
          {/* Section layer renders FIRST so the edge layer (rendered next)
              wins z-order on hit-testing — tile-priority for clicks
              landing on a Tile edge coincident with a Boundary section.
              Sections are transparent at rest; only hovered/selected
              sections paint, so the always-on layer adds no visual
              clutter at the boundary. */}
          {sectionsActive && onSelectSection && (
            <EditorBoundaryInwardLayer
              sections={renderedSections}
              selected={selectedSection ?? null}
              onSelect={onSelectSection}
              hovered={hoveredSection}
              onHover={setHoveredSection}
            />
          )}
          <EditorEdgeLayer
            edges={renderedEdges}
            selected={selectedEdge ?? null}
            onSelect={onSelectEdge}
            hovered={hoveredEdge}
            onHover={setHoveredEdge}
          />
          {/* Vertex preview — translucent polygon rendered BEFORE the vertex
              layer so the diamond dots sit on top. Pointer-events off so
              the preview never intercepts clicks. */}
          {vertexPreviewPoints && (
            <polygon
              points={vertexPreviewPoints}
              fill="var(--accent)"
              fillOpacity={0.18}
              stroke="var(--accent)"
              strokeOpacity={0.7}
              strokeWidth={1.6}
              strokeDasharray="4 3"
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
          )}
          {/* Vertex layer renders LAST so dots sit above edges + sections —
              vertex clicks win when overlapping an edge midpoint or a
              boundary section endpoint. */}
          {vertexPlacementActive && (
            <EditorVertexPlacementLayer
              vertices={renderedVertices}
              selectedKey={selectedVertex ? vertexUid(selectedVertex) : null}
              onSelect={handleSelectVertexPlacement}
              hoveredKey={hoveredVertexKey}
              onHover={setHoveredVertexKey}
            />
          )}
        </g>
      ) : null
    : null

  // Step 19.3 — Decoration Paint-mode overlay. In the Decoration phase the
  // normal editor overlay is null (it's gated to !editorStrandMode), so the
  // Paint layer reuses PatternSVG's topmost overlay slot. Hit-tests the
  // extracted Voids for hover-highlight + click-to-Fill.
  const decorationOverlay = decorationActive && paintTarget !== 'off' && onPaintVoid && onPaintStrand
    ? (
      <DecorationPaintLayer
        target={paintTarget}
        voids={decorationVoids ?? []}
        strandHits={decorationStrandHits ?? []}
        voidScope={paintVoidScope}
        strandScope={paintStrandScope}
        activeColor={paintColor}
        zoom={viewTransform.zoom}
        onPaintVoid={onPaintVoid}
        onPaintStrand={onPaintStrand}
        onSelectStampVoid={onSelectStampVoid}
        selectedStampSignature={selectedStampSignature}
      />
    )
    : null

  // Picker position uses the rendered (Patch-local) midpoint so the popup
  // tracks the visible edge. Validation uses the raw (Cell-local) edge so
  // viability runs in the host Cell's coord system.
  const selectedHostCell = selectedEdgeData && config.editor
    ? config.editor.cells.find(c => c.id === selectedEdgeData.hostCellId)
      ?? config.editor.cells.find(c => c.id === config.editor!.activeCellId)
      ?? config.editor.cells[0]
    : null
  const pickerWorldPos = selectedEdgeData
    ? (selectedHostCell ? applyCellTransform(selectedEdgeData.midpoint, selectedHostCell, patchRot) : selectedEdgeData.midpoint)
    : null
  const pickerScreenPos = pickerWorldPos && editorMode === 'place' && !editorStrandMode
    ? worldToScreen(pickerWorldPos, viewTransform, size.width, size.height)
    : null
  const pickerViable = selectedEdgeData && selectedHostCell && config.editor
    ? viableSidesForEdge(selectedEdgeData, selectedHostCell, config.editor.edgeLength)
    : []
  // Flexible placement: every other size is placeable through the overlap
  // warning — an edge placement (and its symmetry orbit) always constructs, so
  // "forceable" is simply the complement of the clean set.
  const pickerForceable = selectedEdgeData && selectedHostCell && config.editor
    ? PICKER_SIDES.filter(n => !pickerViable.includes(n))
    : []

  // Step 17.12c — boundary-section picker. Mirrors the edge picker: world →
  // screen via `worldToScreen`, viable sides via `viableSidesForBoundarySection`.
  const sectionPickerWorldPos = selectedSectionData && selectedSectionCell
    ? applyCellTransform(selectedSectionData.midpoint, selectedSectionCell, patchRot)
    : null
  const sectionPickerScreenPos = sectionPickerWorldPos && sectionsActive
    ? worldToScreen(sectionPickerWorldPos, viewTransform, size.width, size.height)
    : null
  const sectionPickerViable = selectedSectionData && selectedSectionCell && config.editor
    ? viableSidesForBoundarySection(
        selectedSectionData,
        selectedSectionCell,
        cellPlacementEdgeLength(selectedSectionCell, config.editor.edgeLength, config.editor.cells),
      )
    : []
  // Boundary-section placement always constructs, so forceable = complement.
  const sectionPickerForceable = selectedSectionData && selectedSectionCell && config.editor
    ? PICKER_SIDES.filter(n => !sectionPickerViable.includes(n))
    : []

  // Step 17.13c — vertex picker. World pos = anchor vertex transformed into
  // Patch-local coords via the vertex's host Cell transform.
  const vertexPickerWorldPos = selectedVertexData && effectiveVertexCell
    ? (selectedIsGuideAnchor
        ? selectedVertexData.p
        : applyCellTransform(selectedVertexData.p, effectiveVertexCell, patchRot))
    : null
  const vertexPickerScreenPos = vertexPickerWorldPos && vertexPlacementActive
    ? worldToScreen(vertexPickerWorldPos, viewTransform, size.width, size.height)
    : null

  return (
    <div ref={containerRef} className="canvas-container">
      <PatternSVG
        ref={svgRef}
        polygons={polygons}
        segments={segments}
        config={config}
        viewTransform={viewTransform}
        containerWidth={size.width}
        containerHeight={size.height}
        showTileLayer={showTileLayer}
        showLines={showLines}
        handlers={svgHandlers}
        cpVisible={cpVisible}
        cpActive={cpActive}
        outlineWidth={outlineWidth}
        boundaryOutlines={boundaryOutlines}
        ghostPolygons={ghostPolygons}
        seedOutlineCount={seedOutlineCount}
        ghostPolygonIds={ghostPolygonIds}
        compositionStamps={compositionStamps}
        editorOverlay={
          decorationActive
            ? (decorationOverlay || morphLayer) ? <g>{decorationOverlay}{morphLayer}</g> : null
            // Guide layer first — passive scaffolding renders UNDER the
            // interactive Place/Complete layers; in Construct mode
            // editorOverlay is null and the Guide layer takes the events.
            // Morph is Composition-only here (Decoration is handled above).
            : (guideLayer || editorOverlay || morphLayer)
              ? <g>{guideLayer}{editorOverlay}{morphLayer}</g>
              : null
        }
        clipEditorOverlayToFrame={decorationActive}
        frameOutline={frameOutline}
        clipToFrame={config.tiling.type !== 'editor' || editorStrandMode}
        // Frame nodes are Design-phase Complete pick targets; in Decoration
        // they're visual noise over the finished artwork.
        frameNodes={decorationActive ? null : frameNodes}
        frameStroke={frameStroke}
        voidFills={voidFills}
        instanceVoidFills={instanceVoidFills}
        voidStamps={voidStamps}
        strandRecords={decorationActive ? config.editor?.decoration?.strandColours : undefined}
        orbitStamps={decorationOrbitStamps}
        cellFrames={decorationCellFrames}
        strandIdentitySource={strandIdentitySource}
      />
      {pickerScreenPos && onPlaceTile && onSelectEdge && selectedEdgeData && (
        <EditorPickerOverlay
          position={pickerScreenPos}
          viableSides={pickerViable}
          forceableSides={pickerForceable}
          onPick={n => {
            const anchor = pickerScreenPos
            onSelectEdge(null)
            if (pickerViable.includes(n)) { onPlaceTile(n, false); return }
            setOverlapConfirm({
              sides: n,
              symmetry: (selectedHostCell?.symmetryMode ?? 'none') !== 'none',
              pos: anchor ?? { x: 0, y: 0 },
              commit: () => onPlaceTile(n, true),
            })
          }}
          onClose={() => onSelectEdge(null)}
          onDeleteOwningTile={
            onDeleteTile && isDeletableTile(config.editor, selectedEdgeData.tileId)
              ? () => { onDeleteTile(selectedEdgeData.tileId); onSelectEdge(null) }
              : undefined
          }
        />
      )}
      {sectionPickerScreenPos && onPlaceTileOnBoundarySection && onSelectSection && selectedSectionData && (
        <EditorPickerOverlay
          position={sectionPickerScreenPos}
          viableSides={sectionPickerViable}
          forceableSides={sectionPickerForceable}
          onPick={n => {
            const anchor = sectionPickerScreenPos
            onSelectSection(null)
            if (sectionPickerViable.includes(n)) { onPlaceTileOnBoundarySection(n, false); return }
            setOverlapConfirm({
              sides: n,
              symmetry: (selectedSectionCell?.symmetryMode ?? 'none') !== 'none',
              pos: anchor ?? { x: 0, y: 0 },
              commit: () => onPlaceTileOnBoundarySection(n, true),
            })
          }}
          onClose={() => onSelectSection(null)}
        />
      )}
      {vertexPickerScreenPos && selectedVertexData && onPlaceTileOnVertex && (
        <EditorPickerOverlay
          mode="vertex"
          position={vertexPickerScreenPos}
          viableSides={vertexPickerViableSides}
          forceableSides={vertexPickerForceableSides}
          pickedSides={vertexPickedSides}
          orientations={vertexOrientations}
          orientationIndex={vertexOrientationIdx}
          onPickShape={n => {
            setVertexPickedSides(n)
            setVertexOrientationIdx(0)
          }}
          onBackToShapes={() => {
            setVertexPickedSides(null)
            setVertexOrientationIdx(0)
          }}
          onCycleOrientation={dir => {
            if (vertexOrientations.length < 2) return
            setVertexOrientationIdx(prev => {
              const total = vertexOrientations.length
              return (prev + dir + total) % total
            })
          }}
          onCommit={() => {
            const orientation = vertexOrientations[vertexOrientationIdx]
            if (!orientation || vertexPickedSides === null) return
            const sides = vertexPickedSides
            const anchor = vertexPickerScreenPos
            // Guide Anchor → world-space Anchor placement; else the ordinary
            // Cell-vertex placement. Both share the picker + overlap gate.
            const place = selectedIsGuideAnchor
              ? (force: boolean) => onPlaceTileOnAnchor?.({
                  anchor: selectedVertexData.p,
                  sides,
                  rotation: orientation.rotation,
                  force,
                })
              : (force: boolean) => onPlaceTileOnVertex({
                  vertexKey: selectedVertexData.key,
                  sides,
                  rotation: orientation.rotation,
                  force,
                  hostCellId: selectedVertexData.hostCellId,
                })
            closeVertexPicker()
            if (!orientation.overlaps) { place(false); return }
            // Stamping Anchors orbit under the ACTIVE Cell's symmetry in the
            // reducer (world probe Cell is always 'none'); non-stamping
            // Anchors place as world-space singles.
            const anchorSymmetry = !!selectedVertexData.guideAnchor?.stamp
              && config.editor != null
              && ((config.editor.cells.find(c => c.id === config.editor!.activeCellId) ?? config.editor.cells[0]).symmetryMode ?? 'none') !== 'none'
            setOverlapConfirm({
              sides,
              symmetry: selectedIsGuideAnchor
                ? anchorSymmetry
                : (effectiveVertexCell?.symmetryMode ?? 'none') !== 'none',
              pos: anchor ?? { x: 0, y: 0 },
              commit: () => place(true),
            })
          }}
          onClose={closeVertexPicker}
        />
      )}
      {guidePopupScreenPos && selectedGuide && onUpdateGuide && onDeleteGuide && (
        <GuidePopupOverlay
          // Keyed by Guide id so the Cancel snapshot resets per selection.
          key={selectedGuide.id}
          guide={selectedGuide}
          position={guidePopupScreenPos}
          defaultTickSpacing={config.editor?.edgeLength ?? 100}
          onUpdate={patch => onUpdateGuide(selectedGuide.id, patch)}
          onDelete={() => { onDeleteGuide(selectedGuide.id); setSelectedGuideId(null) }}
          onClose={() => {
            // Swallow the click that closed the popup so it doesn't double as
            // a draw point (close fires on pointerdown, the click on pointerup).
            swallowClickUntil.current = performance.now() + 400
            setSelectedGuideId(null)
          }}
        />
      )}
      {overlapConfirm && (
        <OverlapConfirmModal
          position={overlapConfirm.pos}
          sides={overlapConfirm.sides}
          symmetry={overlapConfirm.symmetry}
          onConfirm={() => { overlapConfirm.commit(); setOverlapConfirm(null) }}
          onCancel={() => setOverlapConfirm(null)}
        />
      )}
      <button
        onClick={resetCamera}
        title="Reset camera (Home / Ctrl+0)"
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          padding: '6px 10px',
          fontSize: 13,
          background: 'rgba(30,30,30,0.75)',
          color: '#eee',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 6,
          cursor: 'pointer',
          backdropFilter: 'blur(4px)',
          zIndex: 10,
        }}
      >
        Reset View
      </button>
      <ZoomControl zoom={viewTransform.zoom} onZoom={zoomBy} onReset={resetZoom} />
      <RotationDial rotation={viewTransform.rotation} onChange={onRotation} />
      <PerfHud />
    </div>
  )
}

/** True iff the Tile is not the Seed Tile (Decision 6 — Seed can't be deleted). */
function isDeletableTile(editor: PatternConfig['editor'], tileId: string): boolean {
  if (!editor) return false
  for (const cell of editor.cells) {
    const t = cell.tiles.find(t => t.id === tileId)
    if (t) return t.source !== 'seed'
  }
  return false
}

