import { useMemo } from 'react'
import type { Segment } from '../types/geometry'
import type { LacingConfig } from '../types/pattern'

interface Props {
  segments: Segment[]
  lacing: LacingConfig
}

type Pt = { x: number; y: number }

function ptKey(p: Pt): string {
  return `${p.x.toFixed(4)},${p.y.toFixed(4)}`
}

/**
 * Chain segments into connected polyline strands by following degree-2
 * vertices. Junctions (degree != 2) become strand endpoints.
 * Closed loops are handled naturally — the forward extension wraps
 * around to the start, producing a closed polyline.
 */
function buildStrands(segments: Segment[]): Pt[][] {
  if (segments.length === 0) return []

  const adj = new Map<string, { segIdx: number; other: Pt }[]>()
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i]
    for (const [pt, other] of [[s.from, s.to], [s.to, s.from]] as [Pt, Pt][]) {
      const k = ptKey(pt)
      if (!adj.has(k)) adj.set(k, [])
      adj.get(k)!.push({ segIdx: i, other })
    }
  }

  const visited = new Set<number>()
  const strands: Pt[][] = []

  for (let i = 0; i < segments.length; i++) {
    if (visited.has(i)) continue
    visited.add(i)

    const strand: Pt[] = [segments[i].from, segments[i].to]

    // Extend forward through degree-2 vertices
    for (;;) {
      const tail = strand[strand.length - 1]
      const neighbors = adj.get(ptKey(tail))
      if (!neighbors || neighbors.length !== 2) break
      const next = neighbors.find(n => !visited.has(n.segIdx))
      if (!next) break
      visited.add(next.segIdx)
      strand.push(next.other)
    }

    // Extend backward through degree-2 vertices
    for (;;) {
      const head = strand[0]
      const neighbors = adj.get(ptKey(head))
      if (!neighbors || neighbors.length !== 2) break
      const prev = neighbors.find(n => !visited.has(n.segIdx))
      if (!prev) break
      visited.add(prev.segIdx)
      strand.unshift(prev.other)
    }

    strands.push(strand)
  }

  return strands
}

function strandPath(pts: Pt[]): string {
  return pts.map((p, j) => `${j === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ')
}

export function StrandLayer({ segments, lacing }: Props) {
  const strands = useMemo(() => buildStrands(segments), [segments])

  if (strands.length === 0) return null

  const { strandWidth, gapWidth, strandColor, gapColor } = lacing
  const gapStrokeW = strandWidth + gapWidth * 2

  return (
    <g id="strand-layer">
      {strands.map((pts, i) => {
        const d = strandPath(pts)
        return (
          <g key={i}>
            {lacing.enabled && (
              <path
                d={d}
                fill="none"
                stroke={gapColor}
                strokeWidth={gapStrokeW}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
            <path
              d={d}
              fill="none"
              stroke={strandColor}
              strokeWidth={strandWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        )
      })}
    </g>
  )
}
