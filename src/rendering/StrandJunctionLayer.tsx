import { memo, useMemo } from 'react'
import type { JunctionPlacement } from '../decoration/junctionOrnaments'
import { flarePathD, ornamentPaint, ornamentPathD } from '../decoration/junctionOrnaments'
import type { JunctionOrnamentStyle } from '../types/editor'

/**
 * Decoration **junction ornaments** — the dots / stars / twinkles drawn where
 * Strands cross.
 *
 * Drawn ABOVE the strand layer: a hollow ornament has to show its own fill (or
 * the pattern) inside, which it can't if the line work is painted over it. It
 * is artwork, not scaffolding, so it lives inside the exported tree — never in
 * PatternSVG's `data-export="exclude"` overlay wrapper.
 *
 * Ornaments of one style share a single `<defs>` path and are placed with
 * `<use>`, so a field with hundreds of junctions mounts a handful of geometry
 * nodes plus one cheap clone each.
 */
export const StrandJunctionLayer = memo(function StrandJunctionLayer({
  placements,
  strandWidth,
  idPrefix = 'junction-ornament',
}: {
  placements: JunctionPlacement[]
  /** Rendered Strand stroke width (world units) — the ornament's unit of size. */
  strandWidth: number
  /** Distinct per render context (fragment vs world) so two layers in one SVG
   *  document can't collide on `<defs>` ids. */
  idPrefix?: string
}) {
  // A **twinkle** is derived from the threads at its own junction, so it can't
  // share one rotated `<defs>` path the way a dot or a star does — it is built
  // and drawn per junction. Everything else keeps the shared-geometry route.
  const flares = useMemo(() => placements
    .filter(p => p.style.shape === 'twinkle')
    .map(p => {
      const r = (p.style.size * strandWidth) / 2
      const paint = ornamentPaint(p.style, r)
      return {
        point: p.point,
        // `size` is the reach ALONG the strand here, not a diameter: a twinkle
        // has no radius, it runs up the arms.
        d: flarePathD(p.dirs, strandWidth, p.style.size * strandWidth, p.style.innerRatio ?? 0.55),
        fill: paint.fill,
        stroke: paint.stroke,
        strokeWidth: paint.strokeWidth,
      }
    })
    .filter(f => f.d.length > 0),
  [placements, strandWidth])

  // One geometry per distinct style. The key has to name everything the path
  // and its paint depend on, or two styles would share one shape.
  const { defs, ids } = useMemo(() => {
    const byKey = new Map<string, { id: string; style: JunctionOrnamentStyle }>()
    const ids: (string | null)[] = []
    for (const p of placements) {
      if (p.style.shape === 'twinkle') { ids.push(null); continue }
      const key = styleKey(p.style)
      let entry = byKey.get(key)
      if (!entry) {
        entry = { id: `${idPrefix}-${byKey.size}`, style: p.style }
        byKey.set(key, entry)
      }
      ids.push(entry.id)
    }
    const defs = [...byKey.values()].map(({ id, style }) => {
      const r = (style.size * strandWidth) / 2
      const paint = ornamentPaint(style, r)
      return (
        <path
          key={id}
          id={id}
          d={ornamentPathD(style, paint.radius)}
          fill={paint.fill}
          stroke={paint.stroke}
          strokeWidth={paint.strokeWidth || undefined}
          strokeLinejoin="round"
        />
      )
    })
    return { defs, ids }
  }, [placements, strandWidth, idPrefix])

  if (placements.length === 0) return null
  return (
    <g id={`${idPrefix}-layer`} pointerEvents="none">
      <defs>{defs}</defs>
      {placements.map((p, i) => (ids[i] === null ? null : (
        <use
          key={i}
          href={`#${ids[i]}`}
          transform={`translate(${p.point.x},${p.point.y})${p.angle ? ` rotate(${(p.angle * 180) / Math.PI})` : ''}`}
        />
      )))}
      {flares.map((f, i) => (
        <path
          key={`f${i}`}
          d={f.d}
          transform={`translate(${f.point.x},${f.point.y})`}
          fill={f.fill}
          stroke={f.stroke}
          strokeWidth={f.strokeWidth || undefined}
          strokeLinejoin="round"
        />
      ))}
    </g>
  )
})

/** Everything an ornament's drawn geometry + paint depends on. */
function styleKey(s: JunctionOrnamentStyle): string {
  return [
    s.shape, s.size, s.points ?? '', s.innerRatio ?? '', s.colour,
    s.hollow ? 1 : 0, s.hollowFill ?? '', s.outlineWidth ?? '',
  ].join('|')
}
