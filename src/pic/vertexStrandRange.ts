import { polygonInteriorAngleAt, radToDeg, type Vec2 } from '../utils/math'

/**
 * The contact angles at which a Tile's **Vertex strands** can actually draw.
 *
 * A vertex ray leaves its vertex at α = 90° − θ either side of the interior
 * bisector, and `vertexRayEntersPolygon` (pic/index.ts) suppresses any ray
 * that points OUTSIDE the tile's own wedge at that vertex — i.e. it needs
 * α ≤ interior/2. Rearranged, a vertex emits only while
 *
 *     θ ≥ 90° − interior/2
 *
 * which on a regular n-gon is exactly **180/n** (60° on a triangle, 45° on a
 * square, 15° on a dodecagon). The bound is reported as the angle θ must
 * EXCEED, not reach: exactly at it the ray runs along the tile's own edge, and
 * the arm that survives the cone test is then clipped to zero length and
 * dropped anyway (a triangle at 60° emits a degenerate half-set). At or below
 * it, the family draws NOTHING — not a short arm, not a stub. That is geometrically right and completely invisible
 * in the UI: the reported symptom was "the strands do not appear at certain
 * angles" after switching Edge strands off, which hands the Tile to a Vertex
 * strand family that cannot draw at the θ the user had dialled in.
 *
 * Exposing it as a predicate lets the Strands panel say so where the toggle
 * is, and lets a test pin the threshold against what `runPIC` really emits
 * rather than against this derivation.
 */
export interface VertexStrandRange {
  /** θ must EXCEED this for any vertex to emit (set by the widest vertex). */
  anyFrom: number
  /** θ must EXCEED this for every vertex to emit (set by the sharpest one). */
  allFrom: number
}

/** Threshold for one interior angle, in degrees. */
function thresholdFor(interiorRad: number): number {
  return 90 - radToDeg(interiorRad) / 2
}

/**
 * The range for an arbitrary polygon. On an irregular Tile the vertices have
 * different interior angles, so there is a band between `anyFrom` and
 * `allFrom` where the Figure is *partial* — some corners draw, some don't.
 */
export function vertexStrandRange(vertices: Vec2[]): VertexStrandRange {
  if (vertices.length < 3) return { anyFrom: 90, allFrom: 90 }
  let anyFrom = Infinity
  let allFrom = -Infinity
  for (let i = 0; i < vertices.length; i++) {
    const t = thresholdFor(polygonInteriorAngleAt(vertices, i))
    if (t < anyFrom) anyFrom = t
    if (t > allFrom) allFrom = t
  }
  return { anyFrom: clampDeg(anyFrom), allFrom: clampDeg(allFrom) }
}

/** The regular-n-gon case in closed form — every interior angle is equal. */
export function regularVertexStrandRange(sides: number): VertexStrandRange {
  if (sides < 3) return { anyFrom: 90, allFrom: 90 }
  const t = clampDeg(180 / sides)
  return { anyFrom: t, allFrom: t }
}

/** Keep the answer inside the θ domain; a reflex vertex would go negative. */
function clampDeg(deg: number): number {
  return Math.max(0, Math.min(90, deg))
}
