import { useRef, useEffect, useState } from 'react'
import type { PatternConfig } from '../types/pattern'
import { usePattern } from '../hooks/usePattern'
import { usePanZoom } from '../hooks/usePanZoom'
import { PatternSVG } from '../rendering/PatternSVG'

interface Props {
  config: PatternConfig
  showTileLayer: boolean
  svgRef: React.RefObject<SVGSVGElement>
}

export function Canvas({ config, showTileLayer, svgRef }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: window.innerWidth - 280, height: window.innerHeight })

  useEffect(() => {
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        setSize({ width: entry.contentRect.width, height: entry.contentRect.height })
      }
    })
    if (containerRef.current) observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  const { viewTransform, handlers } = usePanZoom(1)
  const { polygons, segments } = usePattern(config, viewTransform, size.width, size.height)

  return (
    <div ref={containerRef} style={{ flex: 1, overflow: 'hidden' }}>
      <PatternSVG
        ref={svgRef}
        polygons={polygons}
        segments={segments}
        config={config}
        viewTransform={viewTransform}
        containerWidth={size.width}
        containerHeight={size.height}
        showTileLayer={showTileLayer}
        handlers={handlers}
      />
    </div>
  )
}
