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
import { computeAllCycles, computeBoundaryCycle, type BoundaryVertex } from '../editor/boundary'
import { EDITOR_EPS } from '../editor/exposedEdges'
import { neighbourCycleVertices, applyStamp } from '../editor/lattice'
import { compositionOneRingStamps } from '../editor/compositionLattice'
import { viableSidesForEdge } from '../editor/orbit'
import { activePatch } from '../editor/active'
import { computeOuterBoundary } from '../editor/boundary'
import { EditorEdgeLayer } from './EditorEdgeLayer'
import { EditorPickerOverlay } from './EditorPickerOverlay'
import { EditorVertexLayer } from './EditorVertexLayer'

/**
 * When a multi-tile composition is active (e.g. 4.8.8), the active boundary
 * tile's authored patch lives in patch-local coords (origin at the tile's
 * centre). The cell renders these patches at cell-local coords via
 * `compositionToPolygons`. Picker overlays (edges, vertices) are computed in
 * patch-local coords and need to be transformed to cell-local for rendering.
 *
 * This helper returns the active tile's transform — `null` when there's no
 * active composition (single-shape patches need no transform).
 */
function activeTileTransform(config: PatternConfig): { translation: Vec2; rotation: number } | null {
  const composition = config.editor?.composition
  if (!composition) return null
  const t = composition.tiles.find(t => t.id === composition.activeTileId)
  if (!t) return null
  return { translation: t.center, rotation: t.rotation }
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
   * Composition mode only — the BoundaryTile id this edge belongs to.
   * Used by the Lab to auto-switch the active boundary tile when the user
   * clicks an edge inside an inactive tile. Absent on single-shape patches.
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

  // ── Editor-mode overlay (Step 17.3) ──────────────────────
  const editorActive = config.tiling.type === 'editor' && config.editor != null
  // Composition-mode picker geometry: edges/vertices are computed in the
  // active boundary tile's patch-local coords; the canvas renders the cell at
  // cell-local coords. We keep the raw (patch-local) edges as the source of
  // truth for validation + dispatch, and transform a parallel list for
  // rendering / picker placement.
  const tileTx = useMemo(() => activeTileTransform(config), [config])
  // Composition: aggregate exposed edges from every boundary tile so the user
  // can place inside any tile (auto-switches active on click). Each edge is
  // tagged with its host BoundaryTile id; the patch-local edge stays the
  // source of truth for validation, while a parallel cell-local copy is
  // rendered. Single-shape: just the active patch's edges (no host id).
  const exposedEdges = useMemo(() => {
    if (!editorActive || !config.editor) return [] as ExposedEdge[]
    const composition = config.editor.composition
    if (!composition) return computeExposedEdges(activePatch(config.editor))
    const out: ExposedEdge[] = []
    for (const bt of composition.tiles) {
      for (const e of computeExposedEdges(bt.patch)) {
        out.push({ ...e, hostBoundaryTileId: bt.id })
      }
    }
    return out
  }, [editorActive, config.editor])
  const renderedEdges = useMemo(() => {
    if (!editorActive || !config.editor) return exposedEdges
    const composition = config.editor.composition
    if (!composition) return tileTx ? exposedEdges.map(e => transformEdge(e, tileTx)) : exposedEdges
    // Per-host transform: each edge transforms via its own BoundaryTile.
    const txByHost = new Map<string, { translation: Vec2; rotation: number }>()
    for (const bt of composition.tiles) {
      txByHost.set(bt.id, { translation: bt.center, rotation: bt.rotation })
    }
    return exposedEdges.map(e => {
      const tx = e.hostBoundaryTileId ? txByHost.get(e.hostBoundaryTileId) : undefined
      return tx ? transformEdge(e, tx) : e
    })
  }, [exposedEdges, tileTx, editorActive, config.editor])
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
      // Composition: expose every boundary tile's cycles so the user can
      // pick vertices from any tile in Complete mode. Each cycle is in its
      // own patch-local coords; we transform via that tile's centre +
      // rotation to bring them into shared cell-local coords for rendering.
      // Vertex tileIds are namespaced (e.g. `octagon/origin`) so React keys
      // stay unique across boundary tiles — the reducer routes completion
      // by position match, not tileId, so the rename is rendering-only.
      if (config.editor.composition) {
        const outer: BoundaryVertex[] = []
        const pockets: BoundaryVertex[][] = []
        for (const bt of config.editor.composition.tiles) {
          const tx = { translation: bt.center, rotation: bt.rotation }
          const cycles = computeAllCycles(bt.patch)
          for (const v of cycles.outer) {
            outer.push({ ...transformBoundaryVertex(v, tx), tileId: `${bt.id}/${v.tileId}` })
          }
          for (const cycle of cycles.pockets) {
            pockets.push(cycle.map(v => ({
              ...transformBoundaryVertex(v, tx),
              tileId: `${bt.id}/${v.tileId}`,
            })))
          }
        }
        return { outer, pockets }
      }
      const patch = activePatch(config.editor)
      const raw = computeAllCycles(patch)
      if (!tileTx) return raw
      return {
        outer: raw.outer.map(v => transformBoundaryVertex(v, tileTx)),
        pockets: raw.pockets.map(cycle => cycle.map(v => transformBoundaryVertex(v, tileTx))),
      }
    },
    [editorActive, config.editor, editorMode, tileTx],
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
    let collected: BoundaryVertex[]
    if (config.editor.composition) {
      collected = []
      for (const bt of config.editor.composition.tiles) {
        const tx = { translation: bt.center, rotation: bt.rotation }
        const raw = computeBoundaryCycle(bt.patch)
        for (const v of raw) {
          collected.push({ ...transformBoundaryVertex(v, tx), tileId: `${bt.id}/${v.tileId}` })
        }
      }
    } else {
      const patch = activePatch(config.editor)
      const raw = computeBoundaryCycle(patch)
      collected = tileTx ? raw.map(v => transformBoundaryVertex(v, tileTx)) : raw
    }
    return collected.filter(c => !boundaryCycle.some(v =>
      Math.abs(v.p.x - c.p.x) < EDITOR_EPS && Math.abs(v.p.y - c.p.y) < EDITOR_EPS,
    ))
  }, [editorActive, config.editor, editorMode, tileTx, boundaryCycle])
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
    const composition = config.editor.composition
    if (composition) {
      const stamps = compositionOneRingStamps(composition)
      const out: BoundaryVertex[] = []
      for (let s = 0; s < stamps.length; s++) {
        const stamp = stamps[s]
        for (const bt of composition.tiles) {
          const tx = { translation: bt.center, rotation: bt.rotation }
          const cycle = computeOuterBoundary(bt.patch)
          for (let i = 0; i < cycle.length; i++) {
            const v = cycle[i]
            const cellLocal = applyTransform(v.p, tx)
            out.push({
              p: applyStamp(cellLocal, stamp),
              tileId: `neighbour-${s}/${bt.id}`,
              vertexIndex: i,
            })
          }
        }
      }
      return out
    }
    return neighbourCycleVertices(config.editor, boundaryCycle).flat()
  }, [editorActive, config.editor, editorMode, editorNeighbourPreview, editorStrandMode, boundaryCycle])

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

  // Picker position uses the rendered (cell-local) midpoint so the popup
  // tracks the visible edge. Validation uses the raw (patch-local) edge so
  // viability runs in the active patch's coord system.
  const pickerWorldPos = selectedEdgeData
    ? (tileTx ? applyTransform(selectedEdgeData.midpoint, tileTx) : selectedEdgeData.midpoint)
    : null
  const pickerScreenPos = pickerWorldPos && editorMode === 'place' && !editorStrandMode
    ? worldToScreen(pickerWorldPos, viewTransform, size.width, size.height)
    : null
  const pickerViable = selectedEdgeData && config.editor
    ? viableSidesForEdge(selectedEdgeData, activePatch(config.editor))
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

/** True iff the tile is non-origin (Decision 6 — origin can't be deleted). */
function isDeletableTile(editor: PatternConfig['editor'], tileId: string): boolean {
  if (!editor) return false
  const t = editor.tiles.find(t => t.id === tileId)
  return !!t && t.origin !== 'origin'
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
