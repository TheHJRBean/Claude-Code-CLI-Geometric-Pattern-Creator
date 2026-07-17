import type { FigureConfig, MorphBoundary, MorphConfig, PatternConfig } from '../types/pattern'
import type { Vec2 } from '../utils/math'
import type { WorldBounds } from './guides'
import { activeMorph, morphFieldValue } from '../pic/morph'
import { editorTileTypes } from './tileTypes'

/**
 * Step 20 (slice 2) — Builder-side authoring helpers for a Morph
 * (PATTERN_MORPH_SPEC.md §UI). Pure logic consumed by the reducer
 * (`ADD_MORPH_BOUNDARY`) and the sidebar/canvas UI; the field-evaluation
 * engine itself lives in `pic/morph.ts` and is untouched by this slice.
 */

/** A freshly-enabled Morph with no Boundaries yet — Linear, origin at the
 *  Patch origin, direction along +x. */
export function createDefaultMorph(): MorphConfig {
  return {
    enabled: true,
    mode: 'linear',
    origin: { x: 0, y: 0 },
    direction: { x: 1, y: 0 },
    easing: 'linear',
    boundaries: [],
  }
}

/** Every tileTypeId the Morph should carry a slider for — the Patch's
 *  current tile types (falls back to `config.figures`' keys when there's no
 *  editor Patch, so the helper degrades gracefully rather than throwing). */
function morphTileTypeIds(config: PatternConfig): string[] {
  if (config.editor) return editorTileTypes(config.editor).map(t => t.id)
  return Object.keys(config.figures)
}

/**
 * A fresh Morph Boundary at `position`, pre-filled with the field's CURRENT
 * effective values there — spec: "a new Boundary is pre-filled from the
 * effective values at its position (so adding one changes nothing until
 * dragged)". Evaluates the field as it stands BEFORE this Boundary is
 * inserted (the caller inserts it after), so a piecewise-linear blend that
 * already passes through this point is reproduced exactly.
 */
export function buildMorphBoundary(config: PatternConfig, position: number): MorphBoundary {
  const morph = activeMorph(config)
  const tileTypeIds = morphTileTypeIds(config)
  const figures: Record<string, Partial<FigureConfig>> = {}
  for (const id of tileTypeIds) {
    const fig = config.figures[id]
    if (!fig) continue
    const overlay: Partial<FigureConfig> = {
      contactAngle: morph
        ? morphFieldValue(morph, id, 'contactAngle', fig.contactAngle, position)
        : fig.contactAngle,
    }
    if (fig.vertexLinesDecoupled) {
      const startV = fig.vertexContactAngle ?? fig.contactAngle
      overlay.vertexContactAngle = morph
        ? morphFieldValue(morph, id, 'vertexContactAngle', startV, position)
        : startV
    }
    figures[id] = overlay
  }
  const count = config.morph?.boundaries.length ?? 0
  return { id: `morph-${count}-${Date.now()}`, position, figures }
}

/** Insert a Boundary and keep the array sorted ascending by `position` — the
 *  invariant `pic/morph.ts`'s field evaluation relies on. */
export function insertMorphBoundary(boundaries: MorphBoundary[], b: MorphBoundary): MorphBoundary[] {
  return [...boundaries, b].sort((a, c) => a.position - c.position)
}

/** Default position offered to a fresh "Add Boundary" click — spaces
 *  successive Boundaries out along the axis so they don't stack on the
 *  origin (the user drags them into place afterward). */
export function defaultMorphBoundaryPosition(config: PatternConfig): number {
  const edgeLength = config.editor?.edgeLength ?? 100
  const count = config.morph?.boundaries.length ?? 0
  return 4 * edgeLength * (count + 1)
}

/** Liang–Barsky clip of the infinite line `p = origin + t·dir` to `bounds`.
 *  Returns the two boundary points inside the rect, or null when the line
 *  misses it entirely. Used to draw a Linear Morph Boundary's perpendicular
 *  line across the visible canvas (always fully clipped — unlike Guide
 *  lines, a Morph Boundary has no drawn segment / `extend` variants). */
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
