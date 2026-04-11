import { useMemo } from 'react'
import type { Segment } from '../types/geometry'
import type { LacingConfig } from '../types/pattern'
import { buildStrands } from '../strand/buildStrands'

interface Props {
  segments: Segment[]
  lacing: LacingConfig
}

type Pt = { x: number; y: number }

function ptKey(p: Pt): string {
  return `${p.x.toFixed(4)},${p.y.toFixed(4)}`
}

/* ── Crossing detection ─────────────────────────────────────────── */

interface Crossing {
  strandA: number
  strandB: number
  ptIdxA: number   // index into strand A's points array
  ptIdxB: number   // index into strand B's points array
  point: Pt
}

/** Find crossings: vertices shared by two strands' interiors.
 *  In PIC patterns, all crossings occur at shared vertices (star tips). */
function findCrossings(strands: Pt[][]): Crossing[] {
  // Map each vertex → list of (strandIdx, pointIdx) for interior points only
  const vertexMap = new Map<string, { si: number; pi: number }[]>()
  for (let si = 0; si < strands.length; si++) {
    const strand = strands[si]
    for (let pi = 1; pi < strand.length - 1; pi++) {
      const k = ptKey(strand[pi])
      if (!vertexMap.has(k)) vertexMap.set(k, [])
      vertexMap.get(k)!.push({ si, pi })
    }
  }

  const crossings: Crossing[] = []
  for (const entries of vertexMap.values()) {
    if (entries.length < 2) continue
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        if (entries[i].si === entries[j].si) continue // same strand
        crossings.push({
          strandA: entries[i].si, strandB: entries[j].si,
          ptIdxA: entries[i].pi, ptIdxB: entries[j].pi,
          point: strands[entries[i].si][entries[i].pi],
        })
      }
    }
  }
  return crossings
}

/* ── Over/under assignment (Taprats-style BFS propagation) ──────── */

/** Returns overIdx[ci] = strand index that goes OVER at crossing ci.
 *
 *  Algorithm (from Kaplan's Taprats):
 *  1. Build a crossing graph: consecutive crossings along a strand are adjacent.
 *  2. Seed one crossing per connected component (strandA = over).
 *  3. BFS: if strand S is over at crossing V, it must be under at the next
 *     crossing W along S — so the OTHER strand at W goes over.
 *  This guarantees globally consistent alternation. */
function assignOverUnder(crossings: Crossing[], strandCount: number): number[] {
  const n = crossings.length
  if (n === 0) return []
  const overIdx: number[] = Array(n).fill(-1)

  // For each strand, collect its crossing indices sorted by position along the strand
  const strandCrossings: number[][] = Array.from({ length: strandCount }, () => [])
  for (let ci = 0; ci < n; ci++) {
    strandCrossings[crossings[ci].strandA].push(ci)
    strandCrossings[crossings[ci].strandB].push(ci)
  }
  for (let si = 0; si < strandCount; si++) {
    strandCrossings[si].sort((a, b) => {
      const paramFor = (ci: number) => {
        const c = crossings[ci]
        return c.strandA === si ? c.ptIdxA : c.ptIdxB
      }
      return paramFor(a) - paramFor(b)
    })
  }

  // Build adjacency: consecutive crossings along the same strand are linked
  const adj: { neighbor: number; strand: number }[][] = Array.from({ length: n }, () => [])
  for (let si = 0; si < strandCount; si++) {
    const sc = strandCrossings[si]
    for (let i = 0; i + 1 < sc.length; i++) {
      adj[sc[i]].push({ neighbor: sc[i + 1], strand: si })
      adj[sc[i + 1]].push({ neighbor: sc[i], strand: si })
    }
  }

  // BFS: seed each connected component, propagate alternation
  for (let start = 0; start < n; start++) {
    if (overIdx[start] !== -1) continue
    overIdx[start] = crossings[start].strandA // seed: strandA over
    const queue = [start]
    while (queue.length > 0) {
      const cur = queue.shift()!
      for (const { neighbor, strand: sharedStrand } of adj[cur]) {
        if (overIdx[neighbor] !== -1) continue
        // If sharedStrand is over at cur, it must be under at neighbor (and vice versa)
        const sharedOverAtCur = overIdx[cur] === sharedStrand
        const otherAtNeighbor = crossings[neighbor].strandA === sharedStrand
          ? crossings[neighbor].strandB
          : crossings[neighbor].strandA
        overIdx[neighbor] = sharedOverAtCur ? otherAtNeighbor : sharedStrand
        queue.push(neighbor)
      }
    }
  }

  return overIdx
}

/* ── Gap splitting ──────────────────────────────────────────────── */

interface VertexGap {
  ptIdx: number    // index of the crossing vertex in the strand
  halfGap: number  // half-gap length in world units
}

