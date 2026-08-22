import type { Action } from './actions'
import type { FrameConfig, FrameStroke } from '../types/editor'
import type { StrandStyle } from '../types/pattern'

/**
 * **Link stroke design** — keep the Frame border and the Strands wearing the
 * same divided-stroke design, edited from either end.
 *
 * Like "Apply to all Tiles" (`figureBroadcast.ts`) this is a **dispatch-layer
 * fan-out, not a reducer feature**, and for the same reasons: the toggle is an
 * editing mode (session state, never `PatternConfig`, so not subject to the
 * `PATTERN_CONFIG_KEYS` two-site rule), and expanding here means every path
 * that edits either stroke obeys it while both reducers keep their existing
 * single-target contracts.
 *
 * The derived action is dispatched alongside the original, never back through
 * the wrapper, so there is no ping-pong to guard against.
 */

/**
 * The fields that make up a stroke's **design**, and the whole of what the
 * link copies.
 *
 * Width and the base colour are deliberately NOT here. They are the two
 * quantities the two surfaces genuinely do not share: a Frame border is a
 * picture frame and runs an order of magnitude wider than the line work it
 * surrounds (120 vs a typical 4), and the Strand colour is under the
 * Decoration phase's own per-Strand records, which a border edit has no
 * business overwriting. Linking those would make the toggle unusable for the
 * thing it is for — matching the *pattern* of lines and gaps.
 */
export const STROKE_DESIGN_KEYS = [
  'lineStyle',
  'lineCount',
  'styleRatio',
  'innerFill',
  'gapFills',
  'gapFillMode',
  'lineFills',
  'lineFillMode',
] as const

export type StrokeDesignKey = typeof STROKE_DESIGN_KEYS[number]
export type StrokeDesign = Partial<Pick<StrandStyle, StrokeDesignKey>>

/** Everything in `STROKE_DESIGN_KEYS` that `src` actually carries. */
export function pickStrokeDesign(src: Partial<StrandStyle> | FrameStroke | undefined): StrokeDesign {
  const out: StrokeDesign = {}
  if (!src) return out
  for (const k of STROKE_DESIGN_KEYS) {
    if (k in src) (out as Record<string, unknown>)[k] = (src as Record<string, unknown>)[k]
  }
  return out
}

/** True when two designs would draw differently. Compared field by field with
 *  a JSON round-trip on the two array fields, which is enough: their entries
 *  are colour strings and `null`. */
function designsDiffer(a: StrokeDesign, b: StrokeDesign): boolean {
  return STROKE_DESIGN_KEYS.some(k => JSON.stringify(a[k]) !== JSON.stringify(b[k]))
}

/** What the link needs to know about the world to build the mirror action. */
export interface StrokeLinkContext {
  /** The Frame as it stands, so a strand-side edit can be merged onto it. */
  frame: FrameConfig | null | undefined
  /**
   * Which action writes that Frame. A Patch authors `editor.frame`
   * (`SET_FRAME`); a legacy substrate authors the top-level `config.frame`
   * (`SET_GALLERY_FRAME`). Sending the wrong one writes a Frame the substrate
   * never reads, which looks exactly like the link doing nothing.
   */
  frameAction: 'SET_FRAME' | 'SET_GALLERY_FRAME'
}

/**
 * Expand `action` into the list to dispatch, source action first.
 *
 * Returns `[action]` untouched when the toggle is off, when the action edits
 * neither stroke, or when the edit carried no design change — a Frame action
 * is a whole `FrameConfig`, so moving the Frame or resizing it dispatches one
 * of these on every drag frame and must not drag the Strand style along.
 *
 * A strand-side edit needs a border to land on: with no Frame, or a Frame
 * whose border stroke was never enabled, there is nothing to write and the
 * action passes through alone.
 */
export function linkStrokeAction(
  action: Action,
  enabled: boolean,
  ctx: StrokeLinkContext,
): Action[] {
  if (!enabled) return [action]

  if (action.type === 'SET_STRAND_STYLE') {
    const design = pickStrokeDesign(action.payload as Partial<StrandStyle>)
    if (Object.keys(design).length === 0) return [action]
    const stroke = ctx.frame?.stroke
    if (!ctx.frame || !stroke) return [action]
    return [action, {
      type: ctx.frameAction,
      payload: { ...ctx.frame, stroke: { ...stroke, ...design } },
    } as Action]
  }

  if (action.type === 'SET_FRAME' || action.type === 'SET_GALLERY_FRAME') {
    const next = action.payload as FrameConfig | null
    if (!next?.stroke) return [action]
    const before = pickStrokeDesign(ctx.frame?.stroke)
    const after = pickStrokeDesign(next.stroke)
    if (!designsDiffer(before, after)) return [action]
    return [action, { type: 'SET_STRAND_STYLE', payload: after } as Action]
  }

  return [action]
}

/** Exposed for bug capture: would this action fan out under the link? */
export function isLinkableStrokeAction(action: Action): boolean {
  return action.type === 'SET_STRAND_STYLE'
    || action.type === 'SET_FRAME'
    || action.type === 'SET_GALLERY_FRAME'
}
