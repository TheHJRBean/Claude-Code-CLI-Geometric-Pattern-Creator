import { useRef } from 'react'
import type { GradientStop } from '../../types/editor'
import { GRADIENT_MAX_STOPS } from '../../types/editor'
import { gradientPreviewCss } from '../../decoration/gradients'
import { isHexColour } from '../colourPicker.logic'

/**
 * Gradient **stop bar** (#44) — a horizontal preview of the stop set with a
 * draggable marker per stop. Click a marker to select it (the caller binds
 * its colour to the shared `ColourPicker`); drag to move its offset;
 * double-click a marker to remove it. `+ Stop` / `− Stop` add/remove (min 2,
 * cap `GRADIENT_MAX_STOPS`). Each stop also gets its own colour well under the
 * track with a `×` to delete that specific stop, so a stop can be removed
 * directly without selecting it first. Shared by the Decoration panel
 * (working draft) and the gradient focus editor.
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

  const removeStopAt = (index: number) => {
    if (stops.length <= 2 || index < 0 || index >= stops.length) return
    onChange(stops.filter((_, i) => i !== index))
    // Keep the same logical stop selected: removing one before it shifts the
    // selection down; removing the selected one falls back to the first stop.
    const next = selected === index ? 0 : selected > index ? selected - 1 : selected
    onSelect(Math.min(next, stops.length - 2))
  }

  const removeSelected = () => removeStopAt(selected)

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
            title="Drag to move · double-click to remove"
            onDoubleClick={e => {
              e.stopPropagation()
              removeStopAt(i)
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
      {/* Per-stop colour wells (offset order) — one picker per stop, each with
          a × to delete that specific stop directly. */}
      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
        {stops
          .map((s, i) => ({ s, i }))
          .sort((a, b) => a.s.offset - b.s.offset)
          .map(({ s, i }) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <input
                type="color"
                value={isHexColour(s.colour) ? s.colour : '#000000'}
                title={`Stop at ${(s.offset * 100).toFixed(0)}%`}
                onPointerDown={() => onSelect(i)}
                onChange={e => {
                  onSelect(i)
                  onChange(stops.map((st, j) => (j === i ? { ...st, colour: e.target.value } : st)))
                }}
                style={{
                  width: 30,
                  height: 22,
                  padding: 0,
                  border: i === selected ? '2px solid var(--accent, #d4af37)' : '1px solid var(--border-subtle)',
                  background: 'transparent',
                  cursor: 'pointer',
                  boxSizing: 'border-box',
                }}
              />
              <button
                onClick={() => removeStopAt(i)}
                disabled={stops.length <= 2}
                title={stops.length <= 2 ? 'A gradient needs at least 2 stops' : 'Remove this stop'}
                style={{ ...wellRemoveStyle, opacity: stops.length <= 2 ? 0.3 : 1, cursor: stops.length <= 2 ? 'default' : 'pointer' }}
              >
                ×
              </button>
            </div>
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

const wellRemoveStyle: React.CSSProperties = {
  width: 30,
  padding: '0 0 1px',
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
  lineHeight: 1,
  border: '1px solid var(--border-subtle)',
  background: 'transparent',
  color: 'var(--text-muted)',
}
