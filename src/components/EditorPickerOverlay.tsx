import { useEffect, useRef, useState } from 'react'
import { regularPolygonVertices } from '../editor/regularPolygon'
import { PICKER_SIDES } from '../editor/placement'
import type { VertexOrientation } from '../editor/vertexPlacement'

/**
 * Step 17.3 / 17.12c / 17.13c — viable-polygon picker.
 *
 * Edge / boundary-section mode (single-page): shape grid only — click a shape
 * to commit immediately. Used by edge placement and boundary-section
 * placement.
 *
 * Vertex mode (two-page): page 1 shape grid → page 2 rotation arrows + live
 * orientation label + commit. Page 2 cycles through viable orientations the
 * caller pre-computed via `vertexPlacementOrientations`. ← Back returns to
 * the shape grid; the canvas overlays the candidate Tile as a live preview
 * outside the picker.
 *
 * Floating popover anchored at the screen-space position the parent computes
 * from the selected target's world midpoint / vertex position. Closes on
 * Escape or outside-click.
 *
 * Sizing matches the rest of Lab — Cinzel uppercase header, accent-bordered
 * chips, large-enough icons + numerals to read at small viewport sizes.
 */

const NGON_LABEL: Record<number, string> = {
  3: 'Triangle', 4: 'Square', 5: 'Pentagon', 6: 'Hexagon',
  7: 'Heptagon', 8: 'Octagon', 9: 'Nonagon', 10: 'Decagon', 12: 'Dodecagon',
}

const ORIENTATION_LABEL: Record<VertexOrientation['kind'], string> = {
  'flush-cw': 'Flush ⟲',
  centred: 'Centred',
  'flush-ccw': 'Flush ⟳',
}

/** Amber used for the overlap "place anyway" warning state across the picker —
 *  distinct from the gold accent so a forceable size reads as a caution, not a
 *  clean choice. */
const WARN_COLOR = '#d99a4a'

/* ── Edge / section variant (single-page) ──────────────────────────────── */

interface EdgePickerProps {
  mode?: 'edge'
  position: { x: number; y: number }
  viableSides: number[]
  /** Sizes that don't fit cleanly but can still be placed through a skippable
   *  overlap warning (flexible-placement, 2026-06-01). Shown with a ⚠ badge;
   *  picking one is the user accepting the overlap. */
  forceableSides?: number[]
  onPick: (sides: number) => void
  onClose: () => void
  onDeleteOwningTile?: () => void
}

/* ── Vertex variant (two-page) ─────────────────────────────────────────── */

interface VertexPickerProps {
  mode: 'vertex'
  position: { x: number; y: number }
  /** Shapes that produce at least one overlap-free orientation. */
  viableSides: number[]
  /** Shapes that only produce overlapping orientations — placeable through a
   *  skippable warning (flexible-placement, 2026-06-01). */
  forceableSides?: number[]
  /** Picked shape (page 2 active). `null` = page 1 active. */
  pickedSides: number | null
  /** Orientations for the picked shape (empty when pickedSides is null). */
  orientations: VertexOrientation[]
  /** Current orientation index — controlled by the parent so the canvas
   *  preview and the picker stay in sync. */
  orientationIndex: number
  onPickShape: (sides: number) => void
  onBackToShapes: () => void
  onCycleOrientation: (direction: -1 | 1) => void
  onCommit: () => void
  onClose: () => void
}

type Props = EdgePickerProps | VertexPickerProps

