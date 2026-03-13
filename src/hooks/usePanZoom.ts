import { useCallback, useRef, useState } from 'react'

export interface ViewTransform {
  x: number
  y: number
  zoom: number
}

export interface PanZoomHandlers {
  onPointerDown: (e: React.PointerEvent<SVGSVGElement>) => void
  onPointerMove: (e: React.PointerEvent<SVGSVGElement>) => void
  onPointerUp: (e: React.PointerEvent<SVGSVGElement>) => void
  onWheel: (e: React.WheelEvent<SVGSVGElement>) => void
}

export function usePanZoom(initialZoom = 1): {
  viewTransform: ViewTransform
  handlers: PanZoomHandlers
  setViewTransform: React.Dispatch<React.SetStateAction<ViewTransform>>
} {
  const [vt, setVt] = useState<ViewTransform>({ x: 0, y: 0, zoom: initialZoom })
  const dragging = useRef(false)
  const lastPos = useRef({ x: 0, y: 0 })

  const onPointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    dragging.current = true
    lastPos.current = { x: e.clientX, y: e.clientY }
    ;(e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId)
  }, [])

  const onPointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragging.current) return
    const dx = e.clientX - lastPos.current.x
    const dy = e.clientY - lastPos.current.y
    lastPos.current = { x: e.clientX, y: e.clientY }
    setVt(prev => ({
      ...prev,
      x: prev.x - dx / prev.zoom,
      y: prev.y - dy / prev.zoom,
    }))
  }, [])

  const onPointerUp = useCallback(() => {
    dragging.current = false
  }, [])

  const onWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault()
    const factor = e.deltaY < 0 ? 1.1 : 0.9
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
    // Screen position of cursor relative to SVG element
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top

    setVt(prev => {
      const newZoom = prev.zoom * factor
      // Pattern-space point under the cursor (before zoom)
      const px = prev.x + sx / prev.zoom
      const py = prev.y + sy / prev.zoom
      // After zoom, keep that pattern point under the cursor
      return {
        zoom: newZoom,
        x: px - sx / newZoom,
        y: py - sy / newZoom,
      }
    })
  }, [])

  return { viewTransform: vt, handlers: { onPointerDown, onPointerMove, onPointerUp, onWheel }, setViewTransform: setVt }
}
