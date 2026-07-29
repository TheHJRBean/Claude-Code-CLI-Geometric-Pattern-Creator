import type { FigureConfig, MorphConfig, MorphOrigin, MorphSides, PatternConfig } from '../types/pattern'
import type { Vec2 } from '../utils/math'
import type { WorldBounds } from './guides'
import { activeMorph, morphFieldValue } from '../pic/morph'
import { editorTileTypes } from './tileTypes'

/**
 * Step 20 (slice 2) — Builder-side authoring helpers for a Morph
 * (PATTERN_MORPH_SPEC.md §UI). Pure logic consumed by the reducer
 * (`ADD_MORPH_ORIGIN`) and the sidebar/canvas UI; the field-evaluation
 * engine itself lives in `pic/morph.ts`.
 */

/** A freshly-enabled Morph with no Origins yet — Linear, axis at the Patch
 *  origin, direction along +x. */
export function createDefaultMorph(): MorphConfig {
  return {
    enabled: true,
    mode: 'linear',
    axisOrigin: { x: 0, y: 0 },
    direction: { x: 1, y: 0 },
    easing: 'linear',
    origins: [],
  }
}

/** Reach a fresh Origin starts with — 4 edge-lengths, so the ramp spans a few
 *  tiles and reads as a gradient rather than a step on first placement. */
export function defaultMorphReach(config: PatternConfig): number {
  return 4 * (config.editor?.edgeLength ?? 100)
}

/** Slider extents, shared by `MorphPanel` and the transient
 *  `MorphOriginSlider` so the two can't drift apart. Generous: a ramp can
 *  legitimately span many tile-widths. */
export const MORPH_POSITION_RANGE = 6000
export const MORPH_REACH_RANGE = 6000

/**
 * Per-mode wording for `MorphSides`. The union is stored direction-relative
 * (`negative`/`positive` along `direction`, or inward/outward from the
 * Centre), so only the labels differ.
 */
export function morphSideLabels(mode: MorphConfig['mode']): Record<MorphSides, string> {
  return mode === 'radial'
    ? { both: 'Both', negative: 'Inside', positive: 'Outside' }
    : { both: 'Both', negative: 'Left', positive: 'Right' }
}

/** Every tileTypeId the Morph should carry a slider for — the Patch's
 *  current tile types (falls back to `config.figures`' keys when there's no
 *  editor Patch, so the helper degrades gracefully rather than throwing). */
function morphTileTypeIds(config: PatternConfig): string[] {
  if (config.editor) return editorTileTypes(config.editor).map(t => t.id)
  return Object.keys(config.figures)
}

/**
 * A fresh Morph Origin at `position`, pre-filled so that adding one changes
 * nothing until it is dragged (the spec's standing promise).
 *
 * Under the Origin model the line itself is pinned to the base recipe, so the
 * only thing to pre-fill is the TARGET at the far end. Evaluating the field
 * as it stands BEFORE this Origin is inserted, at the far end's distance,
 * reproduces the existing field through the new ramp: with no other Origins
 * that is just the base recipe (a flat, invisible addition), and next to an
 * existing Origin it starts out agreeing with its neighbour.
 */
export function buildMorphOrigin(
  config: PatternConfig,
  position: number,
  reach: number = defaultMorphReach(config),
  sides: MorphOrigin['sides'] = 'both',
): MorphOrigin {
  const morph = activeMorph(config)
  const tileTypeIds = morphTileTypeIds(config)
  // New Origins auto-fit (#49), so the ramp's far end is half the gap to the
  // nearest existing Origin — computed here from the pre-insert array so the
  // target is sampled where it will actually land.
  const autoReach = true
  const effective = autoReach ? autoReachAt(config.morph?.origins ?? [], position, reach) : reach
  // Where the target is reached — the far end of the ramp on an active side.
  const far = position + (sides === 'negative' ? -effective : effective)
  const figures: Record<string, Partial<FigureConfig>> = {}
  for (const id of tileTypeIds) {
    const fig = config.figures[id]
    if (!fig) continue
    const overlay: Partial<FigureConfig> = {
      contactAngle: morph
        ? morphFieldValue(morph, id, 'contactAngle', fig.contactAngle, far)
        : fig.contactAngle,
    }
    if (fig.vertexLinesDecoupled) {
      const startV = fig.vertexContactAngle ?? fig.contactAngle
      overlay.vertexContactAngle = morph
        ? morphFieldValue(morph, id, 'vertexContactAngle', startV, far)
        : startV
    }
    figures[id] = overlay
  }
  const count = config.morph?.origins.length ?? 0
  return { id: `morph-${count}-${Date.now()}`, position, reach, autoReach, sides, figures }
}

