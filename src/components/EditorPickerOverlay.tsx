import { useEffect, useState } from 'react'
import { regularPolygonVertices } from '../editor/regularPolygon'
import { PICKER_SIDES } from '../editor/placement'

/**
 * Step 17.3 — viable-polygon picker (Q10).
 *
 * Floating popover anchored at the screen-space position the parent computes
 * from the selected edge's world midpoint. Renders one icon button per
 * candidate n in `PICKER_SIDES`, disabled when not in `viableSides`. Empty
 * state when nothing fits. Closes on Escape.
 *
 * Sizing matches the rest of Lab — Cinzel uppercase header, accent-bordered
 * chips, large-enough icons + numerals to read at small viewport sizes.
 */
interface Props {
  /** Screen-space position of the selected edge midpoint. */
  position: { x: number; y: number }
  /** All candidate n's that pass `isPlacementViable` for the edge. */
  viableSides: number[]
  onPick: (sides: number) => void
  onClose: () => void
  /** Optional — when present, the popover offers "Delete tile" for the owning tile. */
  onDeleteOwningTile?: () => void
}

const NGON_LABEL: Record<number, string> = {
  3: 'Triangle', 4: 'Square', 5: 'Pentagon', 6: 'Hexagon',
  7: 'Heptagon', 8: 'Octagon', 9: 'Nonagon', 10: 'Decagon', 12: 'Dodecagon',
}

export function EditorPickerOverlay({
  position, viableSides, onPick, onClose, onDeleteOwningTile,
}: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const [hoveredN, setHoveredN] = useState<number | null>(null)
  const viableSet = new Set(viableSides)
  const empty = viableSides.length === 0

  return (
    <div
      role="dialog"
      aria-label="Pick polygon to place"
      onPointerDown={e => e.stopPropagation()}
      style={{
        position: 'absolute',
        left: position.x,
        top: position.y,
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
      {/* ── Header ─────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{
          fontFamily: "'Cinzel', Georgia, serif",
          fontSize: 10,
          fontWeight: 600,
          color: 'var(--accent)',
          letterSpacing: '0.20em',
          textTransform: 'uppercase',
        }}>
          Add Polygon
        </span>
        <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, var(--divider, rgba(255,255,255,0.18)), transparent)' }} />
      </div>

      {/* ── Hover hint ─────────────────────────────────── */}
      <div style={{
        height: 18,
        marginBottom: 8,
        fontFamily: "'EB Garamond', Georgia, serif",
        fontStyle: 'italic',
        fontSize: 13,
        color: 'var(--text-muted)',
        lineHeight: '18px',
        letterSpacing: '0.02em',
      }}>
        {empty
          ? 'No polygon fits here.'
          : hoveredN
            ? `${NGON_LABEL[hoveredN] ?? `${hoveredN}-gon`} (${hoveredN} sides)`
            : 'Choose a regular polygon to place.'}
      </div>

      {/* ── Grid ───────────────────────────────────────── */}
      {!empty && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: 6,
        }}>
          {PICKER_SIDES.map(n => {
            const enabled = viableSet.has(n)
            const hovered = hoveredN === n && enabled
            return (
              <button
                key={n}
                disabled={!enabled}
                onClick={() => enabled && onPick(n)}
                onMouseEnter={() => setHoveredN(n)}
                onMouseLeave={() => setHoveredN(prev => (prev === n ? null : prev))}
                title={NGON_LABEL[n] ?? `${n}-gon`}
                aria-label={NGON_LABEL[n] ?? `${n}-gon`}
                style={{
                  aspectRatio: '1 / 1',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                  padding: 4,
                  border: `1px solid ${enabled ? 'var(--accent)' : 'var(--border-subtle)'}`,
                  background: enabled
                    ? hovered
                      ? 'var(--accent-bg, rgba(230,201,122,0.14))'
                      : 'rgba(255,255,255,0.02)'
                    : 'transparent',
                  color: enabled ? 'var(--accent, #e6c97a)' : 'var(--text-muted)',
                  cursor: enabled ? 'pointer' : 'not-allowed',
                  opacity: enabled ? 1 : 0.32,
                  transition: 'background 0.12s, transform 0.12s',
                  transform: hovered ? 'translateY(-1px)' : undefined,
                }}
              >
                <NgonIcon sides={n} size={28} />
                <span style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: '0.06em',
                  lineHeight: 1,
                }}>
                  {n}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* ── Delete (only on placed-tile edges) ─────────── */}
      {onDeleteOwningTile && (
        <>
          <div style={{
            height: 1,
            background: 'var(--divider, rgba(255,255,255,0.12))',
            margin: empty ? '0 0 12px' : '14px 0 12px',
          }} />
          <button
            onClick={onDeleteOwningTile}
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
        </>
      )}

      {/* ── Anchor caret ───────────────────────────────── */}
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
