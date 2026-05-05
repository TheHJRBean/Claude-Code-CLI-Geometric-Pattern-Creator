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
  firstPick: Vec2 | null
  onPickVertex: (p: Vec2) => void
}

const DOT_RADIUS = 5
const SELECTED_RADIUS = 9
const SELECTED_HALO_RADIUS = 16

export function EditorVertexLayer({ vertices, firstPick, onPickVertex }: Props) {
  return (
    <g id="editor-vertex-layer">
      {vertices.map((v, i) => {
        const isFirst = firstPick != null
          && Math.abs(firstPick.x - v.p.x) < EDITOR_EPS
          && Math.abs(firstPick.y - v.p.y) < EDITOR_EPS
        return (
          <g key={`${v.tileId}#${v.vertexIndex}#${i}`}>
            {isFirst && (
              <>
                {/* Outer pulsing halo so the picked vertex reads instantly. */}
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
                {/* White inner ring for max contrast against any tile fill. */}
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
            {/* Visible dot — selected state is bigger + solid accent. */}
            <circle
              cx={v.p.x}
              cy={v.p.y}
              r={isFirst ? SELECTED_RADIUS : DOT_RADIUS}
              fill={isFirst ? 'var(--accent)' : 'var(--bg)'}
              stroke="var(--accent)"
              strokeWidth={isFirst ? 2.4 : 1.8}
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
            {/* Hit area — bigger than the dot for forgiving clicks. */}
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
      })}
    </g>
  )
}
