import type { Segment } from '../types/geometry'
import type { CurveConfig, FigureConfig, PatternConfig } from '../types/pattern'
import type { StrandData } from './buildStrands'
import { sub, normalize, perp, scale, add, dist, lerp, dot, len, type Vec2 } from '../utils/math'

export interface CurvedStrand {
  points: Vec2[]
  /** curves[i] holds control points for the edge points[i] → points[i+1], or null for straight */
  curves: (Vec2[] | null)[]
}

/**
 * Resolve the `CurveConfig` a segment renders with (ticket #42). An extra
 * line set uses its own `curve`; a primary vertex line uses `vertexCurve` when
 * decoupled; everything else uses the primary `curve`. A setless primary
 * segment falls straight through to the pre-#42 edge/vertex branch.
 */
export function resolveSegmentCurve(fig: FigureConfig | undefined, seg: Segment): CurveConfig | undefined {
  if (!fig) return undefined
  if (seg.setId !== undefined) {
    return fig.extraSets?.find(s => s.id === seg.setId)?.curve
  }
  const decoupledVertex = (fig.vertexLinesDecoupled ?? false) && seg.kind === 'vertex-line'
  return decoupledVertex ? fig.vertexCurve : fig.curve
}

/**
 * Which segments take the flipped side of an alternating curve.
 *
 * Two rules, because "alternating" has two different meanings depending on how
 * the line family was constructed:
 *
 * 1. **Ray-derived families** (star arms, vertex lines — anything with a `side`
 *    tag): parity is the ± side of the α rotation from the inward normal /
 *    bisector, read straight off the tag the PIC emitter stamps. This is
 *    intrinsic geometry, consistent between neighbouring tiles by construction,
 *    and it is what every existing curved pattern was authored against — do not
 *    change it. (A prior cross(inwardRadial, rayDir) heuristic degenerated to
 *    ~0 when seg.to sat on the polygon centre — e.g. equilateral triangles at
 *    θ=60° — giving parity that flipped on every rerun. The tag avoids that.)
 *
 * 2. **Families with no rays** (a `boundary` set traces the Tile outline):
 *    there is no ± to read, so alternation can only mean a 2-colouring of the
 *    chain — flip every other Ray ALONG the Strand. A closed loop with an odd
 *    number of Rays is not 2-colourable, so it is left symmetric; that is the
 *    same odd-cycle argument the 3-gon rule below already makes, just applied
 *    to the chain rather than to a tile's arms.
 *
 * Strand-scoped, so it must run after `buildStrands`.
 */
export function buildAlternatingParity(
  segments: Segment[],
  strands: StrandData[],
): Map<number, boolean> {
  const parity = new Map<number, boolean>()

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    if (!seg.side) continue
    // 3-gons: 3 arms meet at the centroid — an odd cycle that can't be
    // 2-coloured. Force symmetric (non-alternating) curves regardless of
    // stored config. The UI hides the alternating toggle for sides===3
    // but legacy state may still carry alternating:true.
    if (seg.polygonSides === 3) continue
    parity.set(i, seg.side === 'plus')
  }

  for (const sd of strands) {
    const idx = sd.segmentIndices
    // Strands are set-scoped (`buildStrands` keys junctions by setId), so a
    // strand is homogeneous: either the whole chain is ray-derived or none is.
    if (!idx.length || segments[idx[0]]?.side) continue
    const first = sd.points[0]
    const last = sd.points[sd.points.length - 1]
    const closed = Math.abs(first.x - last.x) < 1e-6 && Math.abs(first.y - last.y) < 1e-6
    if (closed && idx.length % 2 === 1) continue
    for (let i = 0; i < idx.length; i++) parity.set(idx[i], i % 2 === 1)
  }

  return parity
}

/**
 * The normal a curve's control points are offset along, oriented so a positive
 * offset means the same thing everywhere in the pattern.
 *
 * Shared by the render (`computeCurves`) and the on-canvas control-point
 * handles (`ControlPointLayer`) — they used to hold separate copies of this,
 * which is how the handles silently drifted from the curve they claim to edit.
 */
