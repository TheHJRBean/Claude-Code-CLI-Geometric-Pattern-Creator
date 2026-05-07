import type { Vec2 } from '../utils/math'
import type { BoundaryVertex } from '../editor/boundary'
import { EDITOR_EPS } from '../editor/exposedEdges'

/**
 * Step 17.5 / 17.11 — interactive vertex layer used in Complete mode. Every
 * selectable vertex (patch outer cycle / boundary corners / interior pockets
 * / one-ring neighbour stamps) gets a clickable dot. Picks accumulate via
 * the multi-pick state machine in `TessellationLabMode`.
 *
 * Variants:
 *   - `patch`     — outer-cycle vertex of the patch (filled, solid).
 *   - `boundary`  — boundary-polygon corner (hollow, dashed).
 *   - `pocket`    — vertex on an interior pocket cycle (filled-tinted).
 *   - `neighbour` — vertex on a one-ring neighbour stamp's outer cycle
 *                   (ghosted; only surfaces when "Show neighbours" is on).
 *
 * Dots use `vectorEffect="non-scaling-stroke"` so they stay the same size at
 * any zoom, mirroring the edge layer's behaviour.
 */
type DotVariant = 'patch' | 'boundary' | 'pocket' | 'neighbour'

interface Props {
  vertices: BoundaryVertex[]
  boundaryCorners?: BoundaryVertex[]
  pocketVertices?: BoundaryVertex[]
  neighbourVertices?: BoundaryVertex[]
  firstPick: Vec2 | null
  onPickVertex: (p: Vec2) => void
}

const DOT_RADIUS = 5
const NEIGHBOUR_DOT_RADIUS = 4
const SELECTED_RADIUS = 9
const SELECTED_HALO_RADIUS = 16

interface DotStyle {
  radius: number
  fill: string
  fillOpacity?: number
  stroke: string
  strokeOpacity?: number
  strokeWidth: number
  strokeDasharray?: string
}

function styleFor(variant: DotVariant, isFirst: boolean): DotStyle {
  if (isFirst) {
    return { radius: SELECTED_RADIUS, fill: 'var(--accent)', stroke: 'var(--accent)', strokeWidth: 2.4 }
  }
  switch (variant) {
    case 'patch':
      return { radius: DOT_RADIUS, fill: 'var(--bg)', stroke: 'var(--accent)', strokeWidth: 1.8 }
    case 'boundary':
      return { radius: DOT_RADIUS, fill: 'transparent', stroke: 'var(--accent)', strokeWidth: 1.6, strokeDasharray: '2 2' }
    case 'pocket':
      // Solid tinted fill so the user can tell pocket vertices apart from
      // outer-cycle vertices — they sit inside the patch outline rather than
      // around it. Same size as patch dots so they read as equally pickable.
      return { radius: DOT_RADIUS, fill: 'var(--accent)', fillOpacity: 0.55, stroke: 'var(--accent)', strokeWidth: 1.8 }
    case 'neighbour':
      // Ghost styling — matches the one-ring neighbour-stamp opacity so the
      // dots feel attached to the ghost geometry rather than the live patch.
      return {
        radius: NEIGHBOUR_DOT_RADIUS,
        fill: 'var(--bg)',
        fillOpacity: 0.55,
        stroke: 'var(--accent)',
        strokeOpacity: 0.45,
        strokeWidth: 1.4,
      }
  }
}

interface DotProps {
  v: BoundaryVertex
  variant: DotVariant
  firstPick: Vec2 | null
  onPickVertex: (p: Vec2) => void
}

function VertexDot({ v, variant, firstPick, onPickVertex }: DotProps) {
  const isFirst = firstPick != null
    && Math.abs(firstPick.x - v.p.x) < EDITOR_EPS
    && Math.abs(firstPick.y - v.p.y) < EDITOR_EPS
  const style = styleFor(variant, isFirst)
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
      <circle
        cx={v.p.x}
        cy={v.p.y}
        r={style.radius}
        fill={style.fill}
        fillOpacity={style.fillOpacity}
        stroke={style.stroke}
        strokeOpacity={style.strokeOpacity}
        strokeWidth={style.strokeWidth}
        strokeDasharray={style.strokeDasharray}
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

export function EditorVertexLayer({
  vertices,
  boundaryCorners = [],
  pocketVertices = [],
  neighbourVertices = [],
  firstPick,
  onPickVertex,
}: Props) {
  return (
    <g id="editor-vertex-layer">
      {/* Render order, bottom → top: neighbour ghosts (lowest priority),
          boundary corners, pocket vertices, patch vertices. Selection halo
          inside `VertexDot` keeps the picked dot visually on top within its
          variant. */}
      {neighbourVertices.map((v, i) => (
        <VertexDot
          key={`n-${v.tileId}#${v.vertexIndex}#${i}`}
          v={v}
          variant="neighbour"
          firstPick={firstPick}
          onPickVertex={onPickVertex}
        />
      ))}
      {boundaryCorners.map((v, i) => (
        <VertexDot
          key={`b-${v.tileId}#${v.vertexIndex}#${i}`}
          v={v}
          variant="boundary"
          firstPick={firstPick}
          onPickVertex={onPickVertex}
        />
      ))}
      {pocketVertices.map((v, i) => (
        <VertexDot
          key={`k-${v.tileId}#${v.vertexIndex}#${i}`}
          v={v}
          variant="pocket"
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
