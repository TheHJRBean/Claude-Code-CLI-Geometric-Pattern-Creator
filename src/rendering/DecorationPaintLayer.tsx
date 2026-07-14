import { useMemo, useState } from 'react'
import type { Vec2 } from '../utils/math'
import type { GroupingScope } from '../types/editor'
import type { ClickedTargetKeys } from '../decoration/scopes'
import type { PaintVoid, StrandHit } from '../decoration/resolve'
import { nearestSegmentIndex, polygonPath } from './svgGeometry'

export type PaintTarget = 'off' | 'voids' | 'strands' | 'stamp'

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
  // Stamp target: a Void click selects its congruent shape for the panel's
  // inspector / export / upload flow (no painting); the selected signature's
  // group renders a persistent outline highlight.
  onSelectStampVoid,
  selectedStampSignature,
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
  onSelectStampVoid?: (v: PaintVoid) => void
  selectedStampSignature?: string | null
}) {
  const [hoveredVoid, setHoveredVoid] = useState<number | null>(null)
  const [hoveredStrand, setHoveredStrand] = useState<number | null>(null)

  // Stamp mode always groups by congruent signature (v1 stamp scope).
  const stampMode = target === 'stamp'
  const voidKey = (v: PaintVoid): string =>
    stampMode || voidScope === 'congruent' ? v.signature
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
        if (stampMode) {
          onSelectStampVoid?.(v)
          return
        }
        onPaintVoid({
          scope: voidScope,
          key: voidKey(v),
          clicked: { signature: v.signature, cellKey: v.cellKey, patchKey: v.patchKey, instanceKey: v.instanceKey },
        })
      }}
    />
    // eslint-disable-next-line react-hooks/exhaustive-deps
  )), [voids, onPaintVoid, voidScope, stampMode, onSelectStampVoid])

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

  // One transparent catch-all rect + math hit-testing instead of a DOM
  // element per hit segment. A dense patch zoomed out is segments × visible
  // stamps — easily tens of thousands of <line> elements — and mounting them
  // froze the tab the moment the Strands target was selected. The hits stay
  // data; the DOM cost is one rect plus a single highlight <path>.
  const strandBBox = useMemo(() => {
    if (strandHits.length === 0) return null
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const s of strandHits) {
      minX = Math.min(minX, s.from.x, s.to.x); maxX = Math.max(maxX, s.from.x, s.to.x)
      minY = Math.min(minY, s.from.y, s.to.y); maxY = Math.max(maxY, s.from.y, s.to.y)
    }
    return { minX, minY, maxX, maxY }
  }, [strandHits])

  const toWorld = (e: React.PointerEvent<SVGRectElement>): Vec2 | null => {
    const svg = e.currentTarget.ownerSVGElement
    const ctm = svg?.getScreenCTM()
    if (!svg || !ctm) return null
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse())
    return { x: pt.x, y: pt.y }
  }

  const strandIndexAt = (p: Vec2): number | null =>
    // ~constant screen-space pick radius; a miss falls through to the pan handler.
    nearestSegmentIndex(p, strandHits, 6 / zoom)

  const strandCatcher = strandBBox && (
    <rect
      x={strandBBox.minX - 10 / zoom}
      y={strandBBox.minY - 10 / zoom}
      width={strandBBox.maxX - strandBBox.minX + 20 / zoom}
      height={strandBBox.maxY - strandBBox.minY + 20 / zoom}
      fill="transparent"
      style={hoveredStrand !== null ? { cursor: BUCKET_CURSOR } : undefined}
      onPointerMove={e => {
        const p = toWorld(e)
        setHoveredStrand(p ? strandIndexAt(p) : null)
      }}
      onPointerLeave={() => setHoveredStrand(null)}
      onPointerDown={e => {
        const p = toWorld(e)
        const i = p ? strandIndexAt(p) : null
        if (i === null) return // off-strand: let the pan handler take it
        e.stopPropagation()
        onPaintStrand(strandPayload(strandHits[i]))
      }}
    />
  )

  const strandHighlight = useMemo(() => {
    if (hoveredStrand === null || hoveredStrand >= strandHits.length) return null
    const h = strandHits[hoveredStrand]
    const inGroup: (s: StrandHit) => boolean =
      strandScope === 'all' ? () => true
        : strandScope === 'congruent' ? s => s.signature === h.signature
          : strandScope === 'cell' ? s => s.cellKey === h.cellKey
            : s => s.patchKey === h.patchKey
    // Single <path> no matter how large the group ('all' is the whole field).
    let d = ''
    for (const s of strandHits) {
      if (inGroup(s)) d += `M${s.from.x},${s.from.y}L${s.to.x},${s.to.y}`
    }
    if (!d) return null
    return (
      <path
        d={d}
        fill="none"
        stroke={activeColor}
        strokeOpacity={0.9}
        strokeWidth={3}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        pointerEvents="none"
      />
    )
  }, [hoveredStrand, strandHits, strandScope, activeColor])

  if (target === 'voids') {
    return <g id="decoration-paint-layer">{voidHighlight}{voidHits}</g>
  }

  if (target === 'stamp') {
    // Persistent outline on the selected shape's whole congruent group, so
    // the user sees exactly which Voids an upload will stamp.
    const selected = selectedStampSignature
      ? voids.filter(v => v.signature === selectedStampSignature).map((v, i) => (
        <path
          key={`sel-${i}`}
          d={polygonPath(v.polygon)}
          fill="var(--accent, #d4af37)"
          fillOpacity={0.12}
          stroke="var(--accent, #d4af37)"
          strokeOpacity={0.9}
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
      ))
      : null
    return <g id="decoration-paint-layer">{selected}{voidHighlight}{voidHits}</g>
  }

  if (target === 'strands') {
    return <g id="decoration-paint-layer">{strandHighlight}{strandCatcher}</g>
  }

  return null
}

/** A small paint-bucket cursor so the user sees they're in Paint mode. */
const BUCKET_CURSOR =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><path d='M11 3l8 8-7 7-8-8z' fill='%23d4af37' stroke='%23222' stroke-width='1.2' stroke-linejoin='round'/><path d='M19.5 13c.9 1.6 1.7 2.6 1.7 3.6a1.7 1.7 0 11-3.4 0c0-1 .8-2 1.7-3.6z' fill='%23d4af37' stroke='%23222' stroke-width='1'/></svg>\") 3 20, pointer"