export function EditorPickerOverlay(props: Props) {
  const dialogRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose()
      if (props.mode === 'vertex' && props.pickedSides !== null) {
        if (e.key === 'ArrowLeft') { e.preventDefault(); props.onCycleOrientation(-1) }
        if (e.key === 'ArrowRight') { e.preventDefault(); props.onCycleOrientation(1) }
        if (e.key === 'Enter') { e.preventDefault(); props.onCommit() }
      }
    }
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null
      if (target && dialogRef.current && dialogRef.current.contains(target)) return
      props.onClose()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointerDown)
    }
  }, [props])

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-label={props.mode === 'vertex' ? 'Vertex placement' : 'Pick polygon to place'}
      onPointerDown={e => e.stopPropagation()}
      style={{
        position: 'absolute',
        left: props.position.x,
        top: props.position.y,
        transform: 'translate(-50%, calc(-100% - 18px))',
        minWidth: 296,
        maxWidth: 'calc(100vw - 32px)',
        background: 'var(--surface, var(--bg, #1a1a1a))',
        border: '1px solid var(--border-accent, var(--accent))',
        boxShadow: '0 8px 28px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(0,0,0,0.2)',
        padding: 14,
        zIndex: 20,
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
    >
      {props.mode === 'vertex'
        ? <VertexPickerBody {...props} />
        : <EdgePickerBody {...props} />}

      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: '50%',
          bottom: -7,
          transform: 'translateX(-50%) rotate(45deg)',
          width: 12,
          height: 12,
          background: 'var(--surface, var(--bg, #1a1a1a))',
          borderRight: '1px solid var(--border-accent, var(--accent))',
          borderBottom: '1px solid var(--border-accent, var(--accent))',
        }}
      />
    </div>
  )
}

/* ── Bodies ────────────────────────────────────────────────────────────── */

function EdgePickerBody({ viableSides, forceableSides, onPick, onDeleteOwningTile }: EdgePickerProps) {
  const [hoveredN, setHoveredN] = useState<number | null>(null)
  const viableSet = new Set(viableSides)
  const forceableSet = new Set(forceableSides ?? [])
  const empty = viableSet.size === 0 && forceableSet.size === 0
  return (
    <>
      <HeaderRow title="Add Polygon" />
      <HoverHint text={pickerHint(hoveredN, viableSet, forceableSet, empty, 'here')} />
      {!empty && (
        <ShapeGrid
          viableSet={viableSet}
          forceableSet={forceableSet}
          hoveredN={hoveredN}
          onHover={setHoveredN}
          onPick={onPick}
        />
      )}
      {onDeleteOwningTile && (
        <>
          <Divider extraTop={empty ? 0 : 14} />
          <DeleteButton onDelete={onDeleteOwningTile} />
        </>
      )}
    </>
  )
}

/** Shared hover-hint text for the shape grid across edge / section / vertex
 *  pages. Highlights the overlap-warning state when a forceable size is
 *  hovered. `where` reads "here" (edge/section) or "at this vertex". */
function pickerHint(
  hoveredN: number | null,
  viableSet: Set<number>,
  forceableSet: Set<number>,
  empty: boolean,
  where: string,
): string {
  if (empty) return `No polygon fits ${where}.`
  if (hoveredN === null) return `Choose a regular polygon to place.`
  const label = `${NGON_LABEL[hoveredN] ?? `${hoveredN}-gon`} (${hoveredN} sides)`
  if (!viableSet.has(hoveredN) && forceableSet.has(hoveredN)) {
    return `⚠ ${label} overlaps — click to place anyway.`
  }
  return label
}

