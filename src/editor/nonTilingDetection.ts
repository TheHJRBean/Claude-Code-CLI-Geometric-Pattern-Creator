import type { EditorCell } from '../types/editor'
import type { Vec2 } from '../utils/math'
import { computeOuterBoundary } from './boundary'
import { editorBoundaryVertices } from './buildEditorPolygons'

/**
 * Step 17.10 — non-tiling Cell detection.
 *
 * The Composition-Phase preview stamps the Patch on a translation lattice
 * keyed by the Boundary polygon. That stamping only produces a clean
 * tessellation if every Cell fills its Boundary exactly. When Tiles leave
 * gaps inside the Boundary (underfill) or spill past it (overflow), the
 * stamped copies won't line up and the user sees seams.
 *
 * Detection here is intentionally lightweight: shoelace areas of the Cell's
 * outer cycle vs. its Boundary polygon, with a 1% relative tolerance. It's
 * a diagnostic, not a fix — surfaced as a tag so the user knows why the
 * preview looks broken. The caller is responsible for aggregating across
 * Cells in multi-cell Configurations.
 */

export type CellTilingStatus =
  | { kind: 'tiling' }
  | { kind: 'non-tiling'; reason: 'underfills' | 'overflows' | 'empty' }

const AREA_TOLERANCE = 0.01

function polygonArea(pts: Vec2[]): number {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length
    a += pts[i].x * pts[j].y - pts[j].x * pts[i].y
  }
  return Math.abs(a) / 2
}

export function detectCellTilingStatus(cell: EditorCell): CellTilingStatus {
  if (cell.tiles.length === 0) {
    return { kind: 'non-tiling', reason: 'empty' }
  }
  const patchCycle = computeOuterBoundary(cell)
  if (patchCycle.length === 0) {
    return { kind: 'non-tiling', reason: 'empty' }
  }
  const boundaryPts = editorBoundaryVertices(cell)
  const boundaryArea = polygonArea(boundaryPts)
  if (boundaryArea === 0) return { kind: 'tiling' }
  const patchArea = polygonArea(patchCycle.map(v => v.p))
  const ratio = (patchArea - boundaryArea) / boundaryArea
  if (Math.abs(ratio) <= AREA_TOLERANCE) return { kind: 'tiling' }
  return { kind: 'non-tiling', reason: ratio < 0 ? 'underfills' : 'overflows' }
}
