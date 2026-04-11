import type { Vec2 } from '../utils/math'
import { quarticToCubics } from '../utils/math'
import type { CurvedStrand } from './computeCurves'

/**
 * Generate an SVG path `d` attribute from a CurvedStrand.
 * Uses Q (quadratic), C (cubic), or L (line) commands depending
 * on the number of control points per edge.
 */
export function curvedPathD(strand: CurvedStrand): string {
  const { points, curves } = strand
  if (points.length === 0) return ''

  const parts: string[] = [`M${points[0].x} ${points[0].y}`]

  for (let i = 0; i < points.length - 1; i++) {
    const cps = curves[i]
    const end = points[i + 1]

    if (!cps || cps.length === 0) {
      parts.push(`L${end.x} ${end.y}`)
    } else if (cps.length === 1) {
      // Quadratic Bézier
      parts.push(`Q${cps[0].x} ${cps[0].y} ${end.x} ${end.y}`)
    } else if (cps.length === 2) {
      // Cubic Bézier
      parts.push(`C${cps[0].x} ${cps[0].y} ${cps[1].x} ${cps[1].y} ${end.x} ${end.y}`)
    } else {
      // 3 control points: quartic approximated as two cubics
      const [c1, c2] = quarticToCubics(points[i], cps[0], cps[1], cps[2], end)
      parts.push(`C${c1.cp1.x} ${c1.cp1.y} ${c1.cp2.x} ${c1.cp2.y} ${c1.end.x} ${c1.end.y}`)
      parts.push(`C${c2.cp1.x} ${c2.cp1.y} ${c2.cp2.x} ${c2.cp2.y} ${c2.end.x} ${c2.end.y}`)
    }
  }

  return parts.join(' ')
}

/**
 * Generate an SVG path `d` attribute from a flat point array (no curves).
 * Used as a fallback when curve data is unavailable.
 */
export function linearPathD(pts: Vec2[]): string {
  return pts.map((p, j) => `${j === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ')
}
