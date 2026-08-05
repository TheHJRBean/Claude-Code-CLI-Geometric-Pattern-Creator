import type { Vec2 } from '../utils/math'
import type { ColourRecord } from '../types/editor'
import type { StrandData } from '../strand/buildStrands'
import { buildColourIndex, orbitOffset, resolveColour, type ColourIndex } from './scopes'
import { cellOrbitKey, reduceToOrbit, type CellFrame } from './cellScope'
import { strandIdentity } from './strandGroups'

/**
 * What colour is *this* Strand — the per-chain half of the Decoration colour
 * ladder, shared by everything that needs the answer.
 *
 * `StrandLayer` owns the rest of the rendering (per-edge strokes for chains
 * that span several congruent classes, weave cuts, gradients), but the
 * per-chain resolution is exactly the same question a **junction ornament**
 * asks when it is set to match the Strands it sits on. Extracted so the two
 * cannot drift: an ornament that resolved the ladder even slightly differently
 * would sit on the line work in *almost* its colour, which is worse than an
 * obviously different one.
 */
export interface StrandColourContext {
  idx: ColourIndex
  /** Lattice translations for the `patch` rung. */
  ring: Vec2[]
  /** Cell symmetry frames for the `cell` rung; absent ⇒ the rung never matches. */
  cellFrames?: CellFrame[]
  /** The colour a Strand takes when no record reaches it. */
  fallback: string
}

/**
 * Build the context, or null when no record can apply — the common case (a
 * single global colour, every Gallery pattern), which lets callers skip the
 * whole per-chain walk.
 */
export function strandColourContext(
  records: readonly ColourRecord[] | undefined,
  ring: Vec2[],
  cellFrames: CellFrame[] | undefined,
  fallback: string,
): StrandColourContext | null {
  if (!records || records.length === 0) return null
  const idx = buildColourIndex(records as ColourRecord[])
  if (idx.starColour === null && idx.bySignature.size === 0 && !idx.hasPositioned) return null
  return { idx, ring, cellFrames, fallback }
}

/**
 * The colour of one Strand. `signature` overrides the chain's own identity
 * where the caller has a base-fragment class for it (stamped fields chain
 * ACROSS stamps and truncate at the Frame, so a rendered chain's own signature
 * is field-dependent — see `strandGroups.ts`).
 *
 * The sentinel `'none'` is a real answer, not an absence: it is how a removed
 * strand paint hides the line work, and a caller matching the Strands must
 * honour it (an ornament on a hidden Strand should be hidden too).
 */
export function strandColour(
  ctx: StrandColourContext,
  chain: StrandData,
  signature?: string | null,
): string {
  const id = strandIdentity(chain.points)
  const sig = signature ?? id.signature
  const off = orbitOffset(id.centroid, ctx.ring)
  // Cell-rung key only when cell records exist — it walks every dihedral image.
  const cellKey = ctx.idx.cell.size > 0 && ctx.cellFrames
    ? cellOrbitKey(sig, reduceToOrbit(chain.points, id.centroid, off), id.closed, off, ctx.cellFrames)
    : null
  // World-instance strand records aren't produced by the UI (a "single" strand
  // is its patch orbit), so no world centroid is passed.
  return resolveColour(ctx.idx, sig, off, null, cellKey) ?? ctx.fallback
}
