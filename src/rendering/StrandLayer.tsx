import { memo, useMemo } from 'react'
import type { Segment } from '../types/geometry'
import type { PatternConfig } from '../types/pattern'
import type { ColourRecord } from '../types/editor'
import type { Vec2 } from '../utils/math'
import { buildStrands } from '../strand/buildStrands'
import { computeCurves, smoothCurves } from '../strand/computeCurves'
import { curvedPathD, curvedPathDSplit } from '../strand/curvedPathD'
import { buildColourIndex, orbitOffset, resolveColour } from '../decoration/scopes'
import { cellScopedKey, type CellFrame } from '../decoration/cellScope'
import { strandIdentity } from '../decoration/strandGroups'
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
   * Step 19 Stage 2 — Decoration **Strand colour** records. Each Strand
   * resolves its own stroke through the Grouping-scope ladder (`scopes.ts`):
   * patch-orbit key > congruent signature > `'*'` > `config.strand.color`.
   * Undefined / empty ⇒ the global colour (Gallery + undecorated Builder).
   */
  strandRecords?: ColourRecord[]
  /**
   * Stage 2 — lattice translations reducing a Strand centroid to its
   * Lattice-orbit offset for `patch`-scope matching. On the periodic
   * fast-path this is a local ring (base-domain strands); on the full-field
   * path the viewport stamp set. Undefined ⇒ centroids used as-is.
   */
  orbitStamps?: Vec2[]
  /**
   * Stage 2b — per-Cell symmetry frames for `cell`-scope matching (the
   * clicked strand's rotation/mirror twins within its Cell). Undefined ⇒
   * the cell rung never matches.
   */
  cellFrames?: CellFrame[]
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
export const StrandLayer = memo(function StrandLayer({ segments, config, ghostPolygonIds, strandRecords, orbitStamps, cellFrames }: Props) {
  const { strand } = config
  const stroke = strand.color

  const strandData = useMemo(() => {
    const t0 = performance.now()
    const r = buildStrands(segments)
    recordPerf({ strandMs: performance.now() - t0 })
    return r
  }, [segments])

  // Stage 2 — per-strand stroke from the Decoration colour ladder. Null when
  // no records apply (single global colour, the common/Gallery case) or when
  // the ghost split is active (path indices stop aligning with strands; ghosts
  // only exist in Design Phase, where Decoration is never active).
  const strokes = useMemo<string[] | null>(() => {
    if (!strandRecords || strandRecords.length === 0) return null
    if (ghostPolygonIds && ghostPolygonIds.size > 0) return null
    const idx = buildColourIndex(strandRecords)
    if (idx.starColour === null && idx.bySignature.size === 0 && !idx.hasPositioned) return null
    const ring = orbitStamps ?? []
    return strandData.map(sd => {
      const id = strandIdentity(sd.points)
      const off = orbitOffset(id.centroid, ring)
      // Cell-rung key only when cell records exist (saves the 2n-image walk).
      const cellKey = idx.cell.length > 0 && cellFrames
        ? cellScopedKey(id.signature, off, cellFrames)
        : null
      // World-instance strand records aren't produced by the UI (a "single"
      // strand is its patch orbit), so no world centroid is passed here.
      return resolveColour(idx, id.signature, off, null, cellKey) ?? stroke
    })
  }, [strandData, strandRecords, orbitStamps, cellFrames, ghostPolygonIds, stroke])
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
          stroke={strokes ? strokes[i] : stroke}
          strokeWidth={strand.width}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </g>
  )
})
