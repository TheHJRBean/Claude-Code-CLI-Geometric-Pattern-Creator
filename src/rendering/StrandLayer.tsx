import { memo, useMemo } from 'react'
import type { Segment } from '../types/geometry'
import type { PatternConfig } from '../types/pattern'
import { buildStrands } from '../strand/buildStrands'
import { computeCurves, smoothCurves } from '../strand/computeCurves'
import { curvedPathD, curvedPathDSplit } from '../strand/curvedPathD'
import { recordPerf } from '../utils/perf'

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
  /**
   * Step 19.2 — Decoration **Strand colour** override. When set, every Strand
   * is stroked in this colour instead of `config.strand.color` (which stays the
   * fallback / Gallery default). Stage-1 Congruent scope applies one colour to
   * all Strands; the per-class/instance rungs land later.
   */
  strokeColor?: string
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
export const StrandLayer = memo(function StrandLayer({ segments, config, ghostPolygonIds, strokeColor }: Props) {
  const { strand } = config
  const stroke = strokeColor ?? strand.color

  const strandData = useMemo(() => {
    const t0 = performance.now()
    const r = buildStrands(segments)
    recordPerf({ strandMs: performance.now() - t0 })
    return r
  }, [segments])
  const curvedStrands = useMemo(() => {
    const raw = computeCurves(strandData, segments, config)
    return config.smoothTransitions ? raw.map(smoothCurves) : raw
  }, [strandData, segments, config])

  // When ghost ids exist, split each Strand per-edge by host polygon so the
  // boundary crossing produces a clean colour break — strands that bridge a
  // seed and a ghost get rendered partially full-colour (seed side) and
  // partially faded (ghost side). Otherwise emit one path per Strand.
  const { seedPaths, ghostPaths } = useMemo(() => {
    if (!ghostPolygonIds || ghostPolygonIds.size === 0) {
      return { seedPaths: curvedStrands.map(cs => curvedPathD(cs)), ghostPaths: [] as string[] }
    }
    const seeds: string[] = []
    const ghosts: string[] = []
    for (let s = 0; s < curvedStrands.length; s++) {
      const sd = strandData[s]
      const isGhostEdge = (i: number) =>
        ghostPolygonIds.has(segments[sd.segmentIndices[i]].polygonId)
      const { seedD, ghostD } = curvedPathDSplit(curvedStrands[s], isGhostEdge)
      if (seedD) seeds.push(seedD)
      if (ghostD) ghosts.push(ghostD)
    }
    return { seedPaths: seeds, ghostPaths: ghosts }
  }, [curvedStrands, strandData, segments, ghostPolygonIds])

  if (seedPaths.length === 0 && ghostPaths.length === 0) return null

  return (
    <g id="strand-layer">
      {ghostPaths.length > 0 && (
        <g opacity={0.3}>
          {ghostPaths.map((d, i) => (
            <path
              key={`strand-ghost-${i}`}
              d={d}
              fill="none"
              stroke={stroke}
              strokeWidth={strand.width}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </g>
      )}
      {seedPaths.map((d, i) => (
        <path
          key={`strand-${i}`}
          d={d}
          fill="none"
          stroke={stroke}
          strokeWidth={strand.width}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </g>
  )
})
