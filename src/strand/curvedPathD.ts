import type { Vec2 } from '../utils/math'
import { quarticToCubics } from '../utils/math'
import type { CurvedStrand } from './computeCurves'

/**
 * Append the appropriate L/Q/C command(s) for the edge from `start` to `end`
 * with the given control points. Returns the SVG command string.
 */
function edgeCommand(start: Vec2, end: Vec2, cps: Vec2[] | null): string {
  if (!cps || cps.length === 0) {
    return `L${end.x} ${end.y}`
  } else if (cps.length === 1) {
    return `Q${cps[0].x} ${cps[0].y} ${end.x} ${end.y}`
  } else if (cps.length === 2) {
    return `C${cps[0].x} ${cps[0].y} ${cps[1].x} ${cps[1].y} ${end.x} ${end.y}`
  } else {
    // 3 control points: quartic approximated as two cubics
    const [c1, c2] = quarticToCubics(start, cps[0], cps[1], cps[2], end)
    return `C${c1.cp1.x} ${c1.cp1.y} ${c1.cp2.x} ${c1.cp2.y} ${c1.end.x} ${c1.end.y} C${c2.cp1.x} ${c2.cp1.y} ${c2.cp2.x} ${c2.cp2.y} ${c2.end.x} ${c2.end.y}`
  }
}

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
    parts.push(edgeCommand(points[i], points[i + 1], curves[i]))
  }

  return parts.join(' ')
}

/**
 * Generate two SVG path `d` attributes from a CurvedStrand by classifying
 * each edge with the supplied predicate. `seedD` collects edges where
 * `isGhost(i)` is false; `ghostD` collects edges where it's true. Each
 * contiguous run of same-class edges becomes one M-prefixed sub-path so the
 * Strand splits cleanly at boundary crossings — strokes stay attached on
 * each side of the boundary instead of bleeding across into the other class.
 */
export function curvedPathDSplit(
  strand: CurvedStrand,
  isGhostEdge: (edgeIndex: number) => boolean,
): { seedD: string; ghostD: string } {
  const { points, curves } = strand
  if (points.length < 2) return { seedD: '', ghostD: '' }

  const seedParts: string[] = []
  const ghostParts: string[] = []
  let runIsGhost: boolean | null = null

  for (let i = 0; i < points.length - 1; i++) {
    const ghost = isGhostEdge(i)
    const target = ghost ? ghostParts : seedParts
    if (runIsGhost !== ghost) {
      target.push(`M${points[i].x} ${points[i].y}`)
      runIsGhost = ghost
    }
    target.push(edgeCommand(points[i], points[i + 1], curves[i]))
  }

  return { seedD: seedParts.join(' '), ghostD: ghostParts.join(' ') }
}

/**
 * Generate an SVG path `d` attribute from a flat point array (no curves).
 * Used as a fallback when curve data is unavailable.
 */
export function linearPathD(pts: Vec2[]): string {
  return pts.map((p, j) => `${j === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ')
}
