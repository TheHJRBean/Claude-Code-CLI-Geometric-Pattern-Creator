import type { Vec2 } from '../utils/math'
import { dist, EPSILON } from '../utils/math'
import { computeContactRays } from './stellation'
import { rayRayIntersect } from './intersect'
import { generateTiling } from '../tilings/archimedean'
import { TILINGS } from '../tilings/index'

/**
 * Compute snap points for a polygon type by generating a tiling patch
 * and finding ray-ray intersections across neighboring tiles.
 *
 * Keeps intersections where both rays' equivalent lineLength values
 * fall within the slider range (10%–500%), so every reachable meeting
 * point is captured.
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

  // Patch with 2-3 rings of neighbors to catch non-adjacent meetings
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

  const targetAngle = figures[targetSides]?.contactAngle ?? 60
  const targetRays = computeContactRays(targetPoly, targetAngle)
  const targetInradius = dist(targetPoly.center, targetRays[0].origin)
  if (targetInradius < EPSILON) return []

  // Precompute inradius per polygon type
  const inradiusByType = new Map<number, number>()
  for (const poly of polygons) {
    if (inradiusByType.has(poly.sides)) continue
    const angle = figures[poly.sides]?.contactAngle ?? 60
    const rays = computeContactRays(poly, angle)
    inradiusByType.set(poly.sides, dist(poly.center, rays[0].origin))
  }

  // Compute rays for all polygons, tagged with their inradius
  interface TaggedRay { origin: Vec2; dir: Vec2; inradius: number }
  const allRays: TaggedRay[] = []
  for (const poly of polygons) {
    const angle = figures[poly.sides]?.contactAngle ?? 60
    const rays = computeContactRays(poly, angle)
    const ir = inradiusByType.get(poly.sides) ?? 1
    for (const r of rays) {
      allRays.push({ origin: r.origin, dir: r.dir, inradius: ir })
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
      const otherLL = res.t2 / oRay.inradius

      // Both rays must be within slider range for the meeting to be reachable
      if (targetLL < 0.1 || targetLL > 5.0) continue
      if (otherLL < 0.1 || otherLL > 5.0) continue

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
export function computeThreshold(snapPoints: number[]): number {
  if (snapPoints.length < 2) return 0.08
  let minGap = Infinity
  for (let i = 1; i < snapPoints.length; i++) {
    minGap = Math.min(minGap, snapPoints[i] - snapPoints[i - 1])
  }
  // Use 45% of the smallest gap, capped between 1.5pp and 8pp
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
