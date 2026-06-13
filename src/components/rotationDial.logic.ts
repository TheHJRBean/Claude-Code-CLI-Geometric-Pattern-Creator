/**
 * Pure angle maths for {@link RotationDial}. Extracted so the wrap-around and
 * step behaviour can be unit-tested independently of the SVG/pointer wiring.
 */

/** Normalise degrees into `[0, 360)`. */
export function normDeg(d: number): number {
  return ((d % 360) + 360) % 360
}

/**
 * Angle (degrees, `[0, 360)`) of page point `(px, py)` about dial centre
 * `(cx, cy)`. `0°` points up; angle increases clockwise (the +90 offset
 * rotates the atan2 frame so 12-o'clock reads 0).
 */
export function pointerAngle(cx: number, cy: number, px: number, py: number): number {
  return normDeg(Math.atan2(py - cy, px - cx) * (180 / Math.PI) + 90)
}

/**
 * New rotation while dragging: the signed shortest delta from `startAngle`
 * to `currentAngle`, added to the rotation captured at drag start. The
 * ±180 wrap keeps a drag past the 0/360 seam continuous.
 */
export function applyDragDelta(startAngle: number, currentAngle: number, startRotation: number): number {
  let delta = currentAngle - startAngle
  if (delta > 180) delta -= 360
  if (delta < -180) delta += 360
  return normDeg(startRotation + delta)
}

export interface WheelModifiers {
  shiftKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
}

/**
 * New rotation from a wheel tick. Step size: 0.5° with Shift (fine), 15° with
 * Ctrl/Cmd (coarse), else 1°. Scrolling down (`deltaY > 0`) increases the angle.
 */
export function wheelStep(rotation: number, deltaY: number, mods: WheelModifiers): number {
  const step = mods.shiftKey ? 0.5 : (mods.ctrlKey || mods.metaKey) ? 15 : 1
  const direction = deltaY > 0 ? 1 : -1
  return normDeg(rotation + direction * step)
}
