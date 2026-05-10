import type { Vec2 } from '../utils/math'
import { centroid, pointsEqual } from '../utils/math'
import type { EditorPatch, EditorTile } from '../types/editor'
import { regularPolygonVertices } from './regularPolygon'

/**
 * Loose epsilon for editor-vertex matching. Generous because positions are
 * built from floating-point trig — the algebraically-equal vertices of two
 * tiles can drift apart by 1e-12 to 1e-10 even when they should coincide.
 */
export const EDITOR_EPS = 1e-6

export interface ExposedEdge {
  /** Owning tile's id. */
  tileId: string
  /** Index of the starting vertex; the edge runs verts[i] → verts[(i+1)%n] in CCW order. */
  edgeIndex: number
  p1: Vec2
  p2: Vec2
  midpoint: Vec2
  length: number
  /** Centre of the owning tile — used to disambiguate "outside" direction at placement. */
  sourceCenter: Vec2
  /**
   * Decision 14a — true iff the edge length matches the patch's global
   * edgeLength. Non-conforming edges (created only by Complete-fills in 17.5+)
   * are rendered dashed and inert.
   */
  conforming: boolean
  /**
   * Composition mode only — the BoundaryTile id this edge originates from.
   * Used to disambiguate edges with identical (tileId, edgeIndex) across the
   * cell's boundary tiles (e.g. both 'octagon' and 'square' have an inner
   * 'origin' tile with edge 0). Absent on single-shape patches.
   */
  hostBoundaryTileId?: string
}

/** Vertices of an editor tile — regular tiles are derived; irregular tiles are stored. */
export function tileVertices(tile: EditorTile): Vec2[] {
  return tile.kind === 'regular'
    ? regularPolygonVertices(tile.sides, tile.center, tile.edgeLength, tile.rotation)
    : tile.vertices
}

/** Centre of an editor tile. */
export function tileCenter(tile: EditorTile): Vec2 {
  return tile.kind === 'regular' ? tile.center : centroid(tile.vertices)
}

function edgesShareEndpoints(a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2, eps = EDITOR_EPS): boolean {
  return (
    (pointsEqual(a1, b1, eps) && pointsEqual(a2, b2, eps))
    || (pointsEqual(a1, b2, eps) && pointsEqual(a2, b1, eps))
  )
}

/**
 * Compute the exposed (= unshared) edges of an editor patch. Used by the
 * Design-mode UI to highlight edges and gate placement.
 */
export function computeExposedEdges(patch: EditorPatch): ExposedEdge[] {
  const tiles = patch.tiles
  const vertsByTile = tiles.map(tileVertices)
  const centersByTile = tiles.map(tileCenter)
  const result: ExposedEdge[] = []

  for (let i = 0; i < tiles.length; i++) {
    const verts = vertsByTile[i]
    const n = verts.length
    for (let e = 0; e < n; e++) {
      const p1 = verts[e]
      const p2 = verts[(e + 1) % n]
      let shared = false
      for (let j = 0; j < tiles.length && !shared; j++) {
        if (j === i) continue
        const ov = vertsByTile[j]
        const m = ov.length
        for (let oe = 0; oe < m; oe++) {
          if (edgesShareEndpoints(p1, p2, ov[oe], ov[(oe + 1) % m])) {
            shared = true
            break
          }
        }
      }
      if (shared) continue

      const length = Math.hypot(p2.x - p1.x, p2.y - p1.y)
      result.push({
        tileId: tiles[i].id,
        edgeIndex: e,
        p1,
        p2,
        midpoint: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 },
        length,
        sourceCenter: centersByTile[i],
        conforming: Math.abs(length - patch.edgeLength) < EDITOR_EPS * Math.max(1, patch.edgeLength),
      })
    }
  }
  return result
}
