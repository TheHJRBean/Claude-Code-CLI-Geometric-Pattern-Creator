import { useEffect } from 'react'
import { regularPolygonVertices } from '../editor/regularPolygon'
import { PICKER_SIDES } from '../editor/placement'

/**
 * Step 17.3 — viable-polygon picker (Q10).
 *
 * Floating popover anchored at the screen-space position the parent computes
 * from the selected edge's world midpoint. Renders one icon button per
 * candidate n in `PICKER_SIDES`, disabled when not in `viableSides`. Empty
 * state when nothing fits.
 *
 * Closes on Escape.
 */
interface Props {
  /** Screen-space position of the selected edge midpoint. */
  position: { x: number; y: number }
  /** All candidate n's that pass `isPlacementViable` for the edge. */
  viableSides: number[]
  onPick: (sides: number) => void
  onClose: () => void
}

export function EditorPickerOverlay({ position, viableSides, onPick, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

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
        transform: 'translate(-50%, calc(-100% - 14px))',
        background: 'var(--bg, #1a1a1a)',
        border: '1px solid var(--border-subtle)',
        boxShadow: '0 4px 14px rgba(0, 0, 0, 0.45)',
        padding: empty ? '10px 14px' : 6,
        zIndex: 20,
        backdropFilter: 'blur(6px)',
      }}
    >
      {empty ? (
        <span style={{
          fontFamily: "'EB Garamond', Georgia, serif",
          fontStyle: 'italic',
          fontSize: 12.5,
          color: 'var(--text-muted)',
        }}>
          No polygon fits here.
        </span>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 36px)', gap: 4 }}>
          {PICKER_SIDES.map(n => {
            const enabled = viableSet.has(n)
            return (
              <button
                key={n}
                disabled={!enabled}
                onClick={() => enabled && onPick(n)}
                title={`${n}-gon`}
                style={{
                  width: 36, height: 36,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  padding: 0,
                  border: `1px solid ${enabled ? 'var(--accent)' : 'var(--border-subtle)'}`,
                  background: enabled ? 'var(--accent-bg, rgba(255,255,255,0.06))' : 'transparent',
                  color: enabled ? 'var(--accent, #e6c97a)' : 'var(--text-muted)',
                  cursor: enabled ? 'pointer' : 'not-allowed',
                  opacity: enabled ? 1 : 0.35,
                }}
              >
                <NgonIcon sides={n} size={18} />
                <span style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 9,
                  marginTop: 1,
                  letterSpacing: '0.04em',
                }}>{n}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function NgonIcon({ sides, size }: { sides: number; size: number }) {
  const verts = regularPolygonVertices(sides, { x: 0, y: 0 }, 1, -Math.PI / 2)
  const max = Math.max(...verts.map(v => Math.max(Math.abs(v.x), Math.abs(v.y))))
  const r = (size / 2) * 0.85
  const points = verts.map(v => `${(v.x / max) * r},${(v.y / max) * r}`).join(' ')
  return (
    <svg width={size} height={size} viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`}>
      <polygon points={points} fill="none" stroke="currentColor" strokeWidth={1.2} />
    </svg>
  )
}
