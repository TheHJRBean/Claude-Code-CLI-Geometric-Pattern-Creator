import type { Vec2 } from '../utils/math'
import type { BoundaryVertex } from '../editor/boundary'
import { EDITOR_EPS } from '../editor/exposedEdges'

/**
 * Step 17.5 — interactive vertex layer used in Complete mode. Every outer
 * boundary vertex gets a clickable dot. The first pick highlights the
 * starting vertex; the second pick triggers a gap-completion dispatch.
 *
 * The dot is drawn with `vectorEffect="non-scaling-stroke"` so it stays
 * the same size at any zoom, mirroring the edge layer's behaviour.
 */
interface Props {
  vertices: BoundaryVertex[]
  /** Boundary-polygon corners — rendered as a distinct outlined dot so the
   * user can tell them apart from patch outer-cycle vertices. */
  boundaryCorners?: BoundaryVertex[]
  firstPick: Vec2 | null
  onPickVertex: (p: Vec2) => void
}

const DOT_RADIUS = 5
const SELECTED_RADIUS = 9
const SELECTED_HALO_RADIUS = 16

interface DotProps {
  v: BoundaryVertex
  variant: 'patch' | 'boundary'
  firstPick: Vec2 | null
  onPickVertex: (p: Vec2) => void
}

function VertexDot({ v, variant, firstPick, onPickVertex }: DotProps) {
  const isFirst = firstPick != null
    && Math.abs(firstPick.x - v.p.x) < EDITOR_EPS
    && Math.abs(firstPick.y - v.p.y) < EDITOR_EPS
  const isBoundary = variant === 'boundary'
  return (
    <g>
      {isFirst && (
        <>
          <circle
            cx={v.p.x}
            cy={v.p.y}
            r={SELECTED_HALO_RADIUS}
            fill="var(--accent)"
            fillOpacity={0.18}
            stroke="var(--accent)"
            strokeOpacity={0.55}
            strokeWidth={1.4}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          >
            <animate
              attributeName="r"
              values={`${SELECTED_HALO_RADIUS};${SELECTED_HALO_RADIUS + 4};${SELECTED_HALO_RADIUS}`}
              dur="1.6s"
              repeatCount="indefinite"
            />
            <animate
              attributeName="fill-opacity"
              values="0.22;0.08;0.22"
              dur="1.6s"
              repeatCount="indefinite"
            />
          </circle>
          <circle
            cx={v.p.x}
            cy={v.p.y}
            r={SELECTED_RADIUS + 2}
            fill="none"
            stroke="var(--bg)"
            strokeWidth={2.4}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        </>
      )}
      {/* Boundary-corner dots use a hollow ring (no fill) to differentiate
          them from patch outer-cycle dots when the user picks a chord. */}
      <circle
        cx={v.p.x}
        cy={v.p.y}
        r={isFirst ? SELECTED_RADIUS : DOT_RADIUS}
        fill={isFirst ? 'var(--accent)' : isBoundary ? 'transparent' : 'var(--bg)'}
        stroke="var(--accent)"
        strokeWidth={isFirst ? 2.4 : isBoundary ? 1.6 : 1.8}
        strokeDasharray={isBoundary && !isFirst ? '2 2' : undefined}
        vectorEffect="non-scaling-stroke"
        pointerEvents="none"
      />
      <circle
        cx={v.p.x}
        cy={v.p.y}
        r={DOT_RADIUS * 2.4}
        fill="transparent"
        style={{ cursor: 'pointer' }}
        onPointerDown={ev => {
          ev.stopPropagation()
          onPickVertex(v.p)
        }}
      />
    </g>
  )
}

export function EditorVertexLayer({ vertices, boundaryCorners = [], firstPick, onPickVertex }: Props) {
  return (
    <g id="editor-vertex-layer">
      {boundaryCorners.map((v, i) => (
        <VertexDot
          key={`b-${v.tileId}#${v.vertexIndex}#${i}`}
          v={v}
          variant="boundary"
          firstPick={firstPick}
          onPickVertex={onPickVertex}
        />
      ))}
      {vertices.map((v, i) => (
        <VertexDot
          key={`p-${v.tileId}#${v.vertexIndex}#${i}`}
          v={v}
          variant="patch"
          firstPick={firstPick}
          onPickVertex={onPickVertex}
        />
      ))}
    </g>
  )
}
