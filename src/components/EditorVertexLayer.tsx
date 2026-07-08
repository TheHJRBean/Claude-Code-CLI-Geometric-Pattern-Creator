import { memo } from 'react'
import type React from 'react'
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
type DotVariant = 'patch' | 'boundary' | 'pocket' | 'neighbour' | 'frame' | 'centre'

interface Props {
  vertices: BoundaryVertex[]
  boundaryCorners?: BoundaryVertex[]
  pocketVertices?: BoundaryVertex[]
  neighbourVertices?: BoundaryVertex[]
  /** Frame edge nodes — clickable completion targets when a Frame overlay is present. */
  frameVertices?: BoundaryVertex[]
  /** Cell-centre completion nodes — only present for no-Seed Cells, giving a
   *  radial anchor to build wedge Tiles out to the Boundary corners. */
  centreVertices?: BoundaryVertex[]
  /** Step 17.11.3 — accumulated picks. Length 0 or 1 in chord mode; arbitrary in multi mode. */
  picks: Vec2[]
  /** Step 17.11.4 — `null` = no preview, `true|false` = valid/invalid tint. */
  previewValid?: boolean | null
  /** Bug 12 — human-readable reason rendered next to the preview polygon
   * when validation fails. Empty when the polygon is valid. */
  previewMessage?: string | null
  /** True when the current rejection is a soft rule (overlap / inside-tile)
   *  the user can override. Toggles the Accept-and-continue-anyway button. */
  previewForceable?: boolean
  /** Fires when the user clicks Accept-and-continue-anyway. */
  onForceCommitMulti?: () => void
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
    case 'frame':
      // Solid accent dot rimmed in bg — reads as a distinct "frame node" target
      // sitting on the frame outline, set apart from the hollow patch dots and
      // the faint neighbour ghosts.
      return { radius: DOT_RADIUS + 1, fill: 'var(--accent)', stroke: 'var(--bg)', strokeWidth: 2 }
    case 'centre':
      // Larger solid accent disc with a bg rim — sits alone at the middle of an
      // empty no-Seed Cell, so it should read as the obvious "start here" anchor.
      return { radius: DOT_RADIUS + 2, fill: 'var(--accent)', stroke: 'var(--bg)', strokeWidth: 2.4 }
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

// Memoised: the Complete-mode vertex layer is the heaviest overlay — in
// Show-neighbours it renders `neighbourVertices` across the whole visible
// lattice. Bailing on stable props (all vertex sets are memoised in Canvas;
// `onPickVertex` / `onForceCommitMulti` are useCallback'd in the Lab) stops it
// re-creating every dot each pan frame.
export const EditorVertexLayer = memo(function EditorVertexLayer({
  vertices,
  boundaryCorners = [],
  pocketVertices = [],
  neighbourVertices = [],
  frameVertices = [],
  centreVertices = [],
  picks,
  previewValid = null,
  previewMessage = null,
  previewForceable = false,
  onForceCommitMulti,
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
      {frameVertices.map((v, i) => (
        <VertexDot
          key={`f-${v.tileId}#${v.vertexIndex}#${i}`}
          v={v}
          variant="frame"
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
      {centreVertices.map((v, i) => (
        <VertexDot
          key={`c-${v.tileId}#${v.vertexIndex}#${i}`}
          v={v}
          variant="centre"
          picks={picks}
          onPickVertex={onPickVertex}
        />
      ))}
      {/* Rejection pill + soft-override button render AFTER the dots so they
          sit on top in z-order. The button uses onPointerDown (not onClick)
          to win the event race against any vertex dot's onPointerDown that
          might be underneath the button's hit area. */}
      {showPreview && !previewValid && previewMessage && (
        <RejectionPill
          x={labelX}
          y={labelY}
          message={previewMessage}
          forceable={previewForceable}
          onForce={onForceCommitMulti}
        />
      )}
    </g>
  )
})

/* ── Rejection pill + Art-Deco override button ─────────────── */

const PILL_H = 30
const BTN_W = 240
const BTN_H = 32
const BTN_GAP = 10
const PILL_CHAR_W = 6.8 // EB Garamond @ 13.5px ≈ avg glyph width

function RejectionPill({
  x, y, message, forceable, onForce,
}: {
  x: number
  y: number
  message: string
  forceable: boolean
  onForce?: () => void
}) {
  // Auto-fit width to message length so long rejections (e.g. the
  // no-real-cell-pick precondition at 72 chars) don't clip.
  const pillW = Math.max(280, message.length * PILL_CHAR_W + 32)
  return (
    <g>
      {/* Rejection message pill — non-interactive, theme-aware. */}
      <rect
        x={x - pillW / 2}
        y={y - PILL_H / 2}
        width={pillW}
        height={PILL_H}
        rx={4}
        fill="var(--bg-elevated)"
        fillOpacity={0.96}
        stroke={DANGER_COLOR}
        strokeWidth={1.4}
        vectorEffect="non-scaling-stroke"
        pointerEvents="none"
      />
      <text
        x={x}
        y={y + 5}
        textAnchor="middle"
        fontFamily="'EB Garamond', Georgia, serif"
        fontSize={13.5}
        fill={DANGER_COLOR}
        pointerEvents="none"
      >
        {message}
      </text>
      {forceable && onForce && (
        <SoftOverrideButton
          x={x}
          y={y + PILL_H / 2 + BTN_GAP + BTN_H / 2}
          onForce={onForce}
        />
      )}
    </g>
  )
}

function SoftOverrideButton({
  x, y, onForce,
}: { x: number; y: number; onForce: () => void }) {
  const fire = (ev: React.PointerEvent<SVGGElement>) => {
    ev.stopPropagation()
    ev.preventDefault()
    onForce()
  }
  // Diamond ornament path centred on (cx, cy) with given half-size.
  const diamond = (cx: number, cy: number, r: number) =>
    `M ${cx} ${cy - r} L ${cx + r} ${cy} L ${cx} ${cy + r} L ${cx - r} ${cy} Z`
  const ornamentY = y
  const ornamentR = 3.2
  return (
    <g
      className="editor-soft-override-btn"
      onPointerDown={fire}
    >
      {/* Hit area covers entire button including ornaments. */}
      <rect
        x={x - BTN_W / 2}
        y={y - BTN_H / 2}
        width={BTN_W}
        height={BTN_H}
        rx={3}
        className="editor-soft-override-bg"
        fill="var(--bg-elevated)"
        stroke="var(--accent)"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
      {/* Inset hairline — classic Art Deco double-line border. */}
      <rect
        x={x - BTN_W / 2 + 3}
        y={y - BTN_H / 2 + 3}
        width={BTN_W - 6}
        height={BTN_H - 6}
        rx={2}
        fill="none"
        stroke="var(--accent)"
        strokeOpacity={0.35}
        strokeWidth={0.6}
        vectorEffect="non-scaling-stroke"
        pointerEvents="none"
      />
      {/* Flanking diamond ornaments. */}
      <path
        d={diamond(x - BTN_W / 2 + 16, ornamentY, ornamentR)}
        fill="var(--accent)"
        pointerEvents="none"
      />
      <path
        d={diamond(x + BTN_W / 2 - 16, ornamentY, ornamentR)}
        fill="var(--accent)"
        pointerEvents="none"
      />
      <text
        x={x}
        y={y + 4}
        textAnchor="middle"
        fontFamily="'EB Garamond', Georgia, serif"
        fontSize={11}
        fontWeight={600}
        letterSpacing={2.2}
        fill="var(--accent)"
        pointerEvents="none"
        style={{ textTransform: 'uppercase' }}
      >
        Accept and continue
      </text>
    </g>
  )
}
