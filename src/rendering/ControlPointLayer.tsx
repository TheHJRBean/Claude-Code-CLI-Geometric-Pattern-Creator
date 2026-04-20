import { useMemo } from 'react'
import type { Segment } from '../types/geometry'
import type { PatternConfig, CurveConfig } from '../types/pattern'
import { sub, normalize, perp, scale, add, dist, lerp, dot, type Vec2 } from '../utils/math'

export interface ActiveCurvePoint {
  tileTypeId: string
  index: number
}

interface Props {
  segments: Segment[]
  config: PatternConfig
  active: ActiveCurvePoint | null
  zoom: number
}

interface Marker {
  cp: Vec2
  base: Vec2
  index: number
  isActive: boolean
}

function computeSegmentCPs(seg: Segment, curve: CurveConfig): Vec2[] {
  const { from, to } = seg
  const edgeLen = dist(from, to)
  if (edgeLen < 1e-10) return []

  const traversalDir = normalize(sub(to, from))
  const rawNormal = perp(traversalDir)
  const segMid: Vec2 = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }
  const radial = sub(segMid, seg.polygonCenter)

  let baseNormal: Vec2
  if (seg.polygonSides === 3) {
    const inwardRadial = { x: -radial.x, y: -radial.y }
    baseNormal = dot(rawNormal, inwardRadial) >= 0
      ? rawNormal
      : { x: -rawNormal.x, y: -rawNormal.y }
  } else {
    const cwTangent: Vec2 = { x: radial.y, y: -radial.x }
    baseNormal = dot(rawNormal, cwTangent) >= 0
      ? rawNormal
      : { x: -rawNormal.x, y: -rawNormal.y }
  }

  const dirSign = curve.direction === 'right' ? -1 : 1
  const altActive =
    !!curve.alternating &&
    seg.polygonSides !== 3 &&
    seg.kind !== 'petal' &&
    seg.side === 'plus'
  const altSign = altActive ? -1 : 1
  const sign = dirSign * altSign

  return curve.points.map(cp => {
    const basePoint = lerp(from, to, cp.position)
    return add(basePoint, scale(baseNormal, sign * cp.offset * edgeLen))
  })
}

export function ControlPointLayer({ segments, config, active, zoom }: Props) {
  const markers = useMemo<Marker[]>(() => {
    if (!active) return []
    const fig = config.figures[active.tileTypeId]
    const curve = fig?.curve
    if (!curve?.enabled || !curve.points.length) return []

    const out: Marker[] = []
    for (const seg of segments) {
      if (seg.tileTypeId !== active.tileTypeId) continue
      if (seg.kind === 'petal') continue
      const cps = computeSegmentCPs(seg, curve)
      for (let i = 0; i < cps.length; i++) {
        const base = lerp(seg.from, seg.to, curve.points[i].position)
        out.push({ cp: cps[i], base, index: i, isActive: i === active.index })
      }
    }
    return out
  }, [segments, config, active])

  if (!active || markers.length === 0) return null

  const px = 1 / Math.max(zoom, 1e-6)
  const rActive = 5 * px
  const rIdle = 3 * px
  const swActive = 1.6 * px
  const swIdle = 1 * px
  const tetherActive = 1.3 * px
  const tetherIdle = 0.75 * px
  const dash = `${2 * px} ${2 * px}`

  return (
    <g id="control-point-layer" pointerEvents="none">
      {markers.map((m, i) => (
        <g key={i} opacity={m.isActive ? 1 : 0.55}>
          <line
            x1={m.base.x}
            y1={m.base.y}
            x2={m.cp.x}
            y2={m.cp.y}
            stroke={m.isActive ? '#ff6a3d' : '#ffb38a'}
            strokeWidth={m.isActive ? tetherActive : tetherIdle}
            strokeDasharray={dash}
          />
          <circle
            cx={m.cp.x}
            cy={m.cp.y}
            r={m.isActive ? rActive : rIdle}
            fill={m.isActive ? '#ff6a3d' : '#ffb38a'}
            stroke="#fff"
            strokeWidth={m.isActive ? swActive : swIdle}
          />
        </g>
      ))}
    </g>
  )
}