export function segmentBaseNormal(seg: Segment, from: Vec2, to: Vec2): Vec2 {
  const rawNormal = perp(normalize(sub(to, from)))
  const segMid: Vec2 = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }
  const radial = sub(segMid, seg.polygonCenter)

  // `rawNormal` points to whichever side falls out of the from→to ordering, so
  // it has to be flipped onto a reference direction to mean the same thing
  // across the pattern. The reference must NOT be near-perpendicular to the
  // normal, or the dot below lands on ~0 and the orientation is decided by
  // floating-point noise instead of by geometry — which is the failure mode
  // behind all three cases here.
  let flipTo: Vec2
  if (!seg.side) {
    // A family with no ± rays is a Tile outline (a `boundary` set): the Ray IS
    // an edge, so its normal is RADIAL and the CW tangent below is exactly
    // perpendicular to it — dot ≈ 1e-15 on every edge, sign pure noise, so
    // neighbouring edges bulged opposite ways at random. Orient outward from
    // the Tile centre, so a positive offset uniformly bulges away from it.
    flipTo = radial
  } else if (seg.polygonSides === 3) {
    // 3-gons at θ=60°: the 3 surviving arms form the medial triangle, each
    // perpendicular to its own radial — the same degeneracy from the other
    // direction. Align with the INWARD radial so a positive offset uniformly
    // bulges toward the centroid (concave).
    flipTo = { x: -radial.x, y: -radial.y }
  } else {
    // Star arms run radially, so their normal is tangential: the CW tangent is
    // the well-conditioned reference. It is also plus/minus-independent, so
    // flipping the sign via the alternating parity is a true rotational-sense
    // flip rather than a mirror.
    flipTo = { x: radial.y, y: -radial.x }
  }
  return dot(rawNormal, flipTo) >= 0 ? rawNormal : { x: -rawNormal.x, y: -rawNormal.y }
}

/** Offset sign for one segment: direction preference × alternating flip. */
export function segmentCurveSign(curve: CurveConfig, altFlipped: boolean): number {
  const dirSign = curve.direction === 'right' ? -1 : 1
  const altSign = (curve.alternating && altFlipped) ? -1 : 1
  return dirSign * altSign
}

/**
 * Compute Bézier control points for each edge in each strand,
 * based on the per-polygon-type CurveConfig.
 */
export function computeCurves(
  strandData: StrandData[],
  segments: Segment[],
  config: PatternConfig,
): CurvedStrand[] {
  const altParity = buildAlternatingParity(segments, strandData)

  return strandData.map(sd => {
    const { points, segmentIndices } = sd
    const curves: (Vec2[] | null)[] = []

    for (let i = 0; i < segmentIndices.length; i++) {
      const seg = segments[segmentIndices[i]]

      const fig = config.figures[seg.tileTypeId]
      const curve = resolveSegmentCurve(fig, seg)
      if (!curve?.enabled || !curve.points.length) {
        curves.push(null)
        continue
      }

      const from = points[i]
      const to = points[i + 1]
      const edgeLen = dist(from, to)
      if (edgeLen < 1e-10) {
        curves.push(null)
        continue
      }

      const baseNormal = segmentBaseNormal(seg, from, to)
      const sign = segmentCurveSign(curve, altParity.get(segmentIndices[i]) ?? false)

      // If the strand traverses this segment backwards, mirror position so
      // that position=0 always maps to seg.from in the user's config.
      const dfx = from.x - seg.from.x, dfy = from.y - seg.from.y
      const reversed = dfx * dfx + dfy * dfy > 1e-6

      const controlPoints: Vec2[] = curve.points.map(cp => {
        const t = reversed ? 1 - cp.position : cp.position
        const basePoint = lerp(from, to, t)
        return add(basePoint, scale(baseNormal, sign * cp.offset * edgeLen))
      })
      // SVG cubic/quartic associates CP[0] with the start endpoint.
      // When traversing backwards, CP[0] (intended near seg.from) is now
      // spatially far from the start (seg.to) — reverse the array so each
      // CP stays associated with its intended endpoint.
      if (reversed) controlPoints.reverse()

      curves.push(controlPoints)
    }

    return { points, curves }
  })
}

