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
 * Half-pixel bleed that closes the antialiasing seam between abutting Voids.
 *
 * Two Voids sharing an edge each cover ~half of every pixel along it, and two
 * half-covered composites don't add up to full coverage — so the background
 * shows through as a hairline tracing the entire strand skeleton. Most visible
 * exactly where it should be least: strands removed ("Remove strand colour")
 * and one flat colour over the whole field, which is meant to read as solid.
 * Measured on floret-pentagonal: **2.95%** of a central sample block was
 * part-covered seam pixel, falling to **0.001%** with this stroke.
 *
 * Stroking each fill with its own paint grows it by half this width, so
 * neighbours overlap instead of abutting. `non-scaling-stroke` keeps it 1
 * device pixel — the artefact is screen-space, so the correction is too: the
 * geometry is untouched at every zoom, and a raster export at any resolution
 * gets the same one-pixel overlap rather than a bleed that grows with it.
 */
const SEAM_STROKE_PX = 1

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
      {fills.map((f, i) => {
        const paint = f.gradient ? (f.pose ? `url(#${idPrefix}-g${i})` : `url(#${frameId})`) : f.colour
        return (
          <path
            key={i}
            d={polygonPath(f.polygon)}
            fill={paint}
            // Same paint as the fill (a gradient `url(...)` strokes fine), so
            // the bleed is invisible except where it closes the seam.
            stroke={paint}
            strokeWidth={SEAM_STROKE_PX}
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
          />
        )
      })}
    </g>
  )
})
