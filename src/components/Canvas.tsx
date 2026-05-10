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
import { neighbourCycleVertices } from '../editor/lattice'
import { viableSidesForEdge } from '../editor/orbit'
import { activePatch } from '../editor/active'
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
  const exposedEdges = useMemo(
    () => editorActive && config.editor ? computeExposedEdges(activePatch(config.editor)) : [],
    [editorActive, config.editor],
  )
  const renderedEdges = useMemo(
    () => tileTx ? exposedEdges.map(e => transformEdge(e, tileTx)) : exposedEdges,
    [exposedEdges, tileTx],
  )
  const [hoveredEdge, setHoveredEdge] = useState<SelectedEdge | null>(null)
  useEffect(() => { if (!editorActive) setHoveredEdge(null) }, [editorActive])

  const selectedEdgeData = selectedEdge && exposedEdges.find(
    e => e.tileId === selectedEdge.tileId && e.edgeIndex === selectedEdge.edgeIndex,
  )

  // Step 17.5 / 17.11 — outer + pocket cycles for the vertex picker, only
  // computed when complete mode is active to keep the place-mode hot path
  // cheap. Pockets are 17.11.0's interior holes.
  const allCycles = useMemo(
    () => {
      if (!editorActive || !config.editor || editorMode !== 'complete') {
        return { outer: [] as BoundaryVertex[], pockets: [] as BoundaryVertex[][] }
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
  const boundaryCorners = useMemo(() => {
    if (!editorActive || !config.editor || editorMode !== 'complete') return []
    const patch = activePatch(config.editor)
    const raw = computeBoundaryCycle(patch)
    const transformed = tileTx ? raw.map(v => transformBoundaryVertex(v, tileTx)) : raw
    return transformed.filter(c => !boundaryCycle.some(v =>
      Math.abs(v.p.x - c.p.x) < EDITOR_EPS && Math.abs(v.p.y - c.p.y) < EDITOR_EPS,
    ))
  }, [editorActive, config.editor, editorMode, tileTx, boundaryCycle])
  // Step 17.11.1 — neighbour-stamp outer-cycle vertices, exposed only when
  // "Show neighbours" is on so cross-boundary picks line up with the visible
  // ghost geometry. Flatten to a single array since variant styling already
  // tags them as ghosts. Single-shape only in v1 (composition has no per-tile
  // neighbour-ring concept; the cell already shows the multi-tile context).
  const neighbourVertices = useMemo(() => {
    if (!editorActive || !config.editor || editorMode !== 'complete') return []
    if (!editorNeighbourPreview || editorStrandMode) return []
    if (config.editor.composition) return []
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
