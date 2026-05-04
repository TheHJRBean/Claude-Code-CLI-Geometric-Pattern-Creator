import { useRef, useEffect, useCallback, useState, useDeferredValue, useMemo } from 'react'
import type { PatternConfig } from '../types/pattern'
import type { Segment } from '../types/geometry'
import type { Vec2 } from '../utils/math'
import { usePattern } from '../hooks/usePattern'
import { usePanZoom, type ViewTransform } from '../hooks/usePanZoom'
import { PatternSVG } from '../rendering/PatternSVG'
import { RotationDial } from './RotationDial'
import { computeExposedEdges } from '../editor/exposedEdges'
import { viableSidesForEdge } from '../editor/placement'
import { EditorEdgeLayer } from './EditorEdgeLayer'
import { EditorPickerOverlay } from './EditorPickerOverlay'

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
  fillOnHover?: boolean
  /** Step 17.3 — editor-mode interaction handlers. Active only when an editor patch is loaded. */
  selectedEdge?: SelectedEdge | null
  onSelectEdge?: (edge: SelectedEdge | null) => void
  onPlaceTile?: (sides: number) => void
}

const INITIAL_ZOOM = 1

export function Canvas({ config, showTileLayer, showLines, svgRef, segmentsRef, cpVisible, cpActive, outlineWidth, fillOnHover, selectedEdge, onSelectEdge, onPlaceTile }: Props) {
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
  const { polygons, segments, boundaryOutline } = usePattern(config, deferredVT, size.width, size.height)

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

  const editorOverlay = editorActive && onSelectEdge ? (
    <EditorEdgeLayer
      edges={exposedEdges}
      selected={selectedEdge ?? null}
      onSelect={onSelectEdge}
      hovered={hoveredEdge}
      onHover={setHoveredEdge}
    />
  ) : null

  const pickerScreenPos = selectedEdgeData
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
        fillOnHover={fillOnHover}
        boundaryOutline={boundaryOutline}
        editorOverlay={editorOverlay}
      />
      {pickerScreenPos && onPlaceTile && onSelectEdge && (
        <EditorPickerOverlay
          position={pickerScreenPos}
          viableSides={pickerViable}
          onPick={n => { onPlaceTile(n); onSelectEdge(null) }}
          onClose={() => onSelectEdge(null)}
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
