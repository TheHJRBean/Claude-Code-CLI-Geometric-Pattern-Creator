import type { Polygon, Segment } from '../types/geometry'
import type { PatternConfig } from '../types/pattern'
import { computeContactRays } from './stellation'
import { trimRays } from './trim'

/**
 * Run the full PIC pipeline for all polygons.
 * Returns the raw segments (one per contact ray that found an intersection).
 */
export function runPIC(polygons: Polygon[], config: PatternConfig): Segment[] {
  const allSegments: Segment[] = []

  for (const poly of polygons) {
    const figureConfig = config.figures[poly.sides]
    if (!figureConfig) continue

    const rays = computeContactRays(poly, figureConfig.contactAngle)
    const segments = trimRays(poly, rays)
    allSegments.push(...segments)
  }

  return allSegments
}