function VertexPickerBody(props: VertexPickerProps) {
  const {
    viableSides, forceableSides, pickedSides, orientations, orientationIndex,
    onPickShape, onBackToShapes, onCycleOrientation, onCommit,
  } = props
  const [hoveredN, setHoveredN] = useState<number | null>(null)
  const viableSet = new Set(viableSides)
  const forceableSet = new Set(forceableSides ?? [])
  const empty = viableSet.size === 0 && forceableSet.size === 0

  if (pickedSides === null) {
    return (
      <>
        <HeaderRow title="Anchor at Vertex" />
        <HoverHint text={
          empty ? 'No polygon fits at this vertex.'
            : hoveredN === null ? 'Choose a shape, then pick its orientation.'
              : pickerHint(hoveredN, viableSet, forceableSet, empty, 'at this vertex')
        } />
        {!empty && (
          <ShapeGrid
            viableSet={viableSet}
            forceableSet={forceableSet}
            hoveredN={hoveredN}
            onHover={setHoveredN}
            onPick={onPickShape}
          />
        )}
      </>
    )
  }

  // Page 2 — orientation arrows.
  const current = orientations[orientationIndex]
  const total = orientations.length
  const orientationLabel = current ? ORIENTATION_LABEL[current.kind] : '—'
  const overlaps = !!current?.overlaps
  return (
    <>
      <HeaderRow title={`${NGON_LABEL[pickedSides] ?? `${pickedSides}-gon`}`} />
      <HoverHint text={overlaps
        ? '⚠ This orientation overlaps — place anyway, or rotate to a clear one.'
        : 'Rotate to the orientation you want, then place.'} />
      <div style={{
        display: 'grid',
        gridTemplateColumns: '40px 1fr 40px',
        alignItems: 'center',
        gap: 8,
        marginBottom: 12,
      }}>
        <PickerIconButton
          ariaLabel="Previous orientation"
          disabled={total < 2}
          onClick={() => onCycleOrientation(-1)}
        >‹</PickerIconButton>
        <div style={{
          textAlign: 'center',
          fontFamily: "'EB Garamond', Georgia, serif",
          fontSize: 14,
          color: overlaps ? WARN_COLOR : 'var(--accent)',
          letterSpacing: '0.04em',
        }}>
          <div>{overlaps ? `⚠ ${orientationLabel}` : orientationLabel}</div>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11,
            color: 'var(--text-muted)',
            marginTop: 2,
            letterSpacing: '0.08em',
          }}>
            {total > 0 ? `${orientationIndex + 1} / ${total}` : '—'}
          </div>
        </div>
        <PickerIconButton
          ariaLabel="Next orientation"
          disabled={total < 2}
          onClick={() => onCycleOrientation(1)}
        >›</PickerIconButton>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <PickerTextButton variant="ghost" onClick={onBackToShapes}>← Shape</PickerTextButton>
        <PickerTextButton variant="solid" warn={overlaps} disabled={!current} onClick={onCommit}>
          {overlaps ? 'Place anyway' : 'Place'}
        </PickerTextButton>
      </div>
    </>
  )
}

/* ── Shared sub-components ─────────────────────────────────────────────── */

function HeaderRow({ title }: { title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
      <span style={{
        fontFamily: "'Cinzel', Georgia, serif",
        fontSize: 10,
        fontWeight: 600,
        color: 'var(--accent)',
        letterSpacing: '0.20em',
        textTransform: 'uppercase',
      }}>{title}</span>
      <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, var(--divider, rgba(255,255,255,0.18)), transparent)' }} />
    </div>
  )
}

function HoverHint({ text }: { text: string }) {
  return (
    <div style={{
      height: 18,
      marginBottom: 8,
      fontFamily: "'EB Garamond', Georgia, serif",
      fontStyle: 'italic',
      fontSize: 13,
      color: 'var(--text-muted)',
      lineHeight: '18px',
      letterSpacing: '0.02em',
    }}>{text}</div>
  )
}

function Divider({ extraTop = 14 }: { extraTop?: number }) {
  return (
    <div style={{
      height: 1,
      background: 'var(--divider, rgba(255,255,255,0.12))',
      margin: `${extraTop}px 0 12px`,
    }} />
  )
}

