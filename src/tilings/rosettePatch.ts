import type { TilingDefinition } from '../types/tiling'
import type { Viewport } from './archimedean'
import type { Polygon } from '../types/geometry'
import { generateTapratsTiling } from './tapratsTiling'

/**
 * Generate rosette patch tiling for non-Archimedean n-fold symmetries.
 *
 * Delegates to the Taprats-format tiling generator, which uses
 * pre-defined tiling data from Craig Kaplan's Taprats reference
 * implementation. Each rosette type has a specific set of polygon
 * types and placement transforms that tile the plane correctly.
 */
export function generateRosettePatch(
  definition: TilingDefinition,
  viewport: Viewport,
  edgeLen: number,
): Polygon[] {
  return generateTapratsTiling(definition.name, viewport, edgeLen)
}
