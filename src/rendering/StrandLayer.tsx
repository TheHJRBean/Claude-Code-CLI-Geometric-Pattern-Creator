import { memo, useMemo } from 'react'
import type { Segment } from '../types/geometry'
import type { PatternConfig } from '../types/pattern'
import type { ColourRecord } from '../types/editor'
import type { Vec2 } from '../utils/math'
import { buildStrands } from '../strand/buildStrands'
import { computeCurves, smoothCurves } from '../strand/computeCurves'
import { curvedPathD, curvedPathDSplit } from '../strand/curvedPathD'
import { computeWeave } from '../strand/weave'
import { wovenPathD } from '../strand/wovenPathD'
import { buildColourIndex, orbitOffset, resolveColour } from '../decoration/scopes'
import { cellOrbitKey, reduceToOrbit, type CellFrame } from '../decoration/cellScope'
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

/** Default extra gap (px) each side of the over thread at an under crossing. */
const DEFAULT_WEAVE_GAP = 2

/**
 * Render every Strand as a single continuous SVG path.
 *
 * When `config.strand.weave` is on, Strands interlace Taprats-style instead:
 * over/under alternates along each thread (`strand/weave.ts`) and the under
 * thread is drawn with a gap cut around the crossing (`strand/wovenPathD.ts`)
 * — a path break, not a paint-over, so Void fills and the background show
 * through. This is the Lacing effect; the legacy two-pass renderer it
 * replaces was removed in Phase 6 of the context refactor.
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
      const cellKey = idx.cell.size > 0 && cellFrames
        ? cellOrbitKey(id.signature, reduceToOrbit(sd.points, id.centroid, off), id.closed, off, cellFrames)
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

  // Weave only on the normal render path — the Design-phase ghost split
  // already fragments paths per edge, and its preview doesn't need lacing.
  const ghostsActive = !!ghostPolygonIds && ghostPolygonIds.size > 0
  const weaves = useMemo(
    () => (strand.weave && !ghostsActive ? computeWeave(strandData) : null),
    [strand.weave, ghostsActive, strandData],
  )

  // When ghost ids exist, split each Strand per-edge by host polygon so the
  // boundary crossing produces a clean colour break — strands that bridge a
  // seed and a ghost get rendered partially full-colour (seed side) and
  // partially faded (ghost side). Otherwise emit one path per Strand.
  const { seedPaths, ghostPaths } = useMemo(() => {
    if (!ghostPolygonIds || ghostPolygonIds.size === 0) {
      if (weaves) {
        // Half-cut per under crossing: cover the over thread (width/2 scaled
        // by the crossing angle), absorb this thread's round line cap
        // (width/2), then the visible gap.
        const w = strand.width
        const gap = strand.weaveGap ?? DEFAULT_WEAVE_GAP
        const paths = curvedStrands.map((cs, i) => {
          const under = weaves[i].under
          if (under.length === 0) return curvedPathD(cs)
          return wovenPathD(cs, under.map(u => ({ s: u.s, half: (w / 2) * u.factor + w / 2 + gap })))
        })
        return { seedPaths: paths, ghostPaths: [] as string[] }
      }
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
  }, [curvedStrands, strandData, segments, ghostPolygonIds, weaves, strand.width, strand.weaveGap])

  if (seedPaths.length === 0 && ghostPaths.length === 0) return null

  // ── Strand line style ────────────────────────────────────────────────────
  // dashed/dotted are dash arrays scaled to the Strand width; double/triple
  // cut the stroke's centre out with a mask so Void fills / background show
  // through between the parallel lines (an overdraw in the background colour
  // would paint over Void fills — same trap as the hidden-strand fix).
  const lineStyle = strand.lineStyle ?? 'solid'
  const w = strand.width
  const masked = lineStyle === 'double' || lineStyle === 'triple'
  const dashArray = lineStyle === 'dashed' ? `${w * 2.5} ${w * 1.5}`
    : lineStyle === 'dotted' ? `0.01 ${w * 1.8}` : undefined
  const lineCap = lineStyle === 'dashed' ? 'butt' as const : 'round' as const
  // Centre cut width; triple keeps a thin centre line drawn separately.
  const cutWidth = lineStyle === 'triple' ? w * 0.65 : w * 0.5
  const centreWidth = w * 0.18
  // Visible seed paths (hidden 'none' strands excluded — their mask cuts
  // would otherwise carve through visible strands crossing them).
  const visibleSeed = seedPaths
    .map((d, i) => ({ d, i }))
    .filter(({ i }) => !(strokes && strokes[i] === 'none'))
  // Mask region: bbox over the curved strand geometry (control points bound
  // the Béziers) + a stroke-width margin.
  let maskRect = null as { x: number; y: number; width: number; height: number } | null
  if (masked && visibleSeed.length > 0) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const cs of curvedStrands) {
      for (const p of cs.points) {
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
        minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
      }
      for (const cps of cs.curves) {
        if (!cps) continue
        for (const p of cps) {
          minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
          minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
        }
      }
    }
    const m = w * 2
    maskRect = { x: minX - m, y: minY - m, width: maxX - minX + 2 * m, height: maxY - minY + 2 * m }
  }
  const maskId = 'strand-style-mask'

  return (
    <g id="strand-layer">
      {maskRect && (
        <defs>
          <mask id={maskId} maskUnits="userSpaceOnUse" x={maskRect.x} y={maskRect.y} width={maskRect.width} height={maskRect.height}>
            <rect x={maskRect.x} y={maskRect.y} width={maskRect.width} height={maskRect.height} fill="white" />
            {visibleSeed.map(({ d, i }) => (
              <path
                key={`cut-${i}`}
                d={d}
                fill="none"
                stroke="black"
                strokeWidth={cutWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </mask>
        </defs>
      )}
      {ghostPaths.length > 0 && (
        // Ghosts are a Design-phase preview — always solid for legibility.
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
      {/* `'none'` = the hidden-strand sentinel (Decoration "Remove strand
          colour"): emit nothing so Void fills meet seamlessly underneath. */}
      <g mask={maskRect ? `url(#${maskId})` : undefined}>
        {visibleSeed.map(({ d, i }) => (
          <path
            key={`strand-${i}`}
            d={d}
            fill="none"
            stroke={strokes ? strokes[i] : stroke}
            strokeWidth={strand.width}
            strokeLinecap={lineCap}
            strokeLinejoin="round"
            strokeDasharray={dashArray}
          />
        ))}
      </g>
      {lineStyle === 'triple' && visibleSeed.map(({ d, i }) => (
        <path
          key={`strand-centre-${i}`}
          d={d}
          fill="none"
          stroke={strokes ? strokes[i] : stroke}
          strokeWidth={centreWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </g>
  )
})
