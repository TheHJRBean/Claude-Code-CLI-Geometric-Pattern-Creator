import { useRef, useEffect, useCallback, useState, useDeferredValue, useMemo } from 'react'
import type { PatternConfig } from '../types/pattern'
import type { Segment } from '../types/geometry'
import type { Vec2 } from '../utils/math'
import { usePattern } from '../hooks/usePattern'
import { usePanZoom, type ViewTransform } from '../hooks/usePanZoom'
import { PatternSVG } from '../rendering/PatternSVG'
import { RotationDial } from './RotationDial'
import type { ExposedEdge } from '../editor/exposedEdges'
import { computeExposedEdges } from '../editor/exposedEdges'
import { computeAllCycles, computeBoundaryCycle, computeOuterBoundary, type BoundaryVertex } from '../editor/boundary'
import { EDITOR_EPS } from '../editor/exposedEdges'
import { applyStamp, editorOneRingNeighbourStamps } from '../editor/lattice'
import { compositionOneRingStamps } from '../editor/compositionLattice'
import { viableSidesForEdge } from '../editor/orbit'
import { EditorEdgeLayer } from './EditorEdgeLayer'
import { EditorPickerOverlay } from './EditorPickerOverlay'
import { EditorVertexLayer } from './EditorVertexLayer'
import { EditorBoundaryInwardLayer, type SectionKey } from './EditorBoundaryInwardLayer'
import { EditorVertexPlacementLayer } from './EditorVertexPlacementLayer'
import { computeBoundarySections, viableSidesForBoundarySection } from '../editor/boundaryInward'
import {
  computeExposedVertices,
  placeRegularNGonOnVertex,
  vertexPlacementOrientations,
  viableSidesForVertex,
  type ExposedVertex,
  type VertexKey,
} from '../editor/vertexPlacement'
import { PICKER_SIDES } from '../editor/placement'
import { regularPolygonVertices } from '../editor/regularPolygon'

/**
 * Each **Cell** in a Patch lives in Patch-local coords via its own `center` +
 * `rotation`. Picker overlays (edges, vertices) are computed per-Cell in
 * Cell-local coords; we transform them via the Cell's transform to render in
 * Patch-local coords.
 *
 * Returns the Cell's transform. For a single-cell Patch with the lone Cell
 * at the Patch origin this is the identity.
 */
function cellTransform(cell: { center: Vec2; rotation: number }): { translation: Vec2; rotation: number } {
  return { translation: cell.center, rotation: cell.rotation }
}

function applyTransform(p: Vec2, tx: { translation: Vec2; rotation: number }): Vec2 {
  if (tx.rotation === 0) {
    return { x: p.x + tx.translation.x, y: p.y + tx.translation.y }
  }
  const c = Math.cos(tx.rotation), s = Math.sin(tx.rotation)
  return {
    x: p.x * c - p.y * s + tx.translation.x,
    y: p.x * s + p.y * c + tx.translation.y,
  }
}

function transformEdge(e: ExposedEdge, tx: { translation: Vec2; rotation: number }): ExposedEdge {
  return {
    ...e,
    p1: applyTransform(e.p1, tx),
    p2: applyTransform(e.p2, tx),
    midpoint: applyTransform(e.midpoint, tx),
    sourceCenter: applyTransform(e.sourceCenter, tx),
  }
}

function transformBoundaryVertex(v: BoundaryVertex, tx: { translation: Vec2; rotation: number }): BoundaryVertex {
  return { ...v, p: applyTransform(v.p, tx) }
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
  onPlaceTile?: (sides: number) => void
  onDeleteTile?: (tileId: string) => void
  /** Step 17.12 — boundary-inward placement. Always available in Design
   *  Phase + Place mode (single-cell Patches only — locked decision b). */
  selectedSection?: SectionKey | null
  onSelectSection?: (section: SectionKey | null) => void
  onPlaceTileOnBoundarySection?: (sides: number) => void
  /** Step 17.13c — vertex-anchored placement. Always available in Design
   *  Phase + Place mode (single-cell only). The picker is two-page: shape
   *  grid → orientation arrows + live preview. */
  onPlaceTileOnVertex?: (payload: { vertexKey: VertexKey; sides: number; rotation: number }) => void
  /** Step 17.5 — Complete mode: 'place' shows the edge picker, 'complete' shows the vertex picker. */
  editorMode?: 'place' | 'complete'
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
}