function ShapeGrid({
  viableSet, forceableSet, hoveredN, onHover, onPick,
}: {
  viableSet: Set<number>
  forceableSet: Set<number>
  hoveredN: number | null
  onHover: (n: number | null) => void
  onPick: (n: number) => void
}) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(5, 1fr)',
      gap: 6,
    }}>
      {PICKER_SIDES.map(n => {
        const clean = viableSet.has(n)
        // "overlap" = placeable only through the skippable warning; still
        // clickable (flexible placement), badged ⚠ in amber.
        const overlap = !clean && forceableSet.has(n)
        const enabled = clean || overlap
        const hovered = hoveredN === n && enabled
        const tint = overlap ? WARN_COLOR : 'var(--accent, #e6c97a)'
        return (
          <button
            key={n}
            disabled={!enabled}
            onClick={() => enabled && onPick(n)}
            onMouseEnter={() => onHover(n)}
            onMouseLeave={() => onHover(null)}
            title={overlap
              ? `${NGON_LABEL[n] ?? `${n}-gon`} — overlaps, place anyway`
              : NGON_LABEL[n] ?? `${n}-gon`}
            aria-label={NGON_LABEL[n] ?? `${n}-gon`}
            style={{
              position: 'relative',
              aspectRatio: '1 / 1',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              padding: 4,
              border: `1px solid ${enabled ? (overlap ? WARN_COLOR : 'var(--accent)') : 'var(--border-subtle)'}`,
              borderStyle: overlap ? 'dashed' : 'solid',
              background: enabled
                ? hovered
                  ? overlap ? 'rgba(217,154,74,0.16)' : 'var(--accent-bg, rgba(230,201,122,0.14))'
                  : 'rgba(255,255,255,0.02)'
                : 'transparent',
              color: enabled ? tint : 'var(--text-muted)',
              cursor: enabled ? 'pointer' : 'not-allowed',
              opacity: enabled ? (overlap ? 0.85 : 1) : 0.32,
              transition: 'background 0.12s, transform 0.12s',
              transform: hovered ? 'translateY(-1px)' : undefined,
            }}
          >
            {overlap && (
              <span
                aria-hidden
                style={{
                  position: 'absolute',
                  top: 2,
                  right: 3,
                  fontSize: 10,
                  lineHeight: 1,
                  color: WARN_COLOR,
                }}
              >⚠</span>
            )}
            <NgonIcon sides={n} size={28} />
            <span style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: '0.06em',
              lineHeight: 1,
            }}>{n}</span>
          </button>
        )
      })}
    </div>
  )
}

function PickerIconButton({
  children, ariaLabel, disabled, onClick,
}: {
  children: React.ReactNode
  ariaLabel: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      style={{
        height: 36,
        border: `1px solid ${disabled ? 'var(--border-subtle)' : 'var(--accent)'}`,
        background: disabled ? 'transparent' : 'rgba(255,255,255,0.02)',
        color: disabled ? 'var(--text-muted)' : 'var(--accent)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: "'Cinzel', Georgia, serif",
        fontSize: 22,
        lineHeight: 1,
        opacity: disabled ? 0.4 : 1,
      }}
    >{children}</button>
  )
}

function PickerTextButton({
  children, variant, warn, disabled, onClick,
}: {
  children: React.ReactNode
  variant: 'solid' | 'ghost'
  warn?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  const solid = variant === 'solid'
  const edge = disabled ? 'var(--border-subtle)' : warn ? WARN_COLOR : 'var(--accent)'
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      style={{
        height: 36,
        padding: '0 12px',
        border: `1px solid ${edge}`,
        background: solid && !disabled
          ? warn ? 'rgba(217,154,74,0.18)' : 'var(--accent-bg, rgba(230,201,122,0.18))'
          : 'transparent',
        color: disabled ? 'var(--text-muted)' : warn ? WARN_COLOR : 'var(--accent)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: "'Cinzel', Georgia, serif",
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        opacity: disabled ? 0.4 : 1,
      }}
    >{children}</button>
  )
}

function DeleteButton({ onDelete }: { onDelete: () => void }) {
  return (
    <button
      onClick={onDelete}
      style={{
        display: 'block',
        width: '100%',
        padding: '8px 10px',
        fontFamily: "'Cinzel', Georgia, serif",
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.16em',
        textTransform: 'uppercase',
        cursor: 'pointer',
        border: '1px solid #a85050',
        background: 'transparent',
        color: '#c97070',
        transition: 'background 0.15s, color 0.15s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = 'rgba(168, 80, 80, 0.16)'
        e.currentTarget.style.color = '#e08a8a'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'transparent'
        e.currentTarget.style.color = '#c97070'
      }}
    >
      Delete tile
    </button>
  )
}

function NgonIcon({ sides, size }: { sides: number; size: number }) {
  const verts = regularPolygonVertices(sides, { x: 0, y: 0 }, 1, -Math.PI / 2)
  const max = Math.max(...verts.map(v => Math.max(Math.abs(v.x), Math.abs(v.y))))
  const r = (size / 2) * 0.88
  const points = verts.map(v => `${(v.x / max) * r},${(v.y / max) * r}`).join(' ')
  return (
    <svg width={size} height={size} viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`} aria-hidden>
      <polygon
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
