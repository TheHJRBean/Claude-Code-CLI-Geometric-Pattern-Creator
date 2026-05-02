import type { Polygon } from '../types/geometry'
import type { MandalaConfig } from '../types/pattern'
import { createPolygon, resetIds } from './shared'

/**
 * Allowed outer fold-orders for v1 of the layered-mandala engine.
 * Picked because each has a useful family of historical Islamic patterns
 * built around it (Sultan Hassan 16+8+4, decagonal mandalas, etc.).
 */
export const ALLOWED_OUTER_FOLDS: readonly number[] = [4, 6, 8, 10, 12, 16] as const

export const DEFAULT_MANDALA_CONFIG: MandalaConfig = {
  outerFold: 16,
  layers: [
    { fold: 8, scale: 0.7 },
    { fold: 4, scale: 0.4 },
  ],
}

/**
 * Strict-divisor rule (decision #3 from the plan): an inner-layer fold-order
 * must divide the outer fold order. 16 ⊃ {1,2,4,8,16}, 12 ⊃ {1,2,3,4,6,12},
 * etc. Layers also must be ≥ 3 (a polygon needs at least three sides).
 *
 * Open question MQ-1 (deferred to Step 6): does any target preset require
 * relaxing strict to common-divisor? If so, this function and the UI filter
 * loosen together — until then, strict.
 */
export function allowedInnerFolds(outerFold: number): number[] {
  const folds: number[] = []
  for (let n = 3; n < outerFold; n++) {
    if (outerFold % n === 0) folds.push(n)
  }
  return folds
}

export function isLayerFoldValid(outerFold: number, fold: number): boolean {
  return fold >= 3 && fold < outerFold && outerFold % fold === 0
}

/**
 * Generate the polygon set for a layered mandala. Each layer is a single
 * regular polygon centred at the origin, all sharing the same primary axis
 * (so vertices/axes line up under the strict-divisor rule).
 *
 * @param baseScale  Outer ring's circumradius in world units (= the Lab's
 *                   `tiling.scale` slider value).
 */
export function generateMandala(config: MandalaConfig, baseScale: number): Polygon[] {
  resetIds()

  const polygons: Polygon[] = []
  const center = { x: 0, y: 0 }

  // All layers share the same `phi` so their primary axes align. Use a
  // flat-top orientation when the outer fold is divisible by 4 (so edges
  // sit horizontally for square / 8 / 12 / 16). Otherwise vertex-up.
  const phi = config.outerFold % 4 === 0
    ? -Math.PI / 2 + Math.PI / config.outerFold
    : -Math.PI / 2

  // Outer ring
  polygons.push(createPolygon(config.outerFold, center, baseScale, phi))

  // Inner layers (validated; invalid folds are skipped silently to avoid
  // crashing on stale config — the UI filters folds anyway)
  for (const layer of config.layers) {
    if (!isLayerFoldValid(config.outerFold, layer.fold)) continue
    const r = baseScale * Math.max(0.05, Math.min(1, layer.scale))
    const step = layer.rotationStep ?? 0
    const layerPhi = phi + (step * Math.PI) / layer.fold
    polygons.push(createPolygon(layer.fold, center, r, layerPhi))
  }

  return polygons
}
