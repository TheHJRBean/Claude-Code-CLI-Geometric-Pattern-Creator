import type { Vec2 } from '../utils/math'
import type { DecorationConfig } from '../types/editor'
import { extractVoids } from './voids'

/**
 * Step 19.2 — turn the persisted Stage-1 `DecorationConfig` into render-ready
 * props (ADR-0005). Pure: no React, no DOM. The Decoration render path is
 *
 *   segments + bound + decoration  →  resolveDecoration  →  { fills, strandColor }
 *
 * and the SVG layer stack draws `fills` *behind* the Strands, with the Strands
 * stroked in `strandColor` (falling back to the global `StrandStyle.color`).
 */

export interface VoidFill {
  /** CCW outline of a Void to paint. */
  polygon: Vec2[]
  /** CSS colour. */
  colour: string
}

export interface ResolvedDecoration {
  /** Voids whose congruent signature matched a Fill record, with their colour. */
  fills: VoidFill[]
  /** Resolved Strand stroke colour, or null ⇒ caller uses `StrandStyle.color`. */
  strandColor: string | null
}

const EMPTY: ResolvedDecoration = { fills: [], strandColor: null }

/**
 * Resolve Stage-1 (Congruent-scope) decoration over the given `segments`
 * (rendered Rays) bounded by the convex `bound` outline (Frame outline or
 * viewport bbox).
 *
 * - **Void Fill**: extract the Voids inside `bound`, then colour each whose
 *   congruent `signature` matches a `congruent`-scope `voidFills` record.
 * - **Strand colour**: the single `congruent`-scope `strandColours` record
 *   (`key: '*'`) overrides the global; absent ⇒ null.
 *
 * Void extraction (the costly step) is skipped entirely when there are no Fill
 * records to apply.
 */
export function resolveDecoration(
  segments: { from: Vec2; to: Vec2 }[],
  bound: Vec2[],
  decoration: DecorationConfig | undefined,
): ResolvedDecoration {
  if (!decoration) return EMPTY

  const strandRec = decoration.strandColours.find(r => r.scope === 'congruent')
  const strandColor = strandRec ? strandRec.colour : null

  const congruentFills = decoration.voidFills.filter(r => r.scope === 'congruent')
  if (congruentFills.length === 0 || bound.length < 3) {
    return { fills: [], strandColor }
  }

  const colourBySignature = new Map(congruentFills.map(r => [r.key, r.colour]))
  const fills: VoidFill[] = []
  for (const v of extractVoids(segments, bound)) {
    const colour = colourBySignature.get(v.signature)
    if (colour) fills.push({ polygon: v.polygon, colour })
  }
  return { fills, strandColor }
}
