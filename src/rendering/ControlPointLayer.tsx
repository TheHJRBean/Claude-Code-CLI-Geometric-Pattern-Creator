import { memo, useMemo } from 'react'
import type { Segment } from '../types/geometry'
import type { PatternConfig, CurveConfig } from '../types/pattern'
import { scale, add, dist, lerp, type Vec2 } from '../utils/math'
import { buildStrands } from '../strand/buildStrands'
import {
  buildAlternatingParity,
  resolveSegmentCurve,
  segmentBaseNormal,
  segmentCurveSign,
} from '../strand/computeCurves'

interface Props {
  segments: Segment[]
  config: PatternConfig
  visible: Record<string, boolean>
  active: Record<string, number>
  zoom: number
}

interface Marker {
  cp: Vec2
  base: Vec2
  index: number
  isActive: boolean
}

/**
 * Where the draggable handles sit for one segment. Geometry is deliberately
 * borrowed from `computeCurves` rather than restated: these handles claim to
 * show the curve the renderer draws, so any local copy of the normal/sign rule
 * is a handle that lies the moment the two drift. They did — this layer kept
 * the pre-#42 `seg.side === 'plus'` parity and the pre-#42 curve lookup.
 *
 * The one thing not borrowed is `computeCurves`' traversal-reversal handling:
 * that mirrors control points into the STRAND's direction of travel, and these
 * handles are drawn per segment in its own from→to direction.
 */
function computeSegmentCPs(seg: Segment, curve: CurveConfig, altFlipped: boolean): Vec2[] {
  const { from, to } = seg
  const edgeLen = dist(from, to)
  if (edgeLen < 1e-10) return []

  const baseNormal = segmentBaseNormal(seg, from, to)
  const sign = segmentCurveSign(curve, altFlipped)

  return curve.points.map(cp => {
    const basePoint = lerp(from, to, cp.position)
    return add(basePoint, scale(baseNormal, sign * cp.offset * edgeLen))
  })
}

export const ControlPointLayer = memo(function ControlPointLayer({ segments, config, visible, active, zoom }: Props) {
  const markers = useMemo<Marker[]>(() => {
    const out: Marker[] = []
    // Alternating parity is strand-scoped for ray-less families, so the chains
    // have to be built here too. Same input as StrandLayer's, so same answer.
    const altParity = buildAlternatingParity(segments, buildStrands(segments))
    for (let s = 0; s < segments.length; s++) {
      const seg = segments[s]
      if (!visible[seg.tileTypeId]) continue
      const curve = resolveSegmentCurve(config.figures[seg.tileTypeId], seg)
      if (!curve?.enabled || !curve.points.length) continue
      const cps = computeSegmentCPs(seg, curve, altParity.get(s) ?? false)
      const activeIdx = active[seg.tileTypeId] ?? 0
      for (let i = 0; i < cps.length; i++) {
        const base = lerp(seg.from, seg.to, curve.points[i].position)
        out.push({ cp: cps[i], base, index: i, isActive: i === activeIdx })
      }
    }
    return out
  }, [segments, config, visible, active])

  if (markers.length === 0) return null

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
})
