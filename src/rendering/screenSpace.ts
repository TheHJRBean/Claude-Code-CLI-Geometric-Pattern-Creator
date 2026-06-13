import type { Vec2 } from '../utils/math'
import type { ViewTransform } from '../hooks/usePanZoom'

/**
 * Map a world-space point to screen-space pixels relative to the canvas
 * container, accounting for pan, zoom, and the rotation `<g>` applied around
 * the viewBox centre.
 *
 * The viewBox is `[vt.x, vt.y, width/zoom, height/zoom]`; rotation spins the
 * content about the viewBox centre `(cx, cy)`. We rotate the world point about
 * that centre, then convert the resulting viewBox coordinate to pixels.
 *
 * Used to anchor the floating editor pickers (edge / boundary-section / vertex)
 * over their selected target. Pure — extracted from `Canvas` so it can be
 * tested independently of the component.
 */
export function worldToScreen(
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
