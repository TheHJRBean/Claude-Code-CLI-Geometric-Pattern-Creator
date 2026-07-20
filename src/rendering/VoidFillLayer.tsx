import { memo } from 'react'
import type { VoidFill } from '../decoration/resolve'
import { polygonPath } from './svgGeometry'

/**
 * Step 19.2 — Decoration **Void Fill** layer. Paints each resolved Void as a
 * filled polygon. Drawn *behind* the Strands (ADR-0005 layer stack:
 * background → Void fills → Strands), so the strand lines stay crisp on top.
 * Unfilled Voids draw nothing and show the canvas background through.
 *
 * Gradient fills (DECORATION_GRADIENTS_SPEC) mint one `<linearGradient>` /
 * `<radialGradient>` def per instance: geometry is authored in the Void's
 * canonical pose, and `gradientTransform` carries it through the instance's
 * canonical→instance isometry — one spec lands consistently rotated/mirrored
 * on every congruent Void. `userSpaceOnUse` + defs inside this group keep the
 * periodic fast-path correct: a `<use>` clone's user space includes the clone
 * translation, so the same def tiles with the fragment (same mechanism as the
 * stamp layer's clip paths). Ids are document-global — `idPrefix` must be
 * unique per mount point.
 */
export const VoidFillLayer = memo(function VoidFillLayer({
  fills,
  idPrefix = 'void-fill',
}: {
  fills: VoidFill[]
  /** Unique per mount point — gradient def ids are document-global. */
  idPrefix?: string
}) {
  if (fills.length === 0) return null
  const gradientDefs = fills.map((f, i) => {
    if (!f.gradient || !f.pose) return null
    const g = f.gradient
    const m = f.pose
    const gradientTransform = `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e} ${m.f})`
    const stops = g.stops.map((s, j) => (
      <stop key={j} offset={s.offset} stopColor={s.colour} />
    ))
    return g.type === 'linear'
      ? (
        <linearGradient
          key={i}
          id={`${idPrefix}-g${i}`}
          gradientUnits="userSpaceOnUse"
          x1={g.start.x} y1={g.start.y} x2={g.end.x} y2={g.end.y}
          gradientTransform={gradientTransform}
        >
          {stops}
        </linearGradient>
      )
      : (
        <radialGradient
          key={i}
          id={`${idPrefix}-g${i}`}
          gradientUnits="userSpaceOnUse"
          cx={g.centre.x} cy={g.centre.y} r={g.radius}
          gradientTransform={gradientTransform}
        >
          {stops}
        </radialGradient>
      )
  })
  const hasDefs = gradientDefs.some(d => d !== null)
  return (
    <g id="void-fill-layer">
      {hasDefs && <defs>{gradientDefs}</defs>}
      {fills.map((f, i) => (
        <path
          key={i}
          d={polygonPath(f.polygon)}
          fill={f.gradient && f.pose ? `url(#${idPrefix}-g${i})` : f.colour}
          stroke="none"
        />
      ))}
    </g>
  )
})