/**
 * The auto reach an Origin dropped at `position` would take — half the gap to
 * the nearest existing Origin on either side, or `fallback` when the Patch has
 * none. Mirrors `pic/morph.ts::originReach` for the not-yet-inserted case,
 * which can't use the sorted-neighbour shortcut.
 */
export function autoReachAt(origins: readonly MorphOrigin[], position: number, fallback: number): number {
  let best = Infinity
  for (const o of origins) {
    const gap = Math.abs(o.position - position)
    if (gap > 1e-9 && gap < best) best = gap
  }
  return best === Infinity ? fallback : best / 2
}

/** Insert an Origin and keep the array sorted ascending by `position` — the
 *  tie-break order `governingOrigin` documents. */
export function insertMorphOrigin(origins: MorphOrigin[], o: MorphOrigin): MorphOrigin[] {
  return [...origins, o].sort((a, c) => a.position - c.position)
}

/** The interval of `position` values whose Boundary is on screen. */
export interface MorphBand {
  min: number
  max: number
}

/**
 * Projection of the visible world-rect onto the Morph's distance axis — a
 * Linear Boundary's line intersects `bounds` iff its position lies between
 * the corner projections; a Radial ring iff its radius lies between the
 * rect's nearest and farthest distance from the Centre.
 */
export function visibleMorphBand(morph: MorphConfig, bounds: WorldBounds): MorphBand {
  const origin = morph.axisOrigin
  const corners: Vec2[] = [
    { x: bounds.minX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.minY },
    { x: bounds.minX, y: bounds.maxY },
    { x: bounds.maxX, y: bounds.maxY },
  ]
  if (morph.mode === 'radial') {
    const nearest = {
      x: Math.min(Math.max(origin.x, bounds.minX), bounds.maxX),
      y: Math.min(Math.max(origin.y, bounds.minY), bounds.maxY),
    }
    const far = Math.max(...corners.map(c => Math.hypot(c.x - origin.x, c.y - origin.y)))
    return { min: Math.hypot(nearest.x - origin.x, nearest.y - origin.y), max: far }
  }
  const dir = morph.direction ?? { x: 1, y: 0 }
  const ts = corners.map(c => (c.x - origin.x) * dir.x + (c.y - origin.y) * dir.y)
  return { min: Math.min(...ts), max: Math.max(...ts) }
}

/**
 * Default position offered to a fresh "Add Origin" click. The spacing rule
 * (4 edge-lengths per existing Origin, so successive Origins don't stack on
 * the axis point) holds while it lands well inside the visible band; when the
 * view is panned/zoomed so that rule would drop the new Origin off screen
 * — the "no teal line" trap — it lands at the centre of the visible band
 * instead, stepping aside from any Origin already sitting there.
 */
export function defaultMorphOriginPosition(config: PatternConfig, band?: MorphBand | null): number {
  const edgeLength = config.editor?.edgeLength ?? 100
  const count = config.morph?.origins.length ?? 0
  const spaced = 4 * edgeLength * (count + 1)
  const span = band ? band.max - band.min : 0
  if (!band || !(span > 0)) return spaced
  const lo = band.min + span * 0.1
  const hi = band.max - span * 0.1
  if (spaced >= lo && spaced <= hi) return spaced
  const positions = config.morph?.origins.map(o => o.position) ?? []
  let p = band.min + span / 2
  while (p < hi && positions.some(q => Math.abs(q - p) < span * 0.05)) p += span * 0.1
  return Math.min(p, hi)
}

/** Liang–Barsky clip of the infinite line `p = origin + t·dir` to `bounds`.
 *  Returns the two boundary points inside the rect, or null when the line
 *  misses it entirely. Used to draw a Linear Morph Origin's perpendicular
 *  line across the visible canvas (always fully clipped — unlike Guide
 *  lines, a Morph Origin has no drawn segment / `extend` variants). */
export function clipInfiniteLineToBounds(origin: Vec2, dir: Vec2, bounds: WorldBounds): { a: Vec2; b: Vec2 } | null {
  let t0 = -Infinity
  let t1 = Infinity
  const checks: Array<[number, number]> = [
    [-dir.x, origin.x - bounds.minX],
    [dir.x, bounds.maxX - origin.x],
    [-dir.y, origin.y - bounds.minY],
    [dir.y, bounds.maxY - origin.y],
  ]
  for (const [p, q] of checks) {
    if (Math.abs(p) < 1e-12) {
      if (q < 0) return null
      continue
    }
    const t = q / p
    if (p < 0) {
      if (t > t1) return null
      if (t > t0) t0 = t
    } else {
      if (t < t0) return null
      if (t < t1) t1 = t
    }
  }
  return {
    a: { x: origin.x + t0 * dir.x, y: origin.y + t0 * dir.y },
    b: { x: origin.x + t1 * dir.x, y: origin.y + t1 * dir.y },
  }
}
