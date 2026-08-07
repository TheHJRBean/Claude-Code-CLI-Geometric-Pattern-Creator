import { describe, expect, it } from 'vitest'
import { choosePickerPlacement, type Rect } from './pickerPlacement'

const POPUP = { width: 300, height: 180 }
const BOUNDS = { width: 1200, height: 800 }

function rectOf(p: { left: number; top: number }): Rect {
  return { x: p.left, y: p.top, width: POPUP.width, height: POPUP.height }
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width
    && a.y < b.y + b.height && b.y < a.y + a.height
}

describe('choosePickerPlacement', () => {
  it('keeps the historical spot — centred above the Anchor — with nothing to clear', () => {
    const p = choosePickerPlacement({ anchor: { x: 600, y: 400 }, popup: POPUP, bounds: BOUNDS })
    expect(p.left).toBe(600 - POPUP.width / 2)
    expect(p.top).toBe(400 - 18 - POPUP.height)
    expect(p.arrowSide).toBe('bottom')
    expect(p.arrowOffset).toBe(POPUP.width / 2)
  })

  it('clears a preview Tile drawn around the Anchor', () => {
    const avoid: Rect = { x: 500, y: 300, width: 200, height: 200 }
    const p = choosePickerPlacement({ anchor: { x: 600, y: 400 }, popup: POPUP, bounds: BOUNDS, avoid })
    expect(overlaps(rectOf(p), avoid)).toBe(false)
  })

  it('clears a preview far wider than the Anchor neighbourhood', () => {
    // A dodecagon at high zoom: stepping just past the Anchor stays inside it,
    // so only a candidate measured off the preview's own edge gets clear.
    const avoid: Rect = { x: 350, y: 250, width: 500, height: 300 }
    const p = choosePickerPlacement({ anchor: { x: 600, y: 400 }, popup: POPUP, bounds: BOUNDS, avoid })
    expect(overlaps(rectOf(p), avoid)).toBe(false)
  })

  it('stays inside the canvas when the Anchor is in a corner', () => {
    const avoid: Rect = { x: 0, y: 0, width: 160, height: 160 }
    const p = choosePickerPlacement({ anchor: { x: 20, y: 20 }, popup: POPUP, bounds: BOUNDS, avoid })
    expect(p.left).toBeGreaterThanOrEqual(8)
    expect(p.top).toBeGreaterThanOrEqual(8)
    expect(p.left + POPUP.width).toBeLessThanOrEqual(BOUNDS.width - 8)
    expect(p.top + POPUP.height).toBeLessThanOrEqual(BOUNDS.height - 8)
  })

  it('takes the least-covered spot when the preview fills the canvas', () => {
    // Nothing can be fully clear — the popup must not simply give up and sit in
    // the middle of the preview.
    const avoid: Rect = { x: 0, y: 0, width: BOUNDS.width, height: BOUNDS.height }
    const p = choosePickerPlacement({ anchor: { x: 600, y: 400 }, popup: POPUP, bounds: BOUNDS, avoid })
    const r = rectOf(p)
    expect(r.x).toBeGreaterThanOrEqual(8)
    expect(r.y).toBeGreaterThanOrEqual(8)
    // Every candidate is covered equally, so preference order holds: above.
    expect(r.y + r.height).toBeLessThanOrEqual(400)
  })

  it('points the arrow at the Anchor from whichever side it settles on', () => {
    // Anchor near the top edge: the popup can't go above it, so it lands below
    // and the arrow flips to the popup's top edge.
    const avoid: Rect = { x: 540, y: 10, width: 120, height: 120 }
    const p = choosePickerPlacement({ anchor: { x: 600, y: 40 }, popup: POPUP, bounds: BOUNDS, avoid })
    expect(p.top).toBeGreaterThan(40)
    expect(p.arrowSide).toBe('top')
    expect(p.arrowOffset).toBeGreaterThanOrEqual(16)
    expect(p.arrowOffset).toBeLessThanOrEqual(POPUP.width - 16)
  })

  it('does not settle on top of the Anchor when clamping would slide it there', () => {
    // Anchor close to the canvas top: the above-anchor spot clamps down over
    // the Anchor itself, which hides the very edge/vertex that was clicked.
    const p = choosePickerPlacement({ anchor: { x: 600, y: 120 }, popup: POPUP, bounds: BOUNDS })
    const r = rectOf(p)
    const covers = 600 >= r.x && 600 <= r.x + r.width && 120 >= r.y && 120 <= r.y + r.height
    expect(covers).toBe(false)
    expect(p.arrowSide).not.toBeNull()
  })

  it('drops the arrow when nothing else clears and the Anchor ends up covered', () => {
    // Tiny canvas: every candidate clamps onto the Anchor, so an arrow could
    // only point away from it.
    const p = choosePickerPlacement({
      anchor: { x: 160, y: 100 },
      popup: POPUP,
      bounds: { width: 320, height: 200 },
    })
    expect(p.arrowSide).toBeNull()
  })

  it('never puts the arrow past the popup corners', () => {
    // Anchor far off to one side of a clamped popup.
    const p = choosePickerPlacement({
      anchor: { x: 1190, y: 780 },
      popup: POPUP,
      bounds: BOUNDS,
      avoid: { x: 1000, y: 600, width: 200, height: 200 },
    })
    const along = p.arrowSide === 'top' || p.arrowSide === 'bottom' ? POPUP.width : POPUP.height
    expect(p.arrowOffset).toBeGreaterThanOrEqual(16)
    expect(p.arrowOffset).toBeLessThanOrEqual(along - 16)
  })

  it('is stable — same input, same answer', () => {
    const args = {
      anchor: { x: 600, y: 400 },
      popup: POPUP,
      bounds: BOUNDS,
      avoid: { x: 500, y: 300, width: 200, height: 200 },
    }
    expect(choosePickerPlacement(args)).toEqual(choosePickerPlacement(args))
  })
})
