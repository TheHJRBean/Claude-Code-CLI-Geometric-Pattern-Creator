import type { Vec2 } from '../utils/math'
import type { Segment } from '../types/geometry'

function ptKey(p: Vec2): string {
  return `${p.x.toFixed(4)},${p.y.toFixed(4)}`
}

/**
 * Chain segments into connected polyline strands by pairing segments
 * at each vertex by angle continuity — the most collinear pair
 * (angle difference closest to π) continues as the same strand.
 */
export function buildStrands(segments: Segment[]): Vec2[][] {
  if (segments.length === 0) return []

  const adj = new Map<string, { segIdx: number; other: Vec2; angle: number }[]>()
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i]
    for (const [pt, other] of [[s.from, s.to], [s.to, s.from]] as [Vec2, Vec2][]) {
      const k = ptKey(pt)
      const angle = Math.atan2(other.y - pt.y, other.x - pt.x)
      if (!adj.has(k)) adj.set(k, [])
      adj.get(k)!.push({ segIdx: i, other, angle })
    }
  }

  const pairing = new Map<string, Map<number, number>>()
  for (const [vk, neighbors] of adj) {
    const pairMap = new Map<number, number>()
    const used = new Set<number>()
    for (let j = 0; j < neighbors.length; j++) {
      if (used.has(neighbors[j].segIdx)) continue
      let bestIdx = -1
      let bestDiff = -1
      for (let k = j + 1; k < neighbors.length; k++) {
        if (used.has(neighbors[k].segIdx)) continue
        let diff = Math.abs(neighbors[j].angle - neighbors[k].angle)
        if (diff > Math.PI) diff = 2 * Math.PI - diff
        if (diff > bestDiff) {
          bestDiff = diff
          bestIdx = k
        }
      }
      if (bestIdx >= 0) {
        pairMap.set(neighbors[j].segIdx, neighbors[bestIdx].segIdx)
        pairMap.set(neighbors[bestIdx].segIdx, neighbors[j].segIdx)
        used.add(neighbors[j].segIdx)
        used.add(neighbors[bestIdx].segIdx)
      }
    }
    pairing.set(vk, pairMap)
  }

  const visited = new Set<number>()
  const strands: Vec2[][] = []

  for (let i = 0; i < segments.length; i++) {
    if (visited.has(i)) continue
    visited.add(i)
    const strand: Vec2[] = [segments[i].from, segments[i].to]

    let fwdSeg = i
    for (;;) {
      const tail = strand[strand.length - 1]
      const vk = ptKey(tail)
      const pairMap = pairing.get(vk)
      if (!pairMap) break
      const nextSeg = pairMap.get(fwdSeg)
      if (nextSeg === undefined || visited.has(nextSeg)) break
      visited.add(nextSeg)
      const neighbors = adj.get(vk)!
      const entry = neighbors.find(n => n.segIdx === nextSeg)!
      strand.push(entry.other)
      fwdSeg = nextSeg
    }

    let bwdSeg = i
    for (;;) {
      const head = strand[0]
      const vk = ptKey(head)
      const pairMap = pairing.get(vk)
      if (!pairMap) break
      const prevSeg = pairMap.get(bwdSeg)
      if (prevSeg === undefined || visited.has(prevSeg)) break
      visited.add(prevSeg)
      const neighbors = adj.get(vk)!
      const entry = neighbors.find(n => n.segIdx === prevSeg)!
      strand.unshift(entry.other)
      bwdSeg = prevSeg
    }

    strands.push(strand)
  }

  return strands
}
