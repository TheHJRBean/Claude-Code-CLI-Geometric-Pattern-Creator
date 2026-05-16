import type { EditorCell, EditorTile } from '../types/editor'
import { computeOuterBoundary } from './boundary'
import { completeGap } from './complete'
import { tileVertices } from './exposedEdges'
import { BOUNDARY_ROTATION, BOUNDARY_SIDES } from './buildEditorPolygons'

/**
 * Step 17.7 — auto-complete (Decision 11).
 *
 * Fills concave (reflex) dents on a **Cell**'s outer boundary until the cycle
 * is convex. Auto-completed Tiles are first-class `'completed'` polygons
 * emitted by `completeGap`; on phase-switch back to Design they're editable
 * like any other completed Tile (Decision 16). The Cell's `boundarySize` is
 * untouched — the separate `wrapBoundary` mode handles boundary fitting in
 * Design Phase.
 */

/** Hard cap on fill iterations to guarantee termination on pathological input. */
const MAX_PASSES = 64
/** Reflex test tolerance — anything tighter is just numerical noise. */
const REFLEX_EPS = 1e-9

export interface AutoCompleteResult {
  tiles: EditorTile[]
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
function boundaryNormalAngles(cell: EditorCell): number[] {
  const sides = BOUNDARY_SIDES[cell.shape]
  const baseRot = BOUNDARY_ROTATION[cell.shape]
  const offset = cell.alternateBoundary ? Math.PI / sides : 0
  const rot = baseRot + offset
  const out: number[] = []
  for (let k = 0; k < sides; k++) {
    out.push(rot + ((2 * k + 1) * Math.PI) / sides)
  }
  return out
}

/**
 * Smallest `boundarySize` (regular-polygon edge length) such that the Cell's
 * Boundary polygon, centred at the cell origin with its rotation, contains
 * every Tile vertex. Caller passes the Patch's shared `edgeLength` as the
 * lower bound — the Boundary never shrinks below one Tile edge.
 */
export function fitBoundarySize(cell: EditorCell, edgeLengthFloor: number): number {
  const angles = boundaryNormalAngles(cell)
  const sides = angles.length
  let maxApothem = 0
  for (const tile of cell.tiles) {
    for (const v of tileVertices(tile)) {
      for (const a of angles) {
        const proj = v.x * Math.cos(a) + v.y * Math.sin(a)
        if (proj > maxApothem) maxApothem = proj
      }
    }
  }
  const L = 2 * maxApothem * Math.tan(Math.PI / sides)
  return Math.max(L, edgeLengthFloor)
}

/**
 * Pure helper: runs auto-complete on a Cell and returns the new tiles list.
 * The reducer is responsible for swapping the result onto state and re-seeding
 * figures. Idempotent on already-convex Cells — exits immediately when no
 * reflex vertex exists.
 */
export function autoCompleteCell(cell: EditorCell): AutoCompleteResult {
  let tiles = cell.tiles
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const work: EditorCell = { ...cell, tiles }
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
  return { tiles }
}
