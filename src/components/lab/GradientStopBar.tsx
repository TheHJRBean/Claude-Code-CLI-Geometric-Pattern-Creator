import { useRef } from 'react'
import type { GradientStop } from '../../types/editor'
import { GRADIENT_MAX_STOPS } from '../../types/editor'
import { gradientPreviewCss } from '../../decoration/gradients'

/**
 * Gradient **stop bar** (#44) — a horizontal preview of the stop set with a
 * draggable marker per stop. Click a marker to select it (the caller binds
 * its colour to the shared `ColourPicker`); drag to move its offset; +/−
 * add/remove stops (min 2, cap `GRADIENT_MAX_STOPS`). Shared by the
 * Decoration panel (working draft) and the gradient focus editor.
 */
export function GradientStopBar({ stops, selected, onSelect, onChange }: {
  stops: GradientStop[]
  /** Index of the selected stop (colour edited by the caller's picker). */
  selected: number
  onSelect: (i: number) => void
  onChange: (stops: GradientStop[]) => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ id: number; index: number } | null>(null)

  const offsetAt = (clientX: number): number => {
    const r = trackRef.current?.getBoundingClientRect()
    if (!r || r.width === 0) return 0
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width))
  }

  const addStop = () => {
    if (stops.length >= GRADIENT_MAX_STOPS) return
    // Insert at the midpoint of the widest gap, inheriting the left colour.
    const sorted = [...stops].sort((a, b) => a.offset - b.offset)
    let bestGap = -1
    let at = 0.5
    let colour = sorted[0].colour
    for (let i = 0; i < sorted.length - 1; i++) {
      const gap = sorted[i + 1].offset - sorted[i].offset
      if (gap > bestGap) {
        bestGap = gap
        at = (sorted[i].offset + sorted[i + 1].offset) / 2
        colour = sorted[i].colour
      }
    }
    onChange([...stops, { offset: at, colour }])
    onSelect(stops.length)
  }

  const removeSelected = () => {
    if (stops.length <= 2 || selected < 0 || selected >= stops.length) return
    onChange(stops.filter((_, i) => i !== selected))
    onSelect(0)
  }

  return (
    <div style={{ marginBottom: 8 }}>
      <div
        ref={trackRef}
        style={{
          position: 'relative',
          height: 18,
          border: '1px solid var(--border-subtle)',
          background: gradientPreviewCss(stops),
          cursor: 'copy',
          touchAction: 'none',
        }}
        onPointerDown={e => {
          // Click on empty track = add a stop there (respecting the cap).
          if (stops.length >= GRADIENT_MAX_STOPS) return
          const offset = offsetAt(e.clientX)
          const sorted = [...stops].sort((a, b) => a.offset - b.offset)
          const left = [...sorted].reverse().find(s => s.offset <= offset) ?? sorted[0]
          onChange([...stops, { offset, colour: left.colour }])
          onSelect(stops.length)
        }}
      >
        {stops.map((s, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `calc(${s.offset * 100}% - 6px)`,
              top: -4,
              width: 12,
              height: 24,
              background: s.colour,
              border: i === selected ? '2px solid var(--accent, #d4af37)' : '1px solid var(--text-muted)',
              borderRadius: 2,
              cursor: 'ew-resize',
              boxSizing: 'border-box',
              touchAction: 'none',
            }}
            onPointerDown={e => {
              e.stopPropagation()
              onSelect(i)
              drag.current = { id: e.pointerId, index: i }
              ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
            }}
            onPointerMove={e => {
              const d = drag.current
              if (!d || e.pointerId !== d.id) return
              const offset = offsetAt(e.clientX)
              onChange(stops.map((st, j) => (j === d.index ? { ...st, offset } : st)))
            }}
            onPointerUp={e => {
              if (drag.current?.id === e.pointerId) drag.current = null
            }}
            onPointerCancel={e => {
              if (drag.current?.id === e.pointerId) drag.current = null
            }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center', fontSize: 11 }}>
        <button
          onClick={addStop}
          disabled={stops.length >= GRADIENT_MAX_STOPS}
          style={{ ...stopButtonStyle, opacity: stops.length >= GRADIENT_MAX_STOPS ? 0.4 : 1 }}
          title="Add a colour stop"
        >
          + Stop
        </button>
        <button
          onClick={removeSelected}
          disabled={stops.length <= 2}
          style={{ ...stopButtonStyle, opacity: stops.length <= 2 ? 0.4 : 1 }}
          title="Remove the selected stop (minimum 2)"
        >
          − Stop
        </button>
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
          {selected >= 0 && selected < stops.length ? `${(stops[selected].offset * 100).toFixed(0)}%` : ''}
        </span>
      </div>
    </div>
  )
}

const stopButtonStyle: React.CSSProperties = {
  padding: '3px 8px',
  fontFamily: "'Cinzel', Georgia, serif",
  fontSize: 9,
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  border: '1px solid var(--border-subtle)',
  background: 'transparent',
  color: 'var(--text-muted)',
}
