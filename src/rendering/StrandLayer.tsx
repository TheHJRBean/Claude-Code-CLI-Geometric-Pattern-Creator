import { useMemo } from 'react'
import type { Segment } from '../types/geometry'
import type { PatternConfig } from '../types/pattern'
import { buildStrands } from '../strand/buildStrands'
import { computeCurves, type CurvedStrand } from '../strand/computeCurves'
import { curvedPathD } from '../strand/curvedPathD'

interface Props {
  segments: Segment[]
  config: PatternConfig
}

type Pt = { x: number; y: number }

function ptKey(p: Pt): string {
  return `${p.x.toFixed(4)},${p.y.toFixed(4)}`
}

/* ── Crossing detection ─────────────────────────────────────────── */

interface Crossing {
  strandA: number
  strandB: number
  ptIdxA: number
  ptIdxB: number
  point: Pt
}

function findCrossings(strands: Pt[][]): Crossing[] {
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
        if (entries[i].si === entries[j].si) continue
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

function assignOverUnder(crossings: Crossing[], strandCount: number): number[] {
  const n = crossings.length
  if (n === 0) return []
  const overIdx: number[] = Array(n).fill(-1)

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

  const adj: { neighbor: number; strand: number }[][] = Array.from({ length: n }, () => [])
  for (let si = 0; si < strandCount; si++) {
    const sc = strandCrossings[si]
    for (let i = 0; i + 1 < sc.length; i++) {
      adj[sc[i]].push({ neighbor: sc[i + 1], strand: si })
      adj[sc[i + 1]].push({ neighbor: sc[i], strand: si })
    }
  }

  for (let start = 0; start < n; start++) {
    if (overIdx[start] !== -1) continue
    overIdx[start] = crossings[start].strandA
    const queue = [start]
    while (queue.length > 0) {
      const cur = queue.shift()!
      for (const { neighbor, strand: sharedStrand } of adj[cur]) {
        if (overIdx[neighbor] !== -1) continue
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
  ptIdx: number
  halfGap: number
}

function crossingSinAngle(sA: Pt[], piA: number, sB: Pt[], piB: number): number {
  const dax = sA[piA + 1].x - sA[piA - 1].x, day = sA[piA + 1].y - sA[piA - 1].y
  const dbx = sB[piB + 1].x - sB[piB - 1].x, dby = sB[piB + 1].y - sB[piB - 1].y
  const la = Math.sqrt(dax * dax + day * day)
  const lb = Math.sqrt(dbx * dbx + dby * dby)
  if (la < 1e-10 || lb < 1e-10) return 1
  const cosA = Math.abs(dax * dbx + day * dby) / (la * lb)
  return Math.sqrt(Math.max(0, 1 - cosA * cosA))
}

/** Split a CurvedStrand at vertex-gaps, preserving curve data for each sub-path. */
function splitCurvedStrandAtGaps(cs: CurvedStrand, gaps: VertexGap[]): CurvedStrand[] {
  if (gaps.length === 0) return [cs]

  const { points, curves } = cs
  const gapSet = new Map<number, number>()
  for (const g of gaps) gapSet.set(g.ptIdx, g.halfGap)

  const subStrands: CurvedStrand[] = []
  let curPts: Pt[] = [points[0]]
  let curCurves: (Pt[] | null)[] = []

  for (let i = 1; i < points.length; i++) {
    const halfGap = gapSet.get(i)
    if (halfGap !== undefined) {
      // Crossing vertex — insert gap
      const prev = points[i - 1], cross = points[i]
      const dxIn = cross.x - prev.x, dyIn = cross.y - prev.y
      const lenIn = Math.sqrt(dxIn * dxIn + dyIn * dyIn)

      if (lenIn > halfGap) {
        const t = 1 - halfGap / lenIn
        curPts.push({ x: prev.x + t * dxIn, y: prev.y + t * dyIn })
        // Gap-edge segment: use original curve data (linear approximation at gap boundary)
        curCurves.push(curves[i - 1])
      }
      if (curPts.length >= 2) subStrands.push({ points: curPts, curves: curCurves })

      if (i + 1 < points.length) {
        const next = points[i + 1]
        const dxOut = next.x - cross.x, dyOut = next.y - cross.y
        const lenOut = Math.sqrt(dxOut * dxOut + dyOut * dyOut)
        if (lenOut > halfGap) {
          const t = halfGap / lenOut
          curPts = [{ x: cross.x + t * dxOut, y: cross.y + t * dyOut }]
          curCurves = []
        } else {
          curPts = [next]
          curCurves = []
          i++ // skip — segment consumed by gap
        }
      } else {
        curPts = []
        curCurves = []
      }
    } else {
      curPts.push(points[i])
      curCurves.push(curves[i - 1])
    }
  }

  if (curPts.length >= 2) subStrands.push({ points: curPts, curves: curCurves })
  return subStrands
}

/* ── Component ──────────────────────────────────────────────────── */

export function StrandLayer({ segments, config }: Props) {
  const { lacing } = config

  const strandData = useMemo(() => buildStrands(segments), [segments])
  const curvedStrands = useMemo(
    () => computeCurves(strandData, segments, config),
    [strandData, segments, config],
  )
  const pointArrays = useMemo(() => curvedStrands.map(cs => cs.points), [curvedStrands])

  const { continuousPaths, strandSubPaths } = useMemo(() => {
    const continuous = curvedStrands.map(cs => curvedPathD(cs))

    if (!lacing.enabled || curvedStrands.length === 0) {
      return { continuousPaths: continuous, strandSubPaths: curvedStrands.map(cs => [curvedPathD(cs)]) }
    }

    const crossings = findCrossings(pointArrays)
    const overIdx = assignOverUnder(crossings, pointArrays.length)

    const gaps: VertexGap[][] = pointArrays.map(() => [])
    const bandWidth = lacing.strandWidth + lacing.gapWidth * 2

    for (let ci = 0; ci < crossings.length; ci++) {
      const c = crossings[ci]
      const overSi = overIdx[ci]
      const underSi = overSi === c.strandA ? c.strandB : c.strandA
      const underPtIdx = underSi === c.strandA ? c.ptIdxA : c.ptIdxB
      const overPtIdx = overSi === c.strandA ? c.ptIdxA : c.ptIdxB

      const sinA = crossingSinAngle(pointArrays[underSi], underPtIdx, pointArrays[overSi], overPtIdx)
      const halfGap = bandWidth / (2 * Math.max(sinA, 0.25))

      gaps[underSi].push({ ptIdx: underPtIdx, halfGap })
    }

    const subPaths = curvedStrands.map((cs, i) =>
      splitCurvedStrandAtGaps(cs, gaps[i]).map(sub => curvedPathD(sub)),
    )

    return { continuousPaths: continuous, strandSubPaths: subPaths }
  }, [curvedStrands, pointArrays, lacing])

  if (curvedStrands.length === 0) return null

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
