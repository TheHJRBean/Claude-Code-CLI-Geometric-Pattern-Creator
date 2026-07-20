import { memo, useMemo } from 'react'
import type { Segment } from '../types/geometry'
import type { PatternConfig } from '../types/pattern'
import type { ColourRecord } from '../types/editor'
import type { Vec2 } from '../utils/math'
import { buildStrands } from '../strand/buildStrands'
import { computeCurves, smoothCurves } from '../strand/computeCurves'
import { curvedPathD, curvedPathDSplit, curvedPathDSplitBy } from '../strand/curvedPathD'
import { computeWeave } from '../strand/weave'
import { weaveCapWedgeD, wovenPath, wovenPathD } from '../strand/wovenPathD'
import { strandStyleAttrs } from './strandStyle'
import { buildColourIndex, orbitOffset, resolveColour } from '../decoration/scopes'
import { cellOrbitKey, reduceToOrbit, type CellFrame } from '../decoration/cellScope'
import { baseSegmentSignatureMap, renderedStrandBaseSignatures, segmentBaseSignatures, strandIdentity } from '../decoration/strandGroups'
import type { LatticeStamp } from '../editor/lattice'
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
  /**
   * Base-fragment identity source (editor non-fast path). When set, each
   * strand's congruent signature comes from the base fragment's chains via
   * stamp-mapping — see `PatternData.strandIdentitySource`. Undefined ⇒
   * signatures from the rendered chains (fast path / Gallery).
   */
  identitySource?: { baseSegments: Segment[]; stamps: LatticeStamp[] }
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
export const StrandLayer = memo(function StrandLayer({ segments, config, ghostPolygonIds, strandRecords, orbitStamps, cellFrames, identitySource }: Props) {
  const { strand } = config
  const stroke = strand.color

  const strandData = useMemo(() => {
    const t0 = performance.now()
    const r = buildStrands(segments)
    recordPerf({ strandMs: performance.now() - t0 })
    return r
  }, [segments])

  // Base-fragment congruent signatures (editor non-fast path): per STRAND
  // (majority — whole-chain keys) and per SEGMENT (a chain spans multiple
  // base classes in multi-class fields, and frame-truncated border chains
  // have a different mix than interior ones — per-chain majorities are
  // frame-dependent, so congruent strokes resolve per segment). Null entries
  // fall back to the rendered chain's own identity.
  const baseSigs = useMemo<{ perStrand: (string | null)[]; perSegment: (string | null)[] } | null>(() => {
    if (!identitySource) return null
    const baseMap = baseSegmentSignatureMap(identitySource.baseSegments)
    const perSegment = segmentBaseSignatures(segments, baseMap, identitySource.stamps)
    const perStrand = renderedStrandBaseSignatures(
      strandData, segments, baseMap, identitySource.stamps, perSegment)
    return { perStrand, perSegment }
  }, [strandData, segments, identitySource])

  // Stage 2 — Decoration strokes from the colour ladder. Null when no records
  // apply (single global colour, the common/Gallery case) or when the ghost
  // split is active (path indices stop aligning with strands; ghosts only
  // exist in Design Phase, where Decoration is never active). Per strand: the
  // whole-chain stroke (majority signature — used under weave, where the
  // over/under cut walk needs the chain whole) plus per-EDGE strokes when the
  // chain's edges resolve differently (multi-class chains).
  const strokes = useMemo<{ perStrand: string[]; edgeStrokes: (string[] | null)[] } | null>(() => {
    if (!strandRecords || strandRecords.length === 0) return null
    if (ghostPolygonIds && ghostPolygonIds.size > 0) return null
    const idx = buildColourIndex(strandRecords)
    if (idx.starColour === null && idx.bySignature.size === 0 && !idx.hasPositioned) return null
    const ring = orbitStamps ?? []
    const perStrand: string[] = []
    const edgeStrokes: (string[] | null)[] = []
    for (let si = 0; si < strandData.length; si++) {
      const sd = strandData[si]
      const id = strandIdentity(sd.points)
      const strandSig = baseSigs?.perStrand[si] ?? id.signature
      const off = orbitOffset(id.centroid, ring)
      // Cell-rung key only when cell records exist (saves the 2n-image walk).
      const cellKey = idx.cell.size > 0 && cellFrames
        ? cellOrbitKey(strandSig, reduceToOrbit(sd.points, id.centroid, off), id.closed, off, cellFrames)
        : null
      // World-instance strand records aren't produced by the UI (a "single"
      // strand is its patch orbit), so no world centroid is passed here.
      const resolveSig = (sig: string): string => resolveColour(idx, sig, off, null, cellKey) ?? stroke
      const strandStroke = resolveSig(strandSig)
      perStrand.push(strandStroke)
      if (!baseSigs) { edgeStrokes.push(null); continue }
      // Per-edge resolution, memoised per distinct signature in this chain.
      const bySig = new Map<string, string>([[strandSig, strandStroke]])
      let mixed = false
      const perEdge = sd.segmentIndices.map(segIdx => {
        const sig = baseSigs.perSegment[segIdx] ?? strandSig
        let c = bySig.get(sig)
        if (c === undefined) { c = resolveSig(sig); bySig.set(sig, c) }
        if (c !== strandStroke) mixed = true
        return c
      })
      edgeStrokes.push(mixed ? perEdge : null)
    }
    return { perStrand, edgeStrokes }
  }, [strandData, strandRecords, orbitStamps, cellFrames, ghostPolygonIds, stroke, baseSigs])
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
  // partially faded (ghost side). Otherwise emit stroke-carrying `pieces`:
  // one per Strand normally, several when a multi-class chain's edges resolve
  // to different Decoration strokes (per-run split — border-truncated chains
  // must not take one majority stroke whole). Weave keeps the whole-chain
  // stroke: the over/under cut walk needs the chain in one path.
  const { pieces, ghostPaths } = useMemo(() => {
    type Piece = { d: string; stroke: string; cap: string | null }
    const strokeOf = (i: number): string => strokes ? strokes.perStrand[i] : stroke
    if (!ghostPolygonIds || ghostPolygonIds.size === 0) {
      if (weaves) {
        const w = strand.width
        const gap = strand.weaveGap ?? DEFAULT_WEAVE_GAP
        // Solid strands get angled-cut cap wedges: the cut is deepened to
        // (w + gap)·factor (round cap tangent-or-behind the mitre face) and
        // weaveCapWedgeD fills the stroke end back up to a face parallel to
        // the over thread. Other line styles keep the plain perpendicular
        // cut — wedges are solid fills and would fight dash gaps / the
        // double/triple centre mask.
        const wedges = (strand.lineStyle ?? 'solid') === 'solid'
        const out: Piece[] = curvedStrands.map((cs, i) => {
          const under = weaves[i].under
          if (under.length === 0) {
            return { d: curvedPathD(cs), stroke: strokeOf(i), cap: null }
          }
          if (!wedges) {
            // Half-cut per under crossing: cover the over thread (width/2
            // scaled by the crossing angle), absorb this thread's round line
            // cap (width/2), then the visible gap.
            return {
              d: wovenPathD(cs, under.map(u => ({ s: u.s, half: (w / 2) * u.factor + w / 2 + gap }))),
              stroke: strokeOf(i),
              cap: null,
            }
          }
          const r = wovenPath(cs, under.map(u => ({
            s: u.s,
            half: (w + gap) * u.factor,
            point: u.point,
            over: u.over,
            factor: u.factor,
          })))
          return { d: r.d, stroke: strokeOf(i), cap: weaveCapWedgeD(r.caps, w, gap) || null }
        })
        return { pieces: out, ghostPaths: [] as string[] }
      }
      const out: Piece[] = []
      for (let i = 0; i < curvedStrands.length; i++) {
        const perEdge = strokes?.edgeStrokes[i]
        if (!perEdge) {
          out.push({ d: curvedPathD(curvedStrands[i]), stroke: strokeOf(i), cap: null })
          continue
        }
        for (const [strokeKey, d] of curvedPathDSplitBy(curvedStrands[i], j => perEdge[j])) {
          out.push({ d, stroke: strokeKey, cap: null })
        }
      }
      return { pieces: out, ghostPaths: [] as string[] }
    }
    const seeds: Piece[] = []
    const ghosts: string[] = []
    for (let s = 0; s < curvedStrands.length; s++) {
      const sd = strandData[s]
      const isGhostEdge = (i: number) =>
        ghostPolygonIds.has(segments[sd.segmentIndices[i]].polygonId)
      const { seedD, ghostD } = curvedPathDSplit(curvedStrands[s], isGhostEdge)
      if (seedD) seeds.push({ d: seedD, stroke, cap: null })
      if (ghostD) ghosts.push(ghostD)
    }
    return { pieces: seeds, ghostPaths: ghosts }
  }, [curvedStrands, strandData, segments, ghostPolygonIds, weaves, strand.width, strand.weaveGap, strand.lineStyle, strokes, stroke])

  if (pieces.length === 0 && ghostPaths.length === 0) return null

  // ── Strand line style ────────────────────────────────────────────────────
  // dashed/dotted are dash arrays scaled to the Strand width; double/triple
  // cut the stroke's centre out with a mask so Void fills / background show
  // through between the parallel lines (an overdraw in the background colour
  // would paint over Void fills — same trap as the hidden-strand fix).
  const lineStyle = strand.lineStyle ?? 'solid'
  const w = strand.width
  // dashed/dotted dash arrays, double/triple centre-cut mask flag + widths.
  const { masked, dashArray, lineCap, cutWidth, centreWidth } = strandStyleAttrs(lineStyle, w)
  // Visible pieces (hidden 'none' strands excluded — their mask cuts
  // would otherwise carve through visible strands crossing them).
  const visiblePieces = pieces
    .map((p, i) => ({ ...p, i }))
    .filter(p => p.stroke !== 'none')
  // Mask region: bbox over the curved strand geometry (control points bound
  // the Béziers) + a stroke-width margin.
  let maskRect = null as { x: number; y: number; width: number; height: number } | null
  if (masked && visiblePieces.length > 0) {
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
            {visiblePieces.map(({ d, i }) => (
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
      {/* Inner fill for double/triple: a cut-width underlay stroke painted
          beneath the masked outer stroke, so the mask's centre cut reveals
          this colour instead of the background / Void fills. */}
      {masked && strand.innerFill && visiblePieces.map(({ d, i }) => (
        <path
          key={`strand-innerfill-${i}`}
          d={d}
          fill="none"
          stroke={strand.innerFill}
          strokeWidth={cutWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {/* `'none'` = the hidden-strand sentinel (Decoration "Remove strand
          colour"): emit nothing so Void fills meet seamlessly underneath. */}
      <g mask={maskRect ? `url(#${maskId})` : undefined}>
        {visiblePieces.map(({ d, stroke: pieceStroke, i }) => (
          <path
            key={`strand-${i}`}
            d={d}
            fill="none"
            stroke={pieceStroke}
            strokeWidth={strand.width}
            strokeLinecap={lineCap}
            strokeLinejoin="round"
            strokeDasharray={dashArray}
          />
        ))}
        {/* Angled-cut wedges dressing the woven gap ends (solid style only). */}
        {visiblePieces.map(({ cap, stroke: pieceStroke, i }) =>
          cap ? (
            <path
              key={`strand-cap-${i}`}
              d={cap}
              fill={pieceStroke}
              stroke="none"
            />
          ) : null,
        )}
      </g>
      {lineStyle === 'triple' && visiblePieces.map(({ d, stroke: pieceStroke, i }) => (
        <path
          key={`strand-centre-${i}`}
          d={d}
          fill="none"
          stroke={pieceStroke}
          strokeWidth={centreWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </g>
  )
})
