import type { AutoCompleteFlavor, EditorConfig, EditorTile } from '../types/editor'
import { computeOuterBoundary } from './boundary'
import { completeGap } from './complete'
import { tileVertices } from './exposedEdges'
import { BOUNDARY_SIDES } from './buildEditorPolygons'

/**
 * Step 17.7 — auto-complete-on-flip (Decision 11).
 *
 * Two flavours:
 *   - `until-convex`  fill concave (reflex) dents on the patch's outer
 *                     boundary until the cycle is convex. Boundary size
 *                     is untouched.
 *   - `match-boundary` same as above, then resize `boundarySize` so the
 *                     boundary polygon hugs the patch's convex hull.
 *
 * Auto-completed tiles are first-class `'completed'` polygons emitted by
 * `completeGap`; on flip-back to Design they're editable like any other
 * completed tile (Decision 16).
 */

/** Hard cap on fill iterations to guarantee termination on pathological input. */
const MAX_PASSES = 64
/** Reflex test tolerance — anything tighter is just numerical noise. */
const REFLEX_EPS = 1e-9

export interface AutoCompleteResult {
  tiles: EditorTile[]
  boundarySize: number
}

/**
 * Index of the first reflex (interior angle > π) vertex on a CCW cycle, or -1
 * if the cycle is convex. For a CCW polygon, the cross product of incoming
 * and outgoing edges is positive at convex vertices and negative at reflex.
 */
function findReflexVertex(cycle: { p: { x: number; y: number } }[]): number {
  const n = cycle.length
  if (n < 4) return -1
  for (let i = 0; i < n; i++) {
    const a = cycle[(i - 1 + n) % n].p
    const b = cycle[i].p
    const c = cycle[(i + 1) % n].p
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)
    if (cross < -REFLEX_EPS) return i
  }
  return -1
}

/** Outward unit-normal direction angles for each boundary edge (CCW). */
function boundaryNormalAngles(editor: EditorConfig): number[] {
  const sides = BOUNDARY_SIDES[editor.boundaryShape]
  // Match BOUNDARY_ROTATION in buildEditorPolygons.ts: triangle/hex point-up,
  // square axis-aligned. Plus the optional alternate-orientation π/n offset.
  const baseRot = editor.boundaryShape === 'square' ? Math.PI / 4 : -Math.PI / 2
  const offset = editor.alternateBoundary ? Math.PI / sides : 0
  const rot = baseRot + offset
  const out: number[] = []
  for (let k = 0; k < sides; k++) {
    out.push(rot + ((2 * k + 1) * Math.PI) / sides)
  }
  return out
}

/**
 * Smallest `boundarySize` (regular-polygon edge length) such that the boundary
 * polygon, centred at the origin with the patch's existing rotation, contains
 * every tile vertex. Derived from the apothem: for each tile vertex `v` and
 * each boundary-edge outward normal `n_k`, the apothem must be at least
 * `dot(v, n_k)`; take the max and convert back to edge length.
 */
export function fitBoundarySize(editor: EditorConfig): number {
  const angles = boundaryNormalAngles(editor)
  const sides = angles.length
  let maxApothem = 0
  for (const tile of editor.tiles) {
    for (const v of tileVertices(tile)) {
      for (const a of angles) {
        const proj = v.x * Math.cos(a) + v.y * Math.sin(a)
        if (proj > maxApothem) maxApothem = proj
      }
    }
  }
  // edgeLength = 2 · apothem · tan(π/n)
  const L = 2 * maxApothem * Math.tan(Math.PI / sides)
  return Math.max(L, editor.edgeLength)
}

/**
 * Pure helper: runs auto-complete on `editor` and returns the new tiles list
 * + (possibly updated) boundary size. The reducer is responsible for swapping
 * these onto state and re-seeding figures.
 *
 * Idempotent on already-convex patches — `until-convex` exits immediately if
 * no reflex vertex exists, and `match-boundary` resolves to the same fitted
 * boundary on subsequent calls.
 */
export function autoCompletePatch(
  editor: EditorConfig,
  flavor: AutoCompleteFlavor,
): AutoCompleteResult {
  let tiles = editor.tiles
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const work: EditorConfig = { ...editor, tiles }
    const cycle = computeOuterBoundary(work)
    if (cycle.length < 3) break
    const idx = findReflexVertex(cycle)
    if (idx < 0) break
    const n = cycle.length
    const prev = cycle[(idx - 1 + n) % n].p
    const next = cycle[(idx + 1) % n].p
    const id = `auto-${tiles.length}-${Date.now()}-${pass}`
    const tile = completeGap(work, prev, next, id)
    if (!tile) break
    tiles = [...tiles, tile]
  }
  let boundarySize = editor.boundarySize
  if (flavor === 'match-boundary') {
    const fit = fitBoundarySize({ ...editor, tiles })
    if (Number.isFinite(fit) && fit > 0) boundarySize = fit
  }
  return { tiles, boundarySize }
}