/**
 * Adjust control points of adjacent Bézier curves so they share a tangent
 * direction at each interior join point (G1 continuity). Each curve's CP
 * magnitudes are preserved; only their angular positions around the join
 * are rotated onto a shared bisector.
 *
 * Quadratic curves (1 CP) are upgraded to cubics on the fly so both
 * tangents can be controlled independently.
 *
 * Closed loops (first point == last point) get their wrap-around join
 * smoothed as well.
 */
export function smoothCurves(strand: CurvedStrand): CurvedStrand {
  const { points } = strand
  if (points.length < 3) return strand

  // Deep-copy curves so the input is not mutated
  const curves: (Vec2[] | null)[] = strand.curves.map(cps =>
    cps ? cps.map(p => ({ ...p })) : null,
  )

  const upgradeQ = (edgeIdx: number) => {
    const cps = curves[edgeIdx]
    if (!cps || cps.length !== 1) return
    const p0 = points[edgeIdx]
    const p1 = points[edgeIdx + 1]
    const cp = cps[0]
    // Q(t) ≡ C(t) with CP1 = P0 + 2/3(CP-P0), CP2 = P1 + 2/3(CP-P1)
    curves[edgeIdx] = [
      { x: p0.x + (2 / 3) * (cp.x - p0.x), y: p0.y + (2 / 3) * (cp.y - p0.y) },
      { x: p1.x + (2 / 3) * (cp.x - p1.x), y: p1.y + (2 / 3) * (cp.y - p1.y) },
    ]
  }

  const closed =
    Math.abs(points[0].x - points[points.length - 1].x) < 1e-6 &&
    Math.abs(points[0].y - points[points.length - 1].y) < 1e-6

  const smoothJoin = (inEdge: number, outEdge: number, joinPt: Vec2, prevPt: Vec2, nextPt: Vec2) => {
    upgradeQ(inEdge)
    upgradeQ(outEdge)
    const inCps = curves[inEdge]
    const outCps = curves[outEdge]

    // Incoming tangent (toward joinPt); prefer CP-derived direction
    const inEndCpIdx = inCps && inCps.length >= 2 ? inCps.length - 1 : -1
    const outStartCpIdx = outCps && outCps.length >= 2 ? 0 : -1

    const inSrc = inEndCpIdx >= 0 ? inCps![inEndCpIdx] : prevPt
    const outSrc = outStartCpIdx >= 0 ? outCps![outStartCpIdx] : nextPt

    const inDir = normalize(sub(joinPt, inSrc))
    const outDir = normalize(sub(outSrc, joinPt))

    const sum = add(inDir, outDir)
    if (len(sum) < 0.2) return  // near-cusp: leave the join alone
    const avgDir = normalize(sum)

    if (inEndCpIdx >= 0) {
      const mag = dist(joinPt, inCps![inEndCpIdx])
      inCps![inEndCpIdx] = { x: joinPt.x - avgDir.x * mag, y: joinPt.y - avgDir.y * mag }
    }
    if (outStartCpIdx >= 0) {
      const mag = dist(joinPt, outCps![outStartCpIdx])
      outCps![outStartCpIdx] = { x: joinPt.x + avgDir.x * mag, y: joinPt.y + avgDir.y * mag }
    }
  }

  for (let i = 1; i < points.length - 1; i++) {
    smoothJoin(i - 1, i, points[i], points[i - 1], points[i + 1])
  }
  if (closed && points.length >= 4) {
    // Wrap-around: last edge meets first edge at points[0] == points[last]
    const lastEdge = curves.length - 1
    smoothJoin(lastEdge, 0, points[0], points[points.length - 2], points[1])
  }

  return { points, curves }
}
