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
  /** Step 17.11.3 — accumulated picks. Length 0 or 1 in chord mode; arbitrary in multi mode. */
  picks: Vec2[]
  /** Step 17.11.4 — `null` = no preview, `true|false` = valid/invalid tint. */
  previewValid?: boolean | null
  /** Bug 12 — human-readable reason rendered next to the preview polygon
   * when validation fails. Empty when the polygon is valid. */
  previewMessage?: string | null
  /** Step 17.11.3 — modifier state passed through so the parent can branch into multi mode. */
  onPickVertex: (p: Vec2, ctrlOrCmd: boolean) => void
}

const DANGER_COLOR = '#a85050'

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

function styleFor(variant: DotVariant, isPicked: boolean): DotStyle {
  if (isPicked) {
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
  picks: Vec2[]
  onPickVertex: (p: Vec2, ctrlOrCmd: boolean) => void
}

function VertexDot({ v, variant, picks, onPickVertex }: DotProps) {
  const isPicked = picks.some(q =>
    Math.abs(q.x - v.p.x) < EDITOR_EPS && Math.abs(q.y - v.p.y) < EDITOR_EPS,
  )
  const style = styleFor(variant, isPicked)
  return (
    <g>
      {isPicked && (
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
          onPickVertex(v.p, ev.ctrlKey || ev.metaKey)
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
  picks,
  previewValid = null,
  previewMessage = null,
  onPickVertex,
}: Props) {
  // 17.11.4 — preview the in-progress polygon when the picker has at least
  // 3 picks. Tint flips to `DANGER_COLOR` on invalid pick sequences so the
  // user gets immediate feedback while drawing.
  const showPreview = previewValid !== null && picks.length >= 3
  const previewColor = previewValid ? 'var(--accent)' : DANGER_COLOR
  const previewPoints = picks.map(p => `${p.x},${p.y}`).join(' ')
  // Centroid of picks → anchor for the rejection-reason label.
  const labelX = picks.length > 0 ? picks.reduce((s, p) => s + p.x, 0) / picks.length : 0
  const labelY = picks.length > 0 ? picks.reduce((s, p) => s + p.y, 0) / picks.length : 0
  return (
    <g id="editor-vertex-layer">
      {showPreview && (
        <polygon
          points={previewPoints}
          fill={previewColor}
          fillOpacity={0.18}
          stroke={previewColor}
          strokeOpacity={0.6}
          strokeWidth={1.4}
          strokeDasharray={previewValid ? undefined : '4 3'}
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
      )}
      {showPreview && !previewValid && previewMessage && (
        <g pointerEvents="none">
          <rect
            x={labelX - 130}
            y={labelY - 14}
            width={260}
            height={28}
            rx={5}
            fill="var(--bg)"
            fillOpacity={0.92}
            stroke={DANGER_COLOR}
            strokeWidth={1.4}
            vectorEffect="non-scaling-stroke"
          />
          <text
            x={labelX}
            y={labelY + 5}
            textAnchor="middle"
            fontFamily="'EB Garamond', Georgia, serif"
            fontSize={13}
            fill={DANGER_COLOR}
          >
            {previewMessage}
          </text>
        </g>
      )}
      {/* Render order, bottom → top: neighbour ghosts (lowest priority),
          boundary corners, pocket vertices, patch vertices. Selection halo
          inside `VertexDot` keeps the picked dot visually on top within its
          variant. */}
      {neighbourVertices.map((v, i) => (
        <VertexDot
          key={`n-${v.tileId}#${v.vertexIndex}#${i}`}
          v={v}
          variant="neighbour"
          picks={picks}
          onPickVertex={onPickVertex}
        />
      ))}
      {boundaryCorners.map((v, i) => (
        <VertexDot
          key={`b-${v.tileId}#${v.vertexIndex}#${i}`}
          v={v}
          variant="boundary"
          picks={picks}
          onPickVertex={onPickVertex}
        />
      ))}
      {pocketVertices.map((v, i) => (
        <VertexDot
          key={`k-${v.tileId}#${v.vertexIndex}#${i}`}
          v={v}
          variant="pocket"
          picks={picks}
          onPickVertex={onPickVertex}
        />
      ))}
      {vertices.map((v, i) => (
        <VertexDot
          key={`p-${v.tileId}#${v.vertexIndex}#${i}`}
          v={v}
          variant="patch"
          picks={picks}
          onPickVertex={onPickVertex}
        />
      ))}
    </g>
  )
}
