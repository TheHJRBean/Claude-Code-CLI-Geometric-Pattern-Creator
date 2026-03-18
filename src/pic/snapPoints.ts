import type { Vec2 } from '../utils/math'
import type { Polygon } from '../types/geometry'
import { dist, EPSILON } from '../utils/math'
import { computeContactRays } from './stellation'
import { rayRayIntersect } from './intersect'
import { generateTiling } from '../tilings/archimedean'
import { TILINGS } from '../tilings/index'

/**
 * Compute the auto-meet distance for a polygon: the t-value at which
 * adjacent rays within the same polygon meet at a star tip.
 */
function autoTForPolygon(poly: Polygon, contactAngle: number): number {
  const rays = computeContactRays(poly, contactAngle)
  const n = poly.sides
  for (let k = 0; k < n; k++) {
    const prevEdge = (k - 1 + n) % n
    // Try pairing A
    const rA1 = rays[prevEdge * 2 + 1]
    const rA2 = rays[k * 2]
    const resA = rayRayIntersect(rA1.origin, rA1.dir, rA2.origin, rA2.dir)
    if (resA && resA.t1 > EPSILON && resA.t2 > EPSILON) return resA.t1
    // Try pairing B
    const rB1 = rays[prevEdge * 2]
    const rB2 = rays[k * 2 + 1]
    const resB = rayRayIntersect(rB1.origin, rB1.dir, rB2.origin, rB2.dir)
    if (resB && resB.t1 > EPSILON && resB.t2 > EPSILON) return resB.t1
  }
  return Infinity
}

/**
 * Compute snap points for a polygon type by generating a small tiling
 * patch and finding ray-ray intersections across neighboring tiles.
 *
 * Only keeps intersections where the other ray would actually reach the
 * intersection point at its own auto (meet-neighbors) length, ensuring
 * snap points represent real line meetings.
 *
 * Returns lineLength values (fractions of inradius) sorted ascending.
 */
export function computeSnapPoints(
  tilingType: string,
  targetSides: number,
  figures: Record<number, { contactAngle: number }>,
): number[] {
  const def = TILINGS[tilingType]
  if (!def) return []

  // Small patch — just 1-2 rings of neighbors around center
  const edgeLen = 100
  const patchSize = edgeLen * 6
  const polygons = generateTiling(def, {
    x: -patchSize / 2,
    y: -patchSize / 2,
    width: patchSize,
    height: patchSize,
  }, edgeLen)

  // Find the most central polygon of the target type
  const targetPoly = polygons
    .filter(p => p.sides === targetSides)
    .sort((a, b) =>
      (a.center.x ** 2 + a.center.y ** 2) - (b.center.x ** 2 + b.center.y ** 2)
    )[0]
  if (!targetPoly) return []

  const targetAngle = figures[targetSides]?.contactAngle ?? 60
  const targetRays = computeContactRays(targetPoly, targetAngle)
  const targetInradius = dist(targetPoly.center, targetRays[0].origin)
  if (targetInradius < EPSILON) return []

  // Precompute auto-meet distance per polygon type
  const autoTByType = new Map<number, number>()
  for (const poly of polygons) {
    if (autoTByType.has(poly.sides)) continue
    const angle = figures[poly.sides]?.contactAngle ?? 60
    autoTByType.set(poly.sides, autoTForPolygon(poly, angle))
  }

  // Compute rays for all polygons, tagged with their auto-meet limit
  interface TaggedRay { origin: Vec2; dir: Vec2; autoT: number }
  const allRays: TaggedRay[] = []
  for (const poly of polygons) {
    const angle = figures[poly.sides]?.contactAngle ?? 60
    const rays = computeContactRays(poly, angle)
    const autoT = autoTByType.get(poly.sides) ?? Infinity
    for (const r of rays) {
      allRays.push({ origin: r.origin, dir: r.dir, autoT })
    }
  }

  // Intersect each target ray with all other rays, filtering by whether
  // the other ray actually reaches the intersection at its auto length
  const values = new Set<number>()
  for (const tRay of targetRays) {
    for (const oRay of allRays) {
      // Skip rays from the same edge midpoint
      if (Math.abs(tRay.origin.x - oRay.origin.x) < 0.5 &&
          Math.abs(tRay.origin.y - oRay.origin.y) < 0.5) continue

      const res = rayRayIntersect(tRay.origin, tRay.dir, oRay.origin, oRay.dir)
      if (!res || res.t1 < EPSILON || res.t2 < EPSILON) continue

      // Only snap where the other ray actually reaches (at its auto length)
      if (res.t2 > oRay.autoT + EPSILON) continue

      const ll = res.t1 / targetInradius
      if (ll >= 0.1 && ll <= 5.0) {
        values.add(Math.round(ll * 1000) / 1000)
      }
    }
  }

  // Deduplicate nearby values (within 1pp) and sort
  const sorted = [...values].sort((a, b) => a - b)
  const deduped: number[] = []
  for (const v of sorted) {
    if (deduped.length === 0 || v - deduped[deduped.length - 1] > 0.01) {
      deduped.push(v)
    }
  }

  return deduped
}

/**
 * Snap a value to the nearest snap point if within threshold.
 */
export function snapToNearest(
  value: number,
  snapPoints: number[],
  threshold: number = 0.08,
): number {
  let closest = value
  let minDist = threshold
  for (const snap of snapPoints) {
    const d = Math.abs(value - snap)
    if (d < minDist) {
      minDist = d
      closest = snap
    }
  }
  return closest
}
