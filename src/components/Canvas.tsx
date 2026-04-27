import { useRef, useEffect, useCallback, useState, useDeferredValue } from 'react'
import type { PatternConfig } from '../types/pattern'
import type { Segment } from '../types/geometry'
import { usePattern } from '../hooks/usePattern'
import { usePanZoom } from '../hooks/usePanZoom'
import { PatternSVG } from '../rendering/PatternSVG'
import { RotationDial } from './RotationDial'

interface Props {
  config: PatternConfig
  showTileLayer: boolean
  showLines: boolean
  svgRef: React.RefObject<SVGSVGElement>
  segmentsRef: React.MutableRefObject<Segment[]>
  cpVisible: Record<string, boolean>
  cpActive: Record<string, number>
}

const INITIAL_ZOOM = 1

export function Canvas({ config, showTileLayer, showLines, svgRef, segmentsRef, cpVisible, cpActive }: Props) {
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
  const { polygons, segments } = usePattern(config, deferredVT, size.width, size.height)

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
      />
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
