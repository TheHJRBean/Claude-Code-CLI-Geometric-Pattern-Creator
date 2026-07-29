import { angleDeltaDeg, normaliseAngleDeg } from '../../decoration/gradients'
import { FieldLabel, NumberStepper, segmentedButtonStyle } from './labShared'

/**
 * Precise angle control for a **linear** gradient axis — shared by all three
 * gradient surfaces (per-shape Void, across-frame, strands) and the Void focus
 * editor, so the same control behaves the same everywhere.
 *
 * Three ways in, coarse to fine: eight compass presets, a drag slider, and a
 * typed field that takes fractional degrees. Screen convention: 0° → right,
 * 90° → down.
 *
 * **Every route rotates the axis in place** — the caller applies
 * `rotateAxisTo`, which keeps the axis's midpoint and length, so an angle set
 * here re-aims a hand-dragged axis rather than discarding its extent. The
 * separate **Fit** button is the deliberate opt-in to the other behaviour:
 * re-span the axis across the whole box at the current angle (`bboxAxisAtAngle`)
 * for a full-surface wash. Omit `onFit` where there is no box to fit to.
 *
 * Radial gradients have no axis angle — callers render this only for linear.
 */
export function GradientAngleRow({ angleDeg, onAngle, onFit, fitLabel = 'Fit to frame', tooltip }: {
  angleDeg: number
  onAngle: (deg: number) => void
  /** Re-span the axis across its box at the current angle. Omitted ⇒ no button. */
  onFit?: () => void
  fitLabel?: string
  tooltip?: string
}) {
  const current = normaliseAngleDeg(angleDeg)
  const apply = (deg: number) => {
    if (Number.isFinite(deg)) onAngle(normaliseAngleDeg(deg))
  }
  // Eight compass detents. Arrows point the way the gradient runs (start→end),
  // matching the on-canvas axis direction.
  const presets: [string, number][] = [
    ['→', 0], ['↘', 45], ['↓', 90], ['↙', 135],
    ['←', 180], ['↖', 225], ['↑', 270], ['↗', 315],
  ]

  return (
    <div style={{ marginTop: 8 }}>
      <FieldLabel
        label="Angle"
        value={current.toFixed(1)}
        unit="°"
        tooltip={tooltip ?? 'Direction the gradient runs. Pick a compass preset, drag the slider, or type an exact angle (fractions allowed; 0° points right, 90° down). Setting an angle spins the axis about its own midpoint and keeps its length — use Fit to stretch it back across the whole area. Shift-drag an axis handle on the canvas to snap to 15°.'}
      />
      <div style={{ display: 'flex', gap: 0, marginBottom: 6 }}>
        {presets.map(([label, deg]) => (
          <button
            key={deg}
            onClick={() => apply(deg)}
            // Tolerance, not `===`: the angle read back off an axis is exact
            // float maths and lands an ULP away from the preset it was set to.
            style={segmentedButtonStyle(angleDeltaDeg(current, deg) < 0.05, { transition: false })}
            title={`${deg}°`}
          >
            {label}
          </button>
        ))}
      </div>
      <input
        type="range"
        min={0}
        max={360}
        step={1}
        value={Math.round(current)}
        onChange={e => apply(Number(e.target.value))}
        style={{ width: '100%', marginBottom: 6 }}
        aria-label="Gradient angle in degrees"
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <NumberStepper
          value={current}
          onChange={apply}
          min={0}
          max={360}
          step={1}
          precision={1}
          suffix="°"
          ariaLabel="Gradient angle in degrees"
        />
        {onFit && (
          <button
            onClick={onFit}
            style={{ ...segmentedButtonStyle(false, { transition: false }), flex: '1 1 0', minWidth: 0 }}
            title="Stretch the axis across the whole area at the current angle — a full-surface wash. Overwrites a hand-placed extent."
          >
            {fitLabel}
          </button>
        )}
      </div>
    </div>
  )
}
