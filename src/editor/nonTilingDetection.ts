import type { EditorConfig } from '../types/editor'
import type { Vec2 } from '../utils/math'
import { computeOuterBoundary } from './boundary'
import { editorBoundaryVertices } from './buildEditorPolygons'

/**
 * Step 17.10 — non-tiling patch detection.
 *
 * The strand-editor stamps the patch on a translation lattice keyed by the
 * boundary polygon. That stamping only produces a clean tessellation if the
 * patch fills the boundary exactly. When tiles leave gaps inside the
 * boundary (underfill) or spill past it (overflow), the stamped copies
 * won't line up and the user sees seams.
 *
 * Detection here is intentionally lightweight: shoelace areas of the patch
 * outer cycle vs. the boundary polygon, with a 1% relative tolerance. It's
 * a diagnostic, not a fix — surfaced as a tag so the user knows why the
 * preview looks broken.
 */

export type PatchTilingStatus =
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

export function detectPatchTilingStatus(editor: EditorConfig): PatchTilingStatus {
  if (editor.tiles.length === 0) {
    return { kind: 'non-tiling', reason: 'empty' }
  }
  const patchCycle = computeOuterBoundary(editor)
  if (patchCycle.length === 0) {
    return { kind: 'non-tiling', reason: 'empty' }
  }
  const boundaryPts = editorBoundaryVertices(editor)
  const boundaryArea = polygonArea(boundaryPts)
  if (boundaryArea === 0) return { kind: 'tiling' }
  const patchArea = polygonArea(patchCycle.map(v => v.p))
  const ratio = (patchArea - boundaryArea) / boundaryArea
  if (Math.abs(ratio) <= AREA_TOLERANCE) return { kind: 'tiling' }
  return { kind: 'non-tiling', reason: ratio < 0 ? 'underfills' : 'overflows' }
}
