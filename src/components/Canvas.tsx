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
  hostBoundaryTileId?: string
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
  /** Step 17.6 — when true, the editor patch is stamped on the boundary's translation lattice. Hides design overlays. */
  editorStrandMode?: boolean
  /** Step 17.6 — when true in strand mode, draw the patch boundary outline at every lattice stamp. */
  showBoundaryLattice?: boolean
  /** Step 17.6d — Design-mode neighbour preview. Ignored in strand mode. */
  editorNeighbourPreview?: boolean
  /** Step 17.6d — Design-mode neighbour preview: also draw boundary outlines at each neighbour stamp. */
  editorNeighbourBoundaries?: boolean
  /** Step 17.6d — Design-mode neighbour preview: include ghosts in PIC so strands flow across boundaries. */
  editorNeighbourStrands?: boolean
}

const INITIAL_ZOOM = 1

export function Canvas({ config, showTileLayer, showLines, svgRef, segmentsRef, cpVisible, cpActive, outlineWidth, selectedEdge, onSelectEdge, onPlaceTile, onDeleteTile, editorMode = 'place', picks, onPickVertex, previewValid = null, editorStrandMode = false, showBoundaryLattice = false, editorNeighbourPreview = false, editorNeighbourBoundaries = false, editorNeighbourStrands = false }: Props) {
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
        out.push({ ...e, hostBoundaryTileId: cell.id })
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
      const tx = e.hostBoundaryTileId ? txByHost.get(e.hostBoundaryTileId) : undefined
      return tx ? transformEdge(e, tx) : e
    })
  }, [exposedEdges, editorActive, config.editor])
  const [hoveredEdge, setHoveredEdge] = useState<SelectedEdge | null>(null)
  useEffect(() => { if (!editorActive) setHoveredEdge(null) }, [editorActive])

  const selectedEdgeData = selectedEdge && exposedEdges.find(
    e => e.tileId === selectedEdge.tileId
      && e.edgeIndex === selectedEdge.edgeIndex
      && (selectedEdge.hostBoundaryTileId ?? null) === (e.hostBoundaryTileId ?? null),
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
  // fill regions bounded by the boundary outline. Filtered to drop corners
  // that coincide with patch outer-cycle vertices (would render twice).
  // Composition: aggregate corners from every boundary tile, same as cycles.
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
  // Composition: each cell-level neighbour stamp brings every boundary tile's
  // outer cycle along (1 octagon + 1 square per stamp for 4.8.8). We compute
  // each tile's outer cycle in patch-local, lift to cell-local via the
  // BoundaryTile transform, then translate by the neighbour stamp.
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

  // Strand mode hides every design overlay — the canvas is the lattice
  // preview only, and strand controls in the side panel drive what changes.
  // Composition mode keeps the picker live: edges are computed in the active
  // boundary tile's patch-local coords and parallel-transformed via tileTx
  // for rendering, so clicks place sub-tiles inside the active tile via the
  // reducer's updatePatch routing. Useful once the cell-edge slider has been
  // dragged past the seeded edge — at the seed, origin = boundary so any
  // placement would land outside the cell.
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
          onPickVertex={onPickVertex}
        />
      )
      : onSelectEdge ? (
        <EditorEdgeLayer
          edges={renderedEdges}
          selected={selectedEdge ?? null}
          onSelect={onSelectEdge}
          hovered={hoveredEdge}
          onHover={setHoveredEdge}
        />
      ) : null
    : null

  // Picker position uses the rendered (Patch-local) midpoint so the popup
  // tracks the visible edge. Validation uses the raw (Cell-local) edge so
  // viability runs in the host Cell's coord system.
  const selectedHostCell = selectedEdgeData && config.editor
    ? config.editor.cells.find(c => c.id === selectedEdgeData.hostBoundaryTileId)
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
