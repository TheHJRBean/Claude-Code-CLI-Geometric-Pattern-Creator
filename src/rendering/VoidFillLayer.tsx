import { memo } from 'react'
import type { VoidFill } from '../decoration/resolve'
import type { GradientSpec } from '../types/editor'
import { sortedStops } from '../decoration/gradients'
import { polygonPath } from './svgGeometry'

/** One `<linearGradient>` / `<radialGradient>` def. `transform` carries a
 * per-shape gradient through its canonical→instance isometry; the world-space
 * frame gradient (#45) passes none (geometry is already in world coords). */
function gradientDef(g: GradientSpec, id: string, transform?: string) {
  const stops = sortedStops(g.stops).map((s, j) => (
    <stop key={j} offset={s.offset} stopColor={s.colour} />
  ))
  return g.type === 'linear'
    ? (
      <linearGradient
        key={id} id={id} gradientUnits="userSpaceOnUse"
        x1={g.start.x} y1={g.start.y} x2={g.end.x} y2={g.end.y}
        gradientTransform={transform}
      >
        {stops}
      </linearGradient>
    )
    : (
      <radialGradient
        key={id} id={id} gradientUnits="userSpaceOnUse"
        cx={g.centre.x} cy={g.centre.y} r={g.radius}
        gradientTransform={transform}
      >
        {stops}
      </radialGradient>
    )
}

/**
 * Step 19.2 — Decoration **Void Fill** layer. Paints each resolved Void as a
 * filled polygon. Drawn *behind* the Strands (ADR-0005 layer stack:
 * background → Void fills → Strands), so the strand lines stay crisp on top.
 * Unfilled Voids draw nothing and show the canvas background through.
 *
 * Two gradient kinds (DECORATION_GRADIENTS_SPEC):
 * - **Per-shape** (`gradient` + `pose`): one def per instance, geometry in the
 *   Void's canonical pose carried through the instance isometry via
 *   `gradientTransform` — one spec lands consistently rotated/mirrored on every
 *   congruent Void.
 * - **Across-frame underlay** (`gradient`, no `pose`, #45): one SHARED
 *   world-space def referenced by every unpainted Void, so the wash is
 *   continuous across the composition rather than repeating per Void.
 *
 * `userSpaceOnUse` + defs inside this group keep the periodic fast-path correct
 * for per-shape gradients (a `<use>` clone's user space includes the clone
 * translation). The frame underlay disqualifies the fast-path (usePattern), so
 * it only ever renders on the world-space path. Ids are document-global —
 * `idPrefix` must be unique per mount point.
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
  // Per-shape (canonical-pose) gradient defs — one per instance.
  const poseDefs = fills.map((f, i) =>
    f.gradient && f.pose
      ? gradientDef(f.gradient, `${idPrefix}-g${i}`, `matrix(${f.pose.a} ${f.pose.b} ${f.pose.c} ${f.pose.d} ${f.pose.e} ${f.pose.f})`)
      : null,
  )
  // Across-frame underlay: all such fills share one world-space spec, so mint
  // exactly one shared def and point every underlay Void at it.
  const frameSpec = fills.find(f => f.gradient && !f.pose)?.gradient
  const frameId = `${idPrefix}-frame`
  const hasDefs = frameSpec !== undefined || poseDefs.some(d => d !== null)
  return (
    <g id="void-fill-layer">
      {hasDefs && (
        <defs>
          {poseDefs}
          {frameSpec && gradientDef(frameSpec, frameId)}
        </defs>
      )}
      {fills.map((f, i) => (
        <path
          key={i}
          d={polygonPath(f.polygon)}
          fill={f.gradient ? (f.pose ? `url(#${idPrefix}-g${i})` : `url(#${frameId})`) : f.colour}
          stroke="none"
        />
      ))}
    </g>
  )
})
