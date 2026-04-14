import { useCallback, useEffect, useRef, useState } from 'react'

export interface ViewTransform {
  x: number
  y: number
  zoom: number
  rotation: number  // degrees, 0–360
}

export interface PanZoomHandlers {
  onPointerDown: (e: React.PointerEvent<SVGSVGElement>) => void
  onPointerMove: (e: React.PointerEvent<SVGSVGElement>) => void
  onPointerUp: (e: React.PointerEvent<SVGSVGElement>) => void
}

export function usePanZoom(
  initialZoom = 1,
  svgRef: React.RefObject<SVGSVGElement | null>,
): {
  viewTransform: ViewTransform
  handlers: PanZoomHandlers
  setViewTransform: React.Dispatch<React.SetStateAction<ViewTransform>>
} {
  const [vt, setVt] = useState<ViewTransform>({ x: 0, y: 0, zoom: initialZoom, rotation: 0 })
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
    setVt(prev => {
      // Rotate screen-space delta into viewport space so pan direction
      // stays consistent when the canvas is rotated.
      const rad = -prev.rotation * (Math.PI / 180)
      const cos = Math.cos(rad)
      const sin = Math.sin(rad)
      const rdx = (dx * cos - dy * sin) / prev.zoom
      const rdy = (dx * sin + dy * cos) / prev.zoom
      return { ...prev, x: prev.x - rdx, y: prev.y - rdy }
    })
  }, [])

  const onPointerUp = useCallback(() => {
    dragging.current = false
  }, [])

  // Attach wheel listener natively with { passive: false } so
  // preventDefault works and the page doesn't scroll while zooming.
  useEffect(() => {
    const el = svgRef.current
    if (!el) return

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      const factor = e.deltaY < 0 ? 1.1 : 0.9
      const rect = el.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top

      setVt(prev => {
        const newZoom = prev.zoom * factor
        const px = prev.x + sx / prev.zoom
        const py = prev.y + sy / prev.zoom
        return {
          ...prev,
          zoom: newZoom,
          x: px - sx / newZoom,
          y: py - sy / newZoom,
        }
      })
    }

    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [svgRef])

  return { viewTransform: vt, handlers: { onPointerDown, onPointerMove, onPointerUp }, setViewTransform: setVt }
}
