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
    const rA1 = rays[prevEdge * 2 + 1]
    const rA2 = rays[k * 2]
    const resA = rayRayIntersect(rA1.origin, rA1.dir, rA2.origin, rA2.dir)
    if (resA && resA.t1 > EPSILON && resA.t2 > EPSILON) return resA.t1
    const rB1 = rays[prevEdge * 2]
    const rB2 = rays[k * 2 + 1]
    const resB = rayRayIntersect(rB1.origin, rB1.dir, rB2.origin, rB2.dir)
    if (resB && resB.t1 > EPSILON && resB.t2 > EPSILON) return resB.t1
  }
  return Infinity
}

/**
 * Compute snap points for a polygon type by generating a tiling patch
 * and finding meaningful ray-ray intersections across tiles.
 *
 * A snap point is kept if EITHER:
 *   (a) The target tip hits the other ray's auto-rendered segment
 *       (t2 <= autoT), i.e. our extended line touches a line that's
 *       visible in the default pattern.
 *   (b) Both polygons at the SAME lineLength would have tips touching
 *       (targetLL ≈ otherLL), i.e. symmetric extensions meet.
 *
 * Returns lineLength values (fractions of inradius) sorted ascending.
 */
export function computeSnapPoints(
  tilingType: string,
  targetSides: number,
  figures: Record<string, { contactAngle: number }>,
): number[] {
  const def = TILINGS[tilingType]
  if (!def) return []

  const edgeLen = 100
  const patchSize = edgeLen * 8
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

  const targetAngle = figures[String(targetSides)]?.contactAngle ?? 60
  const targetRays = computeContactRays(targetPoly, targetAngle)
  const targetInradius = dist(targetPoly.center, targetRays[0].origin)
  if (targetInradius < EPSILON) return []

  // Precompute auto-meet distance and inradius per polygon type
  const infoByType = new Map<number, { inradius: number; autoT: number }>()
  for (const poly of polygons) {
    if (infoByType.has(poly.sides)) continue
    const angle = figures[poly.tileTypeId]?.contactAngle ?? 60
    const rays = computeContactRays(poly, angle)
    const ir = dist(poly.center, rays[0].origin)
    const at = autoTForPolygon(poly, angle)
    infoByType.set(poly.sides, { inradius: ir, autoT: at })
  }

  // Compute rays for all polygons, tagged with per-type info
  interface TaggedRay { origin: Vec2; dir: Vec2; inradius: number; autoT: number }
  const allRays: TaggedRay[] = []
  for (const poly of polygons) {
    const angle = figures[poly.tileTypeId]?.contactAngle ?? 60
    const rays = computeContactRays(poly, angle)
    const info = infoByType.get(poly.sides)!
    for (const r of rays) {
      allRays.push({ origin: r.origin, dir: r.dir, inradius: info.inradius, autoT: info.autoT })
    }
  }

  // Intersect each target ray with all other rays
  const values = new Set<number>()
  for (const tRay of targetRays) {
    for (const oRay of allRays) {
      // Skip rays from the same edge midpoint
      if (Math.abs(tRay.origin.x - oRay.origin.x) < 0.5 &&
          Math.abs(tRay.origin.y - oRay.origin.y) < 0.5) continue

      const res = rayRayIntersect(tRay.origin, tRay.dir, oRay.origin, oRay.dir)
      if (!res || res.t1 < EPSILON || res.t2 < EPSILON) continue

      const targetLL = res.t1 / targetInradius
      if (targetLL < 0.1 || targetLL > 5.0) continue

      // (a) Our tip lands on the other ray's auto-rendered segment
      const hitsAutoSegment = res.t2 <= oRay.autoT + EPSILON

      // (b) Both polygons at the same lineLength have tips touching
      const otherLL = res.t2 / oRay.inradius
      const tipsTouch = Math.abs(targetLL - otherLL) < 0.01 && otherLL <= 5.0

      if (!hitsAutoSegment && !tipsTouch) continue

      values.add(Math.round(targetLL * 1000) / 1000)
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
 * Compute an adaptive snap threshold based on the minimum gap between
 * adjacent snap points. Ensures there's always free space between snaps.
 */
function computeThreshold(snapPoints: number[]): number {
  if (snapPoints.length < 2) return 0.08
  let minGap = Infinity
  for (let i = 1; i < snapPoints.length; i++) {
    minGap = Math.min(minGap, snapPoints[i] - snapPoints[i - 1])
  }
  return Math.min(0.08, Math.max(0.015, minGap * 0.45))
}

/**
 * Snap a value to the nearest snap point if within threshold.
 */
export function snapToNearest(
  value: number,
  snapPoints: number[],
  threshold?: number,
): number {
  const t = threshold ?? computeThreshold(snapPoints)
  let closest = value
  let minDist = t
  for (const snap of snapPoints) {
    const d = Math.abs(value - snap)
    if (d < minDist) {
      minDist = d
      closest = snap
    }
  }
  return closest
}
