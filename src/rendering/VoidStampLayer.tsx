import { memo } from 'react'
import type { StampPlacement } from '../decoration/stamps'
import { polygonPath } from './svgGeometry'

/**
 * Decoration **Void Stamp** layer — draws each stamped Void's image clipped
 * to the Void outline. Rendered directly after the Void fills (so stamps sit
 * over fills but under the Strands, same ADR-0005 stack). On the periodic
 * fast-path it renders INSIDE the cloned fragment so `<use>` tiles it; the
 * clip paths are fragment-local coords and translate with each clone.
 *
 * The `<image>` is laid out in the Void's canonical pose (see
 * `decoration/stamps.ts`) and carried to the instance by a rigid(-or-
 * reflected) `matrix(...)` — one uploaded asset lands consistently on every
 * congruent Void.
 */
export const VoidStampLayer = memo(function VoidStampLayer({
  placements,
  idPrefix = 'void-stamp',
}: {
  placements: StampPlacement[]
  /** Unique per mount point — clip-path ids are document-global. */
  idPrefix?: string
}) {
  if (placements.length === 0) return null
  return (
    <g pointerEvents="none">
      <defs>
        {placements.map((p, i) => (
          <clipPath key={i} id={`${idPrefix}-${i}`} clipPathUnits="userSpaceOnUse">
            <path d={polygonPath(p.clip)} />
          </clipPath>
        ))}
      </defs>
      {placements.map((p, i) => (
        <g key={`img-${i}`} clipPath={`url(#${idPrefix}-${i})`}>
          <image
            href={p.image}
            x={p.rect.x}
            y={p.rect.y}
            width={p.rect.width}
            height={p.rect.height}
            preserveAspectRatio="none"
            transform={`matrix(${p.transform.a} ${p.transform.b} ${p.transform.c} ${p.transform.d} ${p.transform.e} ${p.transform.f})`}
          />
        </g>
      ))}
    </g>
  )
})