const INITIAL_ZOOM = 1

export function Canvas({ config, showTileLayer, showLines, svgRef, segmentsRef, cpVisible, cpActive, outlineWidth, selectedEdge, onSelectEdge, onPlaceTile, onDeleteTile, selectedSection, onSelectSection, onPlaceTileOnBoundarySection, onPlaceTileOnVertex, editorMode = 'place', picks, onPickVertex, previewValid = null, previewMessage = null, previewForceable = false, onForceCommitMulti, editorStrandMode = false, showBoundaryLattice = false, editorNeighbourPreview = false, editorNeighbourBoundaries = false, editorNeighbourStrands = false }: Props) {
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
  // Defer the heavy tiling computation so pointer events stay responsive
  const deferredVT = useDeferredValue(viewTransform)
  const { polygons, segments, boundaryOutlines, ghostPolygons } = usePattern(
    config,
    deferredVT,
    size.width,
    size.height,
    editorStrandMode,
    showBoundaryLattice,
    editorNeighbourPreview,
    editorNeighbourBoundaries,
    editorNeighbourStrands,
  )

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

  // Keep segments ref up to date for export
  segmentsRef.current = segments

  // ── Builder overlay (Step 17.3) ──────────────────────
  const editorActive = config.tiling.type === 'editor' && config.editor != null
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
    const txByHost = new Map<string, { translation: Vec2; rotation: number }>()
    for (const cell of config.editor.cells) {
      txByHost.set(cell.id, cellTransform(cell))
    }
    return exposedEdges.map(e => {
      const tx = e.hostCellId ? txByHost.get(e.hostCellId) : undefined
      return tx ? transformEdge(e, tx) : e
    })
  }, [exposedEdges, editorActive, config.editor])
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
        const tx = cellTransform(cell)
        const cycles = computeAllCycles(cell)
        for (const v of cycles.outer) {
          outer.push({ ...transformBoundaryVertex(v, tx), tileId: `${cell.id}/${v.tileId}` })
        }
        for (const cycle of cycles.pockets) {
          pockets.push(cycle.map(v => ({
            ...transformBoundaryVertex(v, tx),
            tileId: `${cell.id}/${v.tileId}`,
          })))
        }
      }
      return { outer, pockets }
    },
    [editorActive, config.editor, editorMode],
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
      const tx = cellTransform(cell)
      const raw = computeBoundaryCycle(cell)
      for (const v of raw) {
        collected.push({ ...transformBoundaryVertex(v, tx), tileId: `${cell.id}/${v.tileId}` })
      }
    }
    return collected.filter(c => !boundaryCycle.some(v =>
      Math.abs(v.p.x - c.p.x) < EDITOR_EPS && Math.abs(v.p.y - c.p.y) < EDITOR_EPS,
    ))
  }, [editorActive, config.editor, editorMode, boundaryCycle])
  // Step 17.11.1 — neighbour-stamp outer-cycle vertices, exposed only when
  // "Show neighbours" is on so cross-boundary picks line up with the visible
  // ghost geometry. Flatten to a single array since variant styling already
  // tags them as ghosts.
  // Multi-cell: each lattice-cell-level neighbour stamp brings every Cell's
  // outer cycle along (1 octagon + 1 square per stamp for 4.8.8). We compute
  // each Cell's outer cycle in Cell-local, lift to Patch-local via the
  // Cell transform, then translate by the neighbour stamp.
  const neighbourVertices = useMemo(() => {
    if (!editorActive || !config.editor || editorMode !== 'complete') return []
    if (!editorNeighbourPreview || editorStrandMode) return []
    const patch = config.editor
    const multi = patch.cells.length > 1
    const active = patch.cells.find(c => c.id === patch.activeCellId) ?? patch.cells[0]
    // Multi-cell stamps tile the unit cell as a whole (always 8 neighbours);
    // single-cell stamps come from the active Cell's shape-aware one-ring.
    const ringStamps = multi
      ? compositionOneRingStamps(patch)
      : editorOneRingNeighbourStamps(active)
    const out: BoundaryVertex[] = []
    for (let s = 0; s < ringStamps.length; s++) {
      const stamp = ringStamps[s]
      for (const cell of patch.cells) {
        const tx = cellTransform(cell)
        const cycle = computeOuterBoundary(cell)
        for (let i = 0; i < cycle.length; i++) {
          const v = cycle[i]
          const patchLocal = applyTransform(v.p, tx)
          out.push({
            p: applyStamp(patchLocal, stamp),
            tileId: `neighbour-${s}/${cell.id}`,
            vertexIndex: i,
          })
        }
      }
    }
    return out
  }, [editorActive, config.editor, editorMode, editorNeighbourPreview, editorStrandMode])

  // Step 17.12 — Boundary-section highlights, always rendered in single-
  // cell Design Phase Place mode (no enabling toggle — boundary-section
  // placement is a standard part of design functionality). Sections are
  // computed in Cell-local coords (the Boundary is always centred at
  // (0, 0) per `editorBoundaryVertices`) then lifted into Patch-local via
  // the active Cell's transform. Multi-cell composition support is parked
  // per locked decision b; the reducer also refuses if `cells.length > 1`.
  const activeCellForSections = editorActive && config.editor
    ? config.editor.cells.find(c => c.id === config.editor!.activeCellId) ?? null
    : null
  const sectionsActive = !!(
    editorActive && config.editor
    && config.editor.cells.length === 1
    && activeCellForSections
    && editorMode === 'place'
    && !editorStrandMode
  )
  const cellLocalSections = useMemo(() => {
    if (!sectionsActive || !activeCellForSections) return []
    return computeBoundarySections(activeCellForSections)
  }, [sectionsActive, activeCellForSections])
  const renderedSections = useMemo(() => {
    if (!sectionsActive || !activeCellForSections) return cellLocalSections
    const tx = cellTransform(activeCellForSections)
    return cellLocalSections.map(s => ({
      ...s,
      p1: applyTransform(s.p1, tx),
      p2: applyTransform(s.p2, tx),
      midpoint: applyTransform(s.midpoint, tx),
    }))
  }, [sectionsActive, activeCellForSections, cellLocalSections])
  const [hoveredSection, setHoveredSection] = useState<SectionKey | null>(null)
  useEffect(() => { if (!sectionsActive) setHoveredSection(null) }, [sectionsActive])
  const selectedSectionData = selectedSection && cellLocalSections.find(
    s => s.edgeIndex === selectedSection.edgeIndex && s.sectionIndex === selectedSection.sectionIndex,
  )

  // ── Vertex placement (Step 17.13c) ───────────────────
  // Single-cell only in v1 — multi-Cell composition support deferred (mirrors
  // 17.12 boundary-inward). Active in Design Phase + Place mode. State machine:
  //   selectedVertex !== null && pickedSides === null → page 1 (shape grid)
  //   selectedVertex !== null && pickedSides !== null → page 2 (orientations)
  const vertexPlacementActive = !!(
    editorActive && config.editor
    && config.editor.cells.length === 1
    && activeCellForSections
    && editorMode === 'place'
    && !editorStrandMode
    && onPlaceTileOnVertex
  )
  const cellLocalVertices = useMemo<ExposedVertex[]>(() => {
    if (!vertexPlacementActive || !activeCellForSections) return []
    return computeExposedVertices(activeCellForSections)
  }, [vertexPlacementActive, activeCellForSections])
  const renderedVertices = useMemo<ExposedVertex[]>(() => {
    if (!vertexPlacementActive || !activeCellForSections) return cellLocalVertices
    const tx = cellTransform(activeCellForSections)
    return cellLocalVertices.map(v => ({ ...v, p: applyTransform(v.p, tx) }))
  }, [vertexPlacementActive, activeCellForSections, cellLocalVertices])
  const [selectedVertexKey, setSelectedVertexKey] = useState<VertexKey | null>(null)
  const [hoveredVertexKey, setHoveredVertexKey] = useState<VertexKey | null>(null)
  const [vertexPickedSides, setVertexPickedSides] = useState<number | null>(null)
  const [vertexOrientationIdx, setVertexOrientationIdx] = useState(0)
  useEffect(() => {
    if (!vertexPlacementActive) {
      setSelectedVertexKey(null)
      setHoveredVertexKey(null)
      setVertexPickedSides(null)
      setVertexOrientationIdx(0)
    }
  }, [vertexPlacementActive])
  // Drop the picker when the underlying vertex disappears (e.g. another
  // placement covered it). Stops a stale picker from dispatching against a
  // vertex key that's been resolved away.
  useEffect(() => {
    if (selectedVertexKey && !cellLocalVertices.some(v => v.key === selectedVertexKey)) {
      setSelectedVertexKey(null)
      setVertexPickedSides(null)
      setVertexOrientationIdx(0)
    }
  }, [cellLocalVertices, selectedVertexKey])
  const selectedVertexData = selectedVertexKey
    ? cellLocalVertices.find(v => v.key === selectedVertexKey) ?? null
    : null
  const vertexPickerViableSides = useMemo<number[]>(() => {
    if (!selectedVertexData || !activeCellForSections || !config.editor) return []
    return viableSidesForVertex(
      selectedVertexData,
      config.editor.edgeLength,
      activeCellForSections,
      PICKER_SIDES,
    )
  }, [selectedVertexData, activeCellForSections, config.editor])
  const vertexOrientations = useMemo(() => {
    if (!selectedVertexData || vertexPickedSides === null || !activeCellForSections || !config.editor) {
      return []
    }
    return vertexPlacementOrientations(
      selectedVertexData,
      vertexPickedSides,
      config.editor.edgeLength,
      activeCellForSections,
    )
  }, [selectedVertexData, vertexPickedSides, activeCellForSections, config.editor])
  useEffect(() => {
    // Clamp orientation index if the available orientations shrank.
    if (vertexOrientationIdx >= vertexOrientations.length && vertexOrientations.length > 0) {
      setVertexOrientationIdx(0)
    }
  }, [vertexOrientations, vertexOrientationIdx])

  // Live preview of the candidate Tile, rendered as a translucent polygon in
  // the editor overlay. Built in Cell-local coords then transformed into
  // Patch-local for rendering — keeps centring + rotation consistent with the
  // active Cell's transform.
  const vertexPreviewPoints = useMemo<string | null>(() => {
    if (!selectedVertexData || vertexPickedSides === null || !activeCellForSections || !config.editor) {
      return null
    }
    const orientation = vertexOrientations[vertexOrientationIdx]
    if (!orientation) return null
    const tile = placeRegularNGonOnVertex(
      vertexPickedSides,
      config.editor.edgeLength,
      selectedVertexData,
      orientation.rotation,
      '__preview__',
    )
    const verts = regularPolygonVertices(tile.sides, tile.center, tile.edgeLength, tile.rotation)
    const tx = cellTransform(activeCellForSections)
    return verts.map(v => {
      const w = applyTransform(v, tx)
      return `${w.x},${w.y}`
    }).join(' ')
  }, [selectedVertexData, vertexPickedSides, vertexOrientations, vertexOrientationIdx, activeCellForSections, config.editor])

  // Closing the picker without committing — also clears the page-2 state.
  const closeVertexPicker = () => {
    setSelectedVertexKey(null)
    setVertexPickedSides(null)
    setVertexOrientationIdx(0)
  }

  // Composition Phase hides every Design-Phase overlay — the canvas is the
  // lattice preview only, and Strand controls in the side panel drive what
  // changes. Multi-Cell Design Phase keeps the picker live: edges are
  // computed in each Cell's local coords and parallel-transformed via the
  // Cell's transform for rendering, so clicks place Tiles inside the active
  // Cell via the reducer's updateActiveCell routing. Useful once the
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
          picks={picks ?? []}
          previewValid={previewValid}
          previewMessage={previewMessage}
          previewForceable={previewForceable}
          onForceCommitMulti={onForceCommitMulti}
          onPickVertex={onPickVertex}
        />
      )
      : onSelectEdge ? (
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
              selectedKey={selectedVertexKey}
              onSelect={(v) => {
                // Clear sibling pickers so only one overlay is open.
                if (v) {
                  onSelectEdge?.(null)
                  onSelectSection?.(null)
                  setSelectedVertexKey(v.key)
                  setVertexPickedSides(null)
                  setVertexOrientationIdx(0)
                } else {
                  closeVertexPicker()
                }
              }}
              hoveredKey={hoveredVertexKey}
              onHover={setHoveredVertexKey}
            />
          )}
        </g>
      ) : null
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
    ? (selectedHostCell ? applyTransform(selectedEdgeData.midpoint, cellTransform(selectedHostCell)) : selectedEdgeData.midpoint)
    : null
  const pickerScreenPos = pickerWorldPos && editorMode === 'place' && !editorStrandMode
    ? worldToScreen(pickerWorldPos, viewTransform, size.width, size.height)
    : null
  const pickerViable = selectedEdgeData && selectedHostCell && config.editor
    ? viableSidesForEdge(selectedEdgeData, selectedHostCell, config.editor.edgeLength)
    : []

  // Step 17.12c — boundary-section picker. Mirrors the edge picker: world →
  // screen via `worldToScreen`, viable sides via `viableSidesForBoundarySection`.
  const sectionPickerWorldPos = selectedSectionData && activeCellForSections
    ? applyTransform(selectedSectionData.midpoint, cellTransform(activeCellForSections))
    : null
  const sectionPickerScreenPos = sectionPickerWorldPos && sectionsActive
    ? worldToScreen(sectionPickerWorldPos, viewTransform, size.width, size.height)
    : null
  const sectionPickerViable = selectedSectionData && activeCellForSections
    ? viableSidesForBoundarySection(selectedSectionData, activeCellForSections)
    : []

  // Step 17.13c — vertex picker. World pos = anchor vertex transformed into
  // Patch-local coords. Vertex placement is single-cell only in v1.
  const vertexPickerWorldPos = selectedVertexData && activeCellForSections
    ? applyTransform(selectedVertexData.p, cellTransform(activeCellForSections))
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
        handlers={handlers}
        cpVisible={cpVisible}
        cpActive={cpActive}
        outlineWidth={outlineWidth}
        boundaryOutlines={boundaryOutlines}
        ghostPolygons={ghostPolygons}
        editorOverlay={editorOverlay}
      />
      {pickerScreenPos && onPlaceTile && onSelectEdge && selectedEdgeData && (
        <EditorPickerOverlay
          position={pickerScreenPos}
          viableSides={pickerViable}
          onPick={n => { onPlaceTile(n); onSelectEdge(null) }}
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
          onPick={n => { onPlaceTileOnBoundarySection(n); onSelectSection(null) }}
          onClose={() => onSelectSection(null)}
        />
      )}
      {vertexPickerScreenPos && selectedVertexData && onPlaceTileOnVertex && (
        <EditorPickerOverlay
          mode="vertex"
          position={vertexPickerScreenPos}
          viableSides={vertexPickerViableSides}
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
            onPlaceTileOnVertex({
              vertexKey: selectedVertexData.key,
              sides: vertexPickedSides,
              rotation: orientation.rotation,
            })
            closeVertexPicker()
          }}
          onClose={closeVertexPicker}
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
      <RotationDial rotation={viewTransform.rotation} onChange={onRotation} />
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

/**
 * Map a world-space point to screen-space pixels relative to the canvas
 * container, accounting for pan, zoom, and the rotation `<g>` applied
 * around the viewBox centre.
 */
function worldToScreen(
  world: Vec2,
  vt: ViewTransform,
  width: number,
  height: number,
): { x: number; y: number } {
  const vw = width / vt.zoom
  const vh = height / vt.zoom
  const cx = vt.x + vw / 2
  const cy = vt.y + vh / 2
  const rad = (vt.rotation * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const dx = world.x - cx
  const dy = world.y - cy
  const vbx = cx + dx * cos - dy * sin
  const vby = cy + dx * sin + dy * cos
  return {
    x: (vbx - vt.x) * vt.zoom,
    y: (vby - vt.y) * vt.zoom,
  }
}
