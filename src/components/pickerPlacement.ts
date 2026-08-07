/**
 * Where to float the placement picker so it doesn't cover what you are placing.
 *
 * The picker used to sit at a fixed `translate(-50%, calc(-100% - 18px))` above
 * the clicked Anchor. That is the right spot only while there is nothing to
 * look at: on the orientation page the candidate Tile is drawn AROUND the
 * Anchor, so the popup landed on the very preview it exists to let you judge.
 *
 * So the caller hands over a **keep-clear rect** (the preview's screen bbox)
 * and this picks the nearest side that clears it and still fits the canvas.
 * Pure, because the interesting part is the choice, not the DOM.
 */

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export type PickerSide = 'top' | 'bottom' | 'right' | 'left'

export interface PickerPlacement {
  left: number
  top: number
  /** Which edge of the popup the little pointer diamond sits on — the one
   *  facing the Anchor. `null` when the popup had to be clamped over the
   *  Anchor itself and no edge faces it; drawing one then points away from
   *  what was clicked. */
  arrowSide: PickerSide | null
  /** Distance along that edge, from the popup's left/top corner. */
  arrowOffset: number
}

export interface PickerPlacementInput {
  /** The clicked Anchor, in canvas screen coords. */
  anchor: { x: number; y: number }
  /** Measured popup size. Zero before the first measurement — the caller
   *  renders the default spot until then. */
  popup: { width: number; height: number }
  /** Canvas size, so the popup never leaves it. */
  bounds: { width: number; height: number }
  /** Screen bbox of whatever must stay visible (the Tile preview). */
  avoid?: Rect | null
  /** Clearance between popup and Anchor / keep-clear rect. */
  gap?: number
  /** Clearance between popup and the canvas edge. */
  margin?: number
}

/** Preference order: above the Anchor first, so the common no-preview case
 *  keeps the position the picker has always had. */
const SIDES: readonly PickerSide[] = ['top', 'bottom', 'right', 'left']

/** How far the arrow must stay from the popup's corners, so the diamond always
 *  has a border to sit against. */
const ARROW_INSET = 16

function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}

function clamp(v: number, lo: number, hi: number): number {
  return hi < lo ? lo : Math.min(hi, Math.max(lo, v))
}

/** Place the popup on one side of `ref`, centred on the Anchor's other axis. */
function positionOn(
  side: PickerSide,
  ref: Rect,
  { anchor, popup, bounds, gap = 18, margin = 8 }: PickerPlacementInput,
): { left: number; top: number } {
  const raw = side === 'top'
    ? { left: anchor.x - popup.width / 2, top: ref.y - gap - popup.height }
    : side === 'bottom'
      ? { left: anchor.x - popup.width / 2, top: ref.y + ref.height + gap }
      : side === 'right'
        ? { left: ref.x + ref.width + gap, top: anchor.y - popup.height / 2 }
        : { left: ref.x - gap - popup.width, top: anchor.y - popup.height / 2 }
  return {
    left: clamp(raw.left, margin, bounds.width - popup.width - margin),
    top: clamp(raw.top, margin, bounds.height - popup.height - margin),
  }
}

/**
 * Pick the popup's screen position.
 *
 * Candidates are the four sides of the Anchor and, when there is something to
 * clear, the four sides of the keep-clear rect — the latter because a preview
 * Tile can be far wider than the Anchor's own neighbourhood, and stepping just
 * past the Anchor would still land inside it. Every candidate is clamped into
 * the canvas FIRST and scored afterwards, so a candidate that only clears the
 * preview by leaving the canvas doesn't win on a technicality.
 *
 * Candidates are ranked lexicographically: least overlap with the keep-clear
 * rect (a big preview can leave nothing fully clear, and least-covered beats
 * arbitrary), then not sitting on top of the Anchor itself — clamping a
 * candidate back into the canvas can slide it over the point that was clicked
 * — then the preference order.
 */
export function choosePickerPlacement(input: PickerPlacementInput): PickerPlacement {
  const { anchor, popup, avoid } = input
  const anchorRect: Rect = { x: anchor.x, y: anchor.y, width: 0, height: 0 }
  const refs: Rect[] = avoid ? [anchorRect, avoid] : [anchorRect]

  let best: { left: number; top: number; overlap: number; covers: number; order: number } | null = null
  for (const [refIndex, ref] of refs.entries()) {
    for (const [sideIndex, side] of SIDES.entries()) {
      const { left, top } = positionOn(side, ref, input)
      const rect: Rect = { x: left, y: top, width: popup.width, height: popup.height }
      const cand = {
        left,
        top,
        overlap: avoid ? overlapArea(rect, avoid) : 0,
        covers: contains(rect, anchor) ? 1 : 0,
        // Preference within a ref, then Anchor-relative before rect-relative
        // (it sits closer to what was clicked).
        order: sideIndex + refIndex * SIDES.length,
      }
      if (!best
        || cand.overlap < best.overlap
        || (cand.overlap === best.overlap && cand.covers < best.covers)
        || (cand.overlap === best.overlap && cand.covers === best.covers && cand.order < best.order)) {
        best = cand
      }
    }
  }
  const { left, top } = best!

  // The arrow goes on the edge facing the Anchor, which after clamping is not
  // always the edge the nominal side implies — derive it from where the Anchor
  // actually ended up, and drop it when the popup had to cover the Anchor.
  const arrowSide: PickerSide | null = anchor.y <= top ? 'top'
    : anchor.y >= top + popup.height ? 'bottom'
      : anchor.x <= left ? 'left'
        : anchor.x >= left + popup.width ? 'right'
          : null
  const arrowOffset = arrowSide === 'left' || arrowSide === 'right'
    ? clamp(anchor.y - top, ARROW_INSET, popup.height - ARROW_INSET)
    : clamp(anchor.x - left, ARROW_INSET, popup.width - ARROW_INSET)

  return { left, top, arrowSide, arrowOffset }
}

function contains(rect: Rect, p: { x: number; y: number }): boolean {
  return p.x >= rect.x && p.x <= rect.x + rect.width
    && p.y >= rect.y && p.y <= rect.y + rect.height
}
