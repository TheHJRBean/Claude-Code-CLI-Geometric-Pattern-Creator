import { useRef, useEffect, useCallback, useState, useDeferredValue, useMemo } from 'react'
import type { PatternConfig } from '../types/pattern'
import type { Segment } from '../types/geometry'
import type { Vec2 } from '../utils/math'
import { usePattern } from '../hooks/usePattern'
import { usePanZoom, type ViewTransform } from '../hooks/usePanZoom'
import { PatternSVG } from '../rendering/PatternSVG'
import { RotationDial } from './RotationDial'
import { computeExposedEdges } from '../editor/exposedEdges'
import { computeBoundaryCycle, computeOuterBoundary } from '../editor/boundary'
import { EDITOR_EPS } from '../editor/exposedEdges'
import { viableSidesForEdge } from '../editor/orbit'
import { EditorEdgeLayer } from './EditorEdgeLayer'
import { EditorPickerOverlay } from './EditorPickerOverlay'
import { EditorVertexLayer } from './EditorVertexLayer'

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
  firstVertexPick?: Vec2 | null
  onPickVertex?: (p: Vec2) => void
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

export function Canvas({ config, showTileLayer, showLines, svgRef, segmentsRef, cpVisible, cpActive, outlineWidth, selectedEdge, onSelectEdge, onPlaceTile, onDeleteTile, editorMode = 'place', firstVertexPick, onPickVertex, editorStrandMode = false, showBoundaryLattice = false, editorNeighbourPreview = false, editorNeighbourBoundaries = false, editorNeighbourStrands = false }: Props) {
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
  const exposedEdges = useMemo(
    () => editorActive && config.editor ? computeExposedEdges(config.editor) : [],
    [editorActive, config.editor],
  )
  const [hoveredEdge, setHoveredEdge] = useState<SelectedEdge | null>(null)
  useEffect(() => { if (!editorActive) setHoveredEdge(null) }, [editorActive])

  const selectedEdgeData = selectedEdge && exposedEdges.find(
    e => e.tileId === selectedEdge.tileId && e.edgeIndex === selectedEdge.edgeIndex,
  )

  // Step 17.5 — outer boundary cycle for the vertex picker, only computed
  // when complete mode is active to keep the place-mode hot path cheap.
  const boundaryCycle = useMemo(
    () => editorActive && config.editor && editorMode === 'complete'
      ? computeOuterBoundary(config.editor)
      : [],
    [editorActive, config.editor, editorMode],
  )
  // Boundary-polygon corners — clickable in Complete mode so the user can
  // fill regions bounded by the boundary outline. Filtered to drop corners
  // that coincide with patch outer-cycle vertices (would render twice).
  const boundaryCorners = useMemo(() => {
    if (!editorActive || !config.editor || editorMode !== 'complete') return []
    const corners = computeBoundaryCycle(config.editor)
    return corners.filter(c => !boundaryCycle.some(v =>
      Math.abs(v.p.x - c.p.x) < EDITOR_EPS && Math.abs(v.p.y - c.p.y) < EDITOR_EPS,
    ))
  }, [editorActive, config.editor, editorMode, boundaryCycle])

  // Strand mode hides every design overlay — the canvas is the lattice
  // preview only, and strand controls in the side panel drive what changes.
  const editorOverlay = editorActive && !editorStrandMode
    ? editorMode === 'complete' && onPickVertex
      ? (
        <EditorVertexLayer
          vertices={boundaryCycle}
          boundaryCorners={boundaryCorners}
          firstPick={firstVertexPick ?? null}
          onPickVertex={onPickVertex}
        />
      )
      : onSelectEdge ? (
        <EditorEdgeLayer
          edges={exposedEdges}
          selected={selectedEdge ?? null}
          onSelect={onSelectEdge}
          hovered={hoveredEdge}
          onHover={setHoveredEdge}
        />
      ) : null
    : null

  const pickerScreenPos = selectedEdgeData && editorMode === 'place' && !editorStrandMode
    ? worldToScreen(selectedEdgeData.midpoint, viewTransform, size.width, size.height)
    : null
  const pickerViable = selectedEdgeData && config.editor
    ? viableSidesForEdge(selectedEdgeData, config.editor)
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
