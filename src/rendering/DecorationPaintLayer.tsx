import { useMemo, useState } from 'react'
import type { Vec2 } from '../utils/math'
import type { GroupingScope } from '../types/editor'
import type { ClickedTargetKeys } from '../decoration/scopes'
import type { PaintVoid, StrandHit } from '../decoration/resolve'
import type { KeyedJunction } from '../decoration/junctionOrnaments'
import { buildVoidTargeting } from '../decoration/paintTargets'
import { nearestSegmentIndex, polygonPath, polygonWithHolesPath } from './svgGeometry'

export type PaintTarget = 'off' | 'voids' | 'strands' | 'stamp' | 'gradient' | 'combine' | 'junctions'

/** Which rung a junction click binds at. `all` = the congruent `'*'` record;
 * `patch` = the crossing's spot in every Patch repeat; `instance` = the one
 * crossing clicked. There is no `cell` rung — see `junctionOrnaments.ts`. */
export type JunctionPaintScope = 'all' | 'congruent' | 'patch' | 'instance'

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
  strandWidth = 0,
  onPaintVoid,
  onPaintStrand,
  // Stamp target: a Void click selects its congruent shape for the panel's
  // inspector / export / upload flow (no painting); the selected signature's
  // group renders a persistent outline highlight.
  onSelectStampVoid,
  selectedStampSignature,
  onPaintGradientVoid,
  combineSelection,
  onToggleCombineVoid,
  junctions,
  junctionScope,
  onPaintJunction,
}: {
  target: PaintTarget
  voids: PaintVoid[]
  strandHits: StrandHit[]
  voidScope: VoidPaintScope
  strandScope: StrandPaintScope
  activeColor: string
  zoom: number
  /** Rendered Strand stroke width (world units) — widens the strand pick
   * radius so clicking anywhere on the visible stroke body hits, not just
   * within a few screen px of the centreline. Matters at the Frame border:
   * a stroke straddling the frame outline renders only its inner half (the
   * clip cuts the rest), so the visible sliver can sit up to width/2 from
   * the centreline — with a fixed screen-px radius those border strokes
   * were unclickable when zoomed in or with thick strands. */
  strandWidth?: number
  onPaintVoid: (payload: PaintPayload) => void
  onPaintStrand: (payload: PaintPayload) => void
  onSelectStampVoid?: (v: PaintVoid) => void
  selectedStampSignature?: string | null
  /** Gradient target (#44): a Void click paints the working gradient draft.
   * Carries the whole clicked Void so the handler can seed the gradient
   * geometry off its canonical pose. */
  onPaintGradientVoid?: (v: PaintVoid, payload: PaintPayload) => void
  /** Combine target — `instanceKey`s of the Voids currently picked to fuse.
   * World-position keys, so the selection survives a pan. */
  combineSelection?: readonly string[]
  /** Combine target — a Void click adds it to (or removes it from) the pick
   * set. The Combine / Separate buttons live in the panel: the click itself
   * never commits, because a combine only means anything once two Voids are
   * picked. */
  onToggleCombineVoid?: (v: PaintVoid) => void
  /** Junctions target — every crossing of the field, with its identity keys. */
  junctions?: KeyedJunction[]
  junctionScope?: JunctionPaintScope
  /** A junction click applies (or, on an identical re-click, removes) the
   *  panel's working ornament over the scope's whole group. */
  onPaintJunction?: (payload: PaintPayload) => void
}) {
  const [hoveredVoid, setHoveredVoid] = useState<number | null>(null)
  const [hoveredStrand, setHoveredStrand] = useState<number | null>(null)
  const [hoveredJunction, setHoveredJunction] = useState<number | null>(null)

  // Stamp mode always groups by congruent signature (v1 stamp scope).
  const stampMode = target === 'stamp'
  const combineMode = target === 'combine'
  const voidKey = (v: PaintVoid): string =>
    stampMode || voidScope === 'congruent' ? v.signature
      : voidScope === 'cell' ? v.cellKey
        : voidScope === 'patch' ? v.patchKey
          : v.instanceKey

  // Voids the extraction bound CUT can't carry a durable record — see
  // `buildVoidTargeting`. They get no hit target, so the click falls through
  // to the pan handler instead of writing a paint that silently disappears on
  // the next pan.
  const targeting = useMemo(() => buildVoidTargeting(voids), [voids])
  // Combine is never "keyed by signature alone" even at the Matching rung: the
  // record stores each member's centroid relative to the anchor, and a
  // bound-cut face's centroid is a function of where the bound fell. A group
  // recorded through one would aim its offsets at nothing after a pan.
  const keyedBySignatureAlone = !combineMode && (stampMode || voidScope === 'congruent')

  const voidHits = useMemo(() => voids.map((v, i) => (
    targeting.canMint(v, keyedBySignatureAlone) ? (
      <path
        key={i}
        d={polygonWithHolesPath(v.polygon, v.holes)}
        fill="transparent"
        stroke="none"
        style={{ cursor: combineMode ? 'copy' : BUCKET_CURSOR }}
        onPointerEnter={() => setHoveredVoid(i)}
        onPointerLeave={() => setHoveredVoid(h => (h === i ? null : h))}
        onPointerDown={e => {
          e.stopPropagation()
          if (combineMode) {
            onToggleCombineVoid?.(v)
            return
          }
          // Both the stamp inspector and the gradient seeder read the clicked
          // Void's OUTLINE (canvas export, canonical pose). Hand them an
          // un-cut member of the class — posing a whole class off a truncated
          // face would misplace the image / wash on every instance.
          const shape = targeting.representative.get(v.signature) ?? v
          if (stampMode) {
            onSelectStampVoid?.(shape)
            return
          }
          const payload: PaintPayload = {
            scope: voidScope,
            key: voidKey(v),
            clicked: { signature: v.signature, cellKey: v.cellKey, patchKey: v.patchKey, instanceKey: v.instanceKey },
          }
          if (target === 'gradient') onPaintGradientVoid?.(shape, payload)
          else onPaintVoid(payload)
        }}
      />
    ) : null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  )), [voids, onPaintVoid, voidScope, stampMode, combineMode, onToggleCombineVoid, target, onSelectStampVoid, onPaintGradientVoid, targeting, keyedBySignatureAlone])

  const voidHighlight = useMemo(() => {
    if (hoveredVoid === null || hoveredVoid >= voids.length) return null
    // Combine picks one Void at a time — its Reach is applied at commit, not
    // at hover, so previewing a whole group here would promise the wrong thing.
    const hovered = voids[hoveredVoid]
    const k = voidKey(hovered)
    return (combineMode ? [hovered] : voids.filter(v => voidKey(v) === k)).map((v, i) => (
      <path
        key={`hl-${i}`}
        d={polygonWithHolesPath(v.polygon, v.holes)}
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
  }, [hoveredVoid, voids, voidScope, combineMode, activeColor])

  const combineHighlight = useMemo(() => {
    if (!combineMode || !combineSelection || combineSelection.length === 0) return null
    const picked = new Set(combineSelection)
    return voids.filter(v => picked.has(v.instanceKey)).map((v, i) => (
      <path
        key={`cb-${i}`}
        d={polygonWithHolesPath(v.polygon, v.holes)}
        fill="var(--accent, #d4af37)"
        fillOpacity={0.28}
        stroke="var(--accent, #d4af37)"
        strokeOpacity={0.95}
        strokeWidth={2}
        strokeDasharray="4 3"
        vectorEffect="non-scaling-stroke"
        pointerEvents="none"
      />
    ))
  }, [combineMode, combineSelection, voids])

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
      if (s.poly) {
        for (const q of s.poly) {
          minX = Math.min(minX, q.x); maxX = Math.max(maxX, q.x)
          minY = Math.min(minY, q.y); maxY = Math.max(maxY, q.y)
        }
      }
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
    // ~constant screen-space pick radius, widened to the stroke body (half
    // the strand width + slack) so clicks anywhere on a rendered stroke hit
    // — border strokes half-cut by the Frame clip included. A miss falls
    // through to the pan handler.
    nearestSegmentIndex(p, strandHits, Math.max(6 / zoom, strandWidth / 2 + 2 / zoom))

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
      if (!inGroup(s)) continue
      // Follow the flattened rendered curve where there is one, so the
      // highlight overlays the bowed stroke instead of its straight chord.
      d += s.poly
        ? `M${s.poly.map(q => `${q.x},${q.y}`).join('L')}`
        : `M${s.from.x},${s.from.y}L${s.to.x},${s.to.y}`
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

  // ── Junctions ──────────────────────────────────────────────────────────
  // Same shape as the Strands target and for the same reason: a decoration-
  // scale field has thousands of crossings, and one DOM node each is what
  // froze the tab when the Strands target did it per segment. One catch-all
  // rect, math hit-testing, and a single highlight path.
  const junctionList = junctions ?? []
  const junctionKey = (j: KeyedJunction): string =>
    junctionScope === 'all' ? '*'
      : junctionScope === 'congruent' ? j.signature
        : junctionScope === 'patch' ? j.patchKey
          : j.instanceKey

  const junctionIndexAt = (p: Vec2): number | null => {
    // Constant ~10px screen pick radius: an ornament is a point, so there is
    // no body to aim at and the target has to be generous.
    const r = 10 / zoom
    let best: number | null = null
    let bestD = r * r
    for (let i = 0; i < junctionList.length; i++) {
      const q = junctionList[i].point
      const d = (q.x - p.x) * (q.x - p.x) + (q.y - p.y) * (q.y - p.y)
      if (d <= bestD) { bestD = d; best = i }
    }
    return best
  }

  const junctionBBox = (() => {
    if (junctionList.length === 0) return null
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const j of junctionList) {
      minX = Math.min(minX, j.point.x); maxX = Math.max(maxX, j.point.x)
      minY = Math.min(minY, j.point.y); maxY = Math.max(maxY, j.point.y)
    }
    return { minX, minY, maxX, maxY }
  })()

  if (target === 'junctions') {
    const hovered = hoveredJunction !== null && hoveredJunction < junctionList.length
      ? junctionList[hoveredJunction]
      : null
    const groupKey = hovered ? junctionKey(hovered) : null
    return (
      <g id="decoration-paint-layer">
        {/* Every crossing gets a faint marker, so the user can see WHERE the
            ornaments can go before placing one — a Void or Strand is visible
            on its own, a junction is not. */}
        {junctionList.map((j, i) => (
          <circle
            key={`j${i}`}
            cx={j.point.x}
            cy={j.point.y}
            r={(groupKey !== null && junctionKey(j) === groupKey ? 5 : 2.5) / zoom}
            fill={groupKey !== null && junctionKey(j) === groupKey ? activeColor : 'var(--accent, #d4af37)'}
            fillOpacity={groupKey !== null && junctionKey(j) === groupKey ? 0.9 : 0.35}
            pointerEvents="none"
          />
        ))}
        {junctionBBox && (
          <rect
            x={junctionBBox.minX - 10 / zoom}
            y={junctionBBox.minY - 10 / zoom}
            width={junctionBBox.maxX - junctionBBox.minX + 20 / zoom}
            height={junctionBBox.maxY - junctionBBox.minY + 20 / zoom}
            fill="transparent"
            style={hoveredJunction !== null ? { cursor: BUCKET_CURSOR } : undefined}
            onPointerMove={e => {
              const p = toWorld(e)
              setHoveredJunction(p ? junctionIndexAt(p) : null)
            }}
            onPointerLeave={() => setHoveredJunction(null)}
            onPointerDown={e => {
              const p = toWorld(e)
              const i = p ? junctionIndexAt(p) : null
              if (i === null) return // off-junction: let the pan handler take it
              e.stopPropagation()
              const j = junctionList[i]
              onPaintJunction?.({
                scope: junctionScope === 'all' ? 'congruent' : junctionScope ?? 'congruent',
                key: junctionKey(j),
                clicked: { signature: j.signature, patchKey: j.patchKey, instanceKey: j.instanceKey },
              })
            }}
          />
        )}
      </g>
    )
  }

  if (target === 'voids' || target === 'gradient') {
    return <g id="decoration-paint-layer">{voidHighlight}{voidHits}</g>
  }

  if (target === 'combine') {
    return <g id="decoration-paint-layer">{combineHighlight}{voidHighlight}{voidHits}</g>
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
