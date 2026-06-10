import { useMemo, useState } from 'react'
import type { Vec2 } from '../utils/math'
import type { GroupingScope } from '../types/editor'
import type { ClickedTargetKeys } from '../decoration/scopes'
import type { PaintVoid, StrandHit } from '../decoration/resolve'

export type PaintTarget = 'off' | 'voids' | 'strands'

/** Which Grouping-scope rung a Void click binds at (ADR-0005 ladder).
 * `cell` = the clicked Void plus its rotation/mirror twins within its Cell. */
export type VoidPaintScope = 'congruent' | 'cell' | 'patch' | 'instance'

/** Which rung a Strand click binds at. `all` = the congruent `'*'` record;
 * `cell` = the strand's symmetry twins within its Cell;
 * `patch` = the clicked strand's Lattice orbit ("this strand, every repeat"). */
export type StrandPaintScope = 'all' | 'congruent' | 'cell' | 'patch'

export interface PaintPayload {
  scope: GroupingScope
  key: string
  /** Full identity-key set of the clicked target — lets the reducer clear
   * finer-scope records masking it ("paint what you see"). */
  clicked: ClickedTargetKeys
}

/**
 * Step 19.3 / Stage 2 — Decoration **Paint mode** canvas overlay. A manual
 * **Paint target** (Off · Voids · Strands) decides what is clickable, and a
 * per-target **Paint scope** decides how far a click reaches:
 *
 * - **Voids**: hover highlights exactly the group the active scope would
 *   paint — every congruent Void, the Lattice orbit (`patch`), or just the
 *   one under the cursor (`instance`) — and a click Fills it
 *   (`onPaintVoid({ scope, key })`).
 * - **Strands**: hover highlights all Strands (`all`), the congruent group,
 *   or the single strand's orbit (`patch`); click colours the group
 *   (`onPaintStrand({ scope, key })`).
 *
 * Rendered topmost (PatternSVG's overlay slot) and uses `onPointerDown` so the
 * click beats the pan handler and the strokes painted below.
 *
 * The hit-targets are memoised separately from the hover highlight, so moving
 * the cursor (which updates the hover state on every pointer event) only
 * re-renders the small highlight set — not the hundreds of hit paths (which
 * were the lag at high zoom).
 */
export function DecorationPaintLayer({
  target,
  voids,
  strandHits,
  voidScope,
  strandScope,
  activeColor,
  zoom,
  onPaintVoid,
  onPaintStrand,
}: {
  target: PaintTarget
  voids: PaintVoid[]
  strandHits: StrandHit[]
  voidScope: VoidPaintScope
  strandScope: StrandPaintScope
  activeColor: string
  zoom: number
  onPaintVoid: (payload: PaintPayload) => void
  onPaintStrand: (payload: PaintPayload) => void
}) {
  const [hoveredVoid, setHoveredVoid] = useState<number | null>(null)
  const [hoveredStrand, setHoveredStrand] = useState<number | null>(null)

  const voidKey = (v: PaintVoid): string =>
    voidScope === 'congruent' ? v.signature
      : voidScope === 'cell' ? v.cellKey
        : voidScope === 'patch' ? v.patchKey
          : v.instanceKey

  const voidHits = useMemo(() => voids.map((v, i) => (
    <path
      key={i}
      d={polygonPath(v.polygon)}
      fill="transparent"
      stroke="none"
      style={{ cursor: BUCKET_CURSOR }}
      onPointerEnter={() => setHoveredVoid(i)}
      onPointerLeave={() => setHoveredVoid(h => (h === i ? null : h))}
      onPointerDown={e => {
        e.stopPropagation()
        onPaintVoid({
          scope: voidScope,
          key: voidKey(v),
          clicked: { signature: v.signature, cellKey: v.cellKey, patchKey: v.patchKey, instanceKey: v.instanceKey },
        })
      }}
    />
    // eslint-disable-next-line react-hooks/exhaustive-deps
  )), [voids, onPaintVoid, voidScope])

  const voidHighlight = useMemo(() => {
    if (hoveredVoid === null || hoveredVoid >= voids.length) return null
    const k = voidKey(voids[hoveredVoid])
    return voids.filter(v => voidKey(v) === k).map((v, i) => (
      <path
        key={`hl-${i}`}
        d={polygonPath(v.polygon)}
        fill={activeColor}
        fillOpacity={0.35}
        stroke={activeColor}
        strokeOpacity={0.95}
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        pointerEvents="none"
      />
    ))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoveredVoid, voids, voidScope, activeColor])

  const strandPayload = (s: StrandHit): PaintPayload => {
    const clicked: ClickedTargetKeys = { signature: s.signature, cellKey: s.cellKey, patchKey: s.patchKey }
    return strandScope === 'all'
      ? { scope: 'congruent', key: '*', clicked }
      : strandScope === 'congruent'
        ? { scope: 'congruent', key: s.signature, clicked }
        : strandScope === 'cell'
          ? { scope: 'cell', key: s.cellKey, clicked }
          : { scope: 'patch', key: s.patchKey, clicked }
  }

  const strandHitEls = useMemo(() => {
    const hitWidth = 10 / zoom // constant ~10px screen hit width
    return strandHits.map((s, i) => (
      <line
        key={i}
        x1={s.from.x} y1={s.from.y} x2={s.to.x} y2={s.to.y}
        stroke="transparent"
        strokeWidth={hitWidth}
        strokeLinecap="round"
        style={{ cursor: BUCKET_CURSOR }}
        onPointerEnter={() => setHoveredStrand(i)}
        onPointerLeave={() => setHoveredStrand(h => (h === i ? null : h))}
        onPointerDown={e => { e.stopPropagation(); onPaintStrand(strandPayload(s)) }}
      />
    ))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strandHits, zoom, onPaintStrand, strandScope])

  const strandHighlight = useMemo(() => {
    if (hoveredStrand === null || hoveredStrand >= strandHits.length) return null
    const h = strandHits[hoveredStrand]
    const inGroup: (s: StrandHit) => boolean =
      strandScope === 'all' ? () => true
        : strandScope === 'congruent' ? s => s.signature === h.signature
          : strandScope === 'cell' ? s => s.cellKey === h.cellKey
            : s => s.patchKey === h.patchKey
    return strandHits.filter(inGroup).map((s, i) => (
      <line
        key={`hl-${i}`}
        x1={s.from.x} y1={s.from.y} x2={s.to.x} y2={s.to.y}
        stroke={activeColor}
        strokeOpacity={0.9}
        strokeWidth={3}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        pointerEvents="none"
      />
    ))
  }, [hoveredStrand, strandHits, strandScope, activeColor])

  if (target === 'voids') {
    return <g id="decoration-paint-layer">{voidHighlight}{voidHits}</g>
  }

  if (target === 'strands') {
    return <g id="decoration-paint-layer">{strandHighlight}{strandHitEls}</g>
  }

  return null
}

function polygonPath(poly: Vec2[]): string {
  if (poly.length < 3) return ''
  return `M${poly.map(p => `${p.x},${p.y}`).join('L')}Z`
}

/** A small paint-bucket cursor so the user sees they're in Paint mode. */
const BUCKET_CURSOR =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><path d='M11 3l8 8-7 7-8-8z' fill='%23d4af37' stroke='%23222' stroke-width='1.2' stroke-linejoin='round'/><path d='M19.5 13c.9 1.6 1.7 2.6 1.7 3.6a1.7 1.7 0 11-3.4 0c0-1 .8-2 1.7-3.6z' fill='%23d4af37' stroke='%23222' stroke-width='1'/></svg>\") 3 20, pointer"