/** Compute sin of the acute crossing angle at a shared vertex. */
function crossingSinAngle(sA: Pt[], piA: number, sB: Pt[], piB: number): number {
  // Direction through the crossing vertex: prev → next
  const dax = sA[piA + 1].x - sA[piA - 1].x, day = sA[piA + 1].y - sA[piA - 1].y
  const dbx = sB[piB + 1].x - sB[piB - 1].x, dby = sB[piB + 1].y - sB[piB - 1].y
  const la = Math.sqrt(dax * dax + day * day)
  const lb = Math.sqrt(dbx * dbx + dby * dby)
  if (la < 1e-10 || lb < 1e-10) return 1
  const cosA = Math.abs(dax * dbx + day * dby) / (la * lb)
  return Math.sqrt(Math.max(0, 1 - cosA * cosA))
}

/** Split a polyline strand at vertex-gaps (where it goes under).
 *  Cuts the incoming segment short and starts the outgoing segment late. */
function splitAtVertexGaps(strand: Pt[], gaps: VertexGap[]): Pt[][] {
  if (gaps.length === 0) return [strand]

  const gapSet = new Map<number, number>() // ptIdx → halfGap
  for (const g of gaps) gapSet.set(g.ptIdx, g.halfGap)

  const subPaths: Pt[][] = []
  let current: Pt[] = [strand[0]]

  for (let i = 1; i < strand.length; i++) {
    const halfGap = gapSet.get(i)
    if (halfGap !== undefined) {
      // Crossing vertex — insert a gap straddling it
      const prev = strand[i - 1], cross = strand[i]
      const dxIn = cross.x - prev.x, dyIn = cross.y - prev.y
      const lenIn = Math.sqrt(dxIn * dxIn + dyIn * dyIn)

      // End current sub-path before the crossing vertex
      if (lenIn > halfGap) {
        const t = 1 - halfGap / lenIn
        current.push({ x: prev.x + t * dxIn, y: prev.y + t * dyIn })
      }
      if (current.length >= 2) subPaths.push(current)

      // Start new sub-path after the crossing vertex
      if (i + 1 < strand.length) {
        const next = strand[i + 1]
        const dxOut = next.x - cross.x, dyOut = next.y - cross.y
        const lenOut = Math.sqrt(dxOut * dxOut + dyOut * dyOut)
        if (lenOut > halfGap) {
          const t = halfGap / lenOut
          current = [{ x: cross.x + t * dxOut, y: cross.y + t * dyOut }]
        } else {
          current = [next]
          i++ // skip — segment too short, consumed entirely by gap
        }
      } else {
        current = []
      }
    } else {
      current.push(strand[i])
    }
  }

  if (current.length >= 2) subPaths.push(current)
  return subPaths
}

/* ── SVG path helpers ───────────────────────────────────────────── */

function pathD(pts: Pt[]): string {
  return pts.map((p, j) => `${j === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ')
}

/* ── Component ──────────────────────────────────────────────────── */

export function StrandLayer({ segments, lacing }: Props) {
  const strandData = useMemo(() => buildStrands(segments), [segments])
  const strands = useMemo(() => strandData.map(sd => sd.points), [strandData])

  const { continuousPaths, strandSubPaths } = useMemo(() => {
    const continuous = strands.map(s => pathD(s))

    if (!lacing.enabled || strands.length === 0) {
      return { continuousPaths: continuous, strandSubPaths: strands.map(s => [pathD(s)]) }
    }

    const crossings = findCrossings(strands)
    const overIdx = assignOverUnder(crossings, strands.length)

    // Build per-strand gap lists for under-crossings
    const gaps: VertexGap[][] = strands.map(() => [])
    const bandWidth = lacing.strandWidth + lacing.gapWidth * 2

    for (let ci = 0; ci < crossings.length; ci++) {
      const c = crossings[ci]
      const overSi = overIdx[ci]
      const underSi = overSi === c.strandA ? c.strandB : c.strandA
      const underPtIdx = underSi === c.strandA ? c.ptIdxA : c.ptIdxB
      const overPtIdx = overSi === c.strandA ? c.ptIdxA : c.ptIdxB

      // Scale gap by crossing angle so shallow crossings get wider gaps
      const sinA = crossingSinAngle(strands[underSi], underPtIdx, strands[overSi], overPtIdx)
      const halfGap = bandWidth / (2 * Math.max(sinA, 0.25))

      gaps[underSi].push({ ptIdx: underPtIdx, halfGap })
    }

    const subPaths = strands.map((s, i) =>
      splitAtVertexGaps(s, gaps[i]).map(pathD)
    )

    return { continuousPaths: continuous, strandSubPaths: subPaths }
  }, [strands, lacing])

  if (strands.length === 0) return null

  const { strandWidth, gapWidth, strandColor, gapColor } = lacing
  const gapStrokeW = strandWidth + gapWidth * 2

  return (
    <g id="strand-layer">
      {/* Layer 1: gap backgrounds — all strands continuous */}
      {lacing.enabled && continuousPaths.map((d, i) => (
        <path
          key={`gap-${i}`}
          d={d}
          fill="none"
          stroke={gapColor}
          strokeWidth={gapStrokeW}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {/* Layer 2: strand colours — split at under-crossings */}
      {strandSubPaths.map((subPaths, i) =>
        subPaths.map((d, j) => (
          <path
            key={`strand-${i}-${j}`}
            d={d}
            fill="none"
            stroke={strandColor}
            strokeWidth={strandWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))
      )}
    </g>
  )
}
