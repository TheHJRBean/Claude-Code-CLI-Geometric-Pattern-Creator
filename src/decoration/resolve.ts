import type { Vec2 } from '../utils/math'
import { centroid } from '../utils/math'
import type { DecorationConfig } from '../types/editor'
import { extractVoids, type VoidRegion } from './voids'
import { buildColourIndex, orbitOffset, resolveColour, scopedKey } from './scopes'
import { cellOrbitKey, reduceToOrbit, type CellFrame } from './cellScope'

/**
 * Step 19.2 / Stage 2 — turn the persisted `DecorationConfig` into
 * render-ready props (ADR-0005). Pure: no React, no DOM. The Decoration
 * render path is
 *
 *   segments + bound + decoration + stamps  →  resolveDecoration
 *     →  { fills, voids }
 *
 * where `fills` are drawn *behind* the Strands and `voids` carry the
 * per-scope identity keys the Paint overlay needs for hit-testing. Strand
 * colours resolve separately in `StrandLayer` (per-strand, from the same
 * `ColourRecord` ladder via `scopes.ts`).
 */

export interface VoidFill {
  /** CCW outline of a Void to paint. */
  polygon: Vec2[]
  /** CSS colour. */
  colour: string
}

/** A Void enriched with its Grouping-scope identity keys (ADR-0005). */
export interface PaintVoid extends VoidRegion {
  /** `patch`-scope key: signature @ Lattice-orbit offset. */
  patchKey: string
  /** `cell`-scope key: signature # host cell @ canonical symmetry-orbit
   * position (the Void + its rotation/mirror twins within the Cell). */
  cellKey: string
  /** `instance`-scope key: signature @ world centroid. */
  instanceKey: string
}

/** One Paint-overlay strand hit-target segment, carrying its strand's
 * identity so hover/click can group per scope. */
export interface StrandHit {
  from: Vec2
  to: Vec2
  /** Field-unique strand index (groups the hit segments of one strand). */
  strandId: number
  /** Congruent strand signature. */
  signature: string
  /** `patch`-scope key: signature @ Lattice-orbit offset of the strand. */
  patchKey: string
  /** `cell`-scope key (symmetry twins within the host Cell). */
  cellKey: string
}

export interface ResolvedDecoration {
  /** Voids whose identity matched a Fill record at some rung, with colour. */
  fills: VoidFill[]
  /** Every extracted Void with its scope keys (Paint-overlay hit-testing). */
  voids: PaintVoid[]
}

/**
 * Attach scope keys to already-extracted Voids and resolve their fills
 * against the record ladder. `stampTranslations` are the lattice stamp
 * offsets used to reduce a centroid to its Lattice orbit (empty ⇒ the
 * centroid is already orbit-relative, e.g. inside the periodic fragment).
 */
export function decorateVoids(
  voids: VoidRegion[],
  decoration: DecorationConfig | undefined,
  stampTranslations: Vec2[],
  cellFrames: CellFrame[] = [],
): ResolvedDecoration {
  const keyed = keyVoids(voids, stampTranslations, cellFrames)
  return { fills: colourVoids(keyed, decoration), voids: keyed }
}

/** A keyed Void carrying the raw orbit offset / centroid the colour resolver
 * needs — produced by `keyVoids`, consumed by `colourVoids`. */
export interface KeyedVoid extends PaintVoid {
  orbit: Vec2
  centre: Vec2
}

/** Key already-extracted Voids with their scope identities. The expensive
 * half of `decorateVoids` — `cellOrbitKey` canonicalises each Void's outline
 * over every dihedral image — so callers must memoise it on the FIELD, never
 * on decoration records or the Paint target. */
export function keyVoids(
  voids: VoidRegion[],
  stampTranslations: Vec2[],
  cellFrames: CellFrame[] = [],
): KeyedVoid[] {
  return voids.map(v => {
    // Identity from the straight-field outline when present (curved fields —
    // `pairCurvedOutlines`): keys then survive curve-recipe changes while
    // `polygon` still renders the curved outline.
    const kp = v.keyPolygon ?? v.polygon
    const c = centroid(kp)
    const orbit = orbitOffset(c, stampTranslations)
    return {
      ...v,
      patchKey: scopedKey(v.signature, orbit),
      cellKey: cellOrbitKey(v.signature, reduceToOrbit(kp, c, orbit), true, orbit, cellFrames),
      instanceKey: scopedKey(v.signature, c),
      orbit,
      centre: c,
    }
  })
}

/** Cheap colouring pass over keyed Voids — safe to re-run per paint or
 * record change. */
export function colourVoids(
  keyed: KeyedVoid[],
  decoration: DecorationConfig | undefined,
): VoidFill[] {
  const idx = buildColourIndex(decoration?.voidFills)
  const fills: VoidFill[] = []
  for (const v of keyed) {
    const colour = resolveColour(idx, v.signature, v.orbit, v.centre, v.cellKey)
    if (colour) fills.push({ polygon: v.polygon, colour })
  }
  return fills
}

/**
 * Resolve decoration over a field of `segments` (rendered Rays, pre-flattened
 * if curved) bounded by the convex `bound` outline (frame bbox or viewport
 * rect): extract the Voids, then key + colour them per scope.
 */
export function resolveDecoration(
  segments: { from: Vec2; to: Vec2 }[],
  bound: Vec2[],
  decoration: DecorationConfig | undefined,
  stampTranslations: Vec2[] = [],
  cellFrames: CellFrame[] = [],
): ResolvedDecoration {
  if (bound.length < 3) return { fills: [], voids: [] }
  return decorateVoids(extractVoids(segments, bound), decoration, stampTranslations, cellFrames)
}
