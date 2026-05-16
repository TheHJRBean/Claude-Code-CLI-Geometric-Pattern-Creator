import { useMemo } from 'react'
import type { Segment } from '../types/geometry'
import type { PatternConfig } from '../types/pattern'
import { buildStrands } from '../strand/buildStrands'
import { computeCurves, smoothCurves } from '../strand/computeCurves'
import { curvedPathD } from '../strand/curvedPathD'

interface Props {
  segments: Segment[]
  config: PatternConfig
}

/**
 * Render every Strand as a single continuous SVG path.
 *
 * Lacing (the over/under interlace effect) was removed in Phase 6 of the
 * context refactor — the legacy two-pass renderer was broken in production
 * and never produced a coherent interlace (see `feedback_lacing.md`).
 * Lacing returns under the Decoration Phase per ADR-0003 and
 * `project_decoration_stage_idea.md`.
 */
export function StrandLayer({ segments, config }: Props) {
  const { strand } = config

  const strandData = useMemo(() => buildStrands(segments), [segments])
  const curvedStrands = useMemo(() => {
    const raw = computeCurves(strandData, segments, config)
    return config.smoothTransitions ? raw.map(smoothCurves) : raw
  }, [strandData, segments, config])
  const paths = useMemo(() => curvedStrands.map(cs => curvedPathD(cs)), [curvedStrands])

  if (paths.length === 0) return null

  return (
    <g id="strand-layer">
      {paths.map((d, i) => (
        <path
          key={`strand-${i}`}
          d={d}
          fill="none"
          stroke={strand.color}
          strokeWidth={strand.width}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </g>
  )
}
