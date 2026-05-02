import type { Polygon, Segment } from '../types/geometry'
import type { MandalaConfig, PatternConfig } from '../types/pattern'
import { runPIC } from '../pic/index'
import { defaultContactAngleForFold, isLayerFoldValid } from './mandala'

/**
 * Specialised strand renderer for the layered-mandala tessellation.
 *
 * Each layer (= one regular polygon centred at origin) gets its own PIC
 * contact angle, independent of the per-tile-type `figures` map that the
 * generic `runPIC` consumes. Per layer, we synthesise a one-polygon
 * `PatternConfig` and call `runPIC([poly], synthConfig)`, then
 * concatenate the segments.
 *
 * Polygons are expected to come from `generateMandala()` in their
 * canonical order: outer ring first, then layers in the order declared
 * in `MandalaConfig.layers`.
 */
export function runMandalaPIC(
  polygons: Polygon[],
  mandala: MandalaConfig,
  baseConfig: PatternConfig,
): Segment[] {
  if (polygons.length === 0) return []

  const layerAngles: number[] = [
    mandala.outerContactAngle ?? defaultContactAngleForFold(mandala.outerFold),
  ]
  for (const layer of mandala.layers) {
    if (!isLayerFoldValid(mandala.outerFold, layer.fold)) continue
    layerAngles.push(layer.contactAngle ?? defaultContactAngleForFold(layer.fold))
  }

  const out: Segment[] = []
  for (let i = 0; i < polygons.length; i++) {
    const poly = polygons[i]
    const angle = layerAngles[i] ?? defaultContactAngleForFold(poly.sides)
    const synthConfig: PatternConfig = {
      ...baseConfig,
      figures: {
        [poly.tileTypeId]: {
          type: 'star',
          contactAngle: angle,
          lineLength: 1,
          autoLineLength: true,
        },
      },
    }
    out.push(...runPIC([poly], synthConfig))
  }
  return out
}
