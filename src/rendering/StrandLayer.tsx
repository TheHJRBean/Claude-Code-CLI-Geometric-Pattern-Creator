import { useMemo } from 'react'
import type { Segment } from '../types/geometry'
import type { PatternConfig } from '../types/pattern'
import { buildStrands } from '../strand/buildStrands'
import { computeCurves, smoothCurves } from '../strand/computeCurves'
import { curvedPathD } from '../strand/curvedPathD'

interface Props {
  segments: Segment[]
  config: PatternConfig
  /**
   * Step 17.6d — when defined, every Strand whose source segments are wholly
   * owned by these ids is treated as a neighbour-stamp ghost and rendered
   * greyed out below the live Strand layer. Strands that touch at least one
   * seed polygon stay at full colour so the cross-boundary flow visualisation
   * still reads.
   */
  ghostPolygonIds?: Set<string>
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
export function StrandLayer({ segments, config, ghostPolygonIds }: Props) {
  const { strand } = config

  const strandData = useMemo(() => buildStrands(segments), [segments])
  const curvedStrands = useMemo(() => {
    const raw = computeCurves(strandData, segments, config)
    return config.smoothTransitions ? raw.map(smoothCurves) : raw
  }, [strandData, segments, config])
  const paths = useMemo(() => curvedStrands.map(cs => curvedPathD(cs)), [curvedStrands])
  // A Strand is "ghost" only if every one of its source segments belongs to a
  // ghost polygon. Strands that bridge a seed polygon and a ghost (the ones
  // demonstrating cross-boundary Strand flow) stay seed-coloured.
  const isGhostStrand = useMemo(() => {
    if (!ghostPolygonIds || ghostPolygonIds.size === 0) return null
    return strandData.map(sd =>
      sd.segmentIndices.every(idx => ghostPolygonIds.has(segments[idx].polygonId))
    )
  }, [strandData, segments, ghostPolygonIds])

  if (paths.length === 0) return null

  const ghostIndices: number[] = []
  const seedIndices: number[] = []
  for (let i = 0; i < paths.length; i++) {
    if (isGhostStrand && isGhostStrand[i]) ghostIndices.push(i)
    else seedIndices.push(i)
  }

  return (
    <g id="strand-layer">
      {ghostIndices.length > 0 && (
        <g opacity={0.3}>
          {ghostIndices.map(i => (
            <path
              key={`strand-ghost-${i}`}
              d={paths[i]}
              fill="none"
              stroke={strand.color}
              strokeWidth={strand.width}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </g>
      )}
      {seedIndices.map(i => (
        <path
          key={`strand-${i}`}
          d={paths[i]}
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
