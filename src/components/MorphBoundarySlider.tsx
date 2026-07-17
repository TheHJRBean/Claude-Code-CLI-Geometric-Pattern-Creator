import { useEffect, useRef } from 'react'
import type { MorphBoundary, MorphConfig } from '../types/pattern'
import { NumberStepper } from './lab/labShared'

/** Matches `MorphPanel`'s own range — kept local since the two components
 *  don't otherwise share state. */
const POSITION_RANGE = 6000

/**
 * The spec's "transient position slider docked at the bottom of the
 * screen" — present only while a Morph Boundary is selected on canvas
 * (`EditorMorphLayer`'s selection, threaded through `Canvas.tsx`). Modelled
 * loosely on `GuidePopupOverlay` (Escape / outside-click closes) but docked
 * bottom-centre rather than anchored to a canvas point, since a Boundary is
 * a line/ring spanning the whole viewport rather than a single point.
 */
interface Props {
  boundary: MorphBoundary
  mode: MorphConfig['mode']
  onChange: (position: number) => void
  onDelete: () => void
  onClose: () => void
}

export function MorphBoundarySlider({ boundary, mode, onChange, onDelete, onClose }: Props) {
  const barRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current()
    }
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null
      if (target && barRef.current && barRef.current.contains(target)) return
      closeRef.current()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointerDown)
    }
  }, [])

  const min = mode === 'radial' ? 0 : -POSITION_RANGE
  const label = mode === 'radial' ? 'Ring radius' : 'Boundary position'

  return (
    <div
      ref={barRef}
      role="dialog"
      aria-label={label}
      onPointerDown={e => e.stopPropagation()}
      style={{
        position: 'absolute',
        left: '50%',
        bottom: 20,
        transform: 'translateX(-50%)',
        minWidth: 340,
        maxWidth: 'min(560px, calc(100vw - 32px))',
        width: '100%',
        padding: '10px 14px',
        background: 'var(--bg-elevated, #161620)',
        border: '1px solid var(--border-accent, var(--accent))',
        boxShadow: '0 8px 28px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(0,0,0,0.2)',
        zIndex: 30,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <span style={{
        fontFamily: "'Cinzel', Georgia, serif",
        fontSize: 9,
        fontWeight: 600,
        letterSpacing: '0.10em',
        textTransform: 'uppercase',
        color: 'var(--text-muted)',
        whiteSpace: 'nowrap',
      }}>
        {label}
      </span>
      <input
        type="range"
        min={min}
        max={POSITION_RANGE}
        step={1}
        value={boundary.position}
        onChange={e => onChange(Number(e.target.value))}
        style={{ flex: 1 }}
      />
      <NumberStepper
        value={Math.round(boundary.position)}
        onChange={onChange}
        min={min}
        max={POSITION_RANGE}
        step={1}
        ariaLabel={label}
      />
      <button
        onClick={onDelete}
        title="Delete Boundary"
        style={{
          flexShrink: 0,
          padding: '4px 8px',
          fontFamily: "'Cinzel', Georgia, serif",
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          cursor: 'pointer',
          border: '1px solid var(--border-subtle)',
          background: 'transparent',
          color: '#c25b5b',
        }}
      >
        Delete
      </button>
      <button
        onClick={onClose}
        aria-label="Close"
        title="Close"
        style={{
          flexShrink: 0,
          width: 22,
          height: 22,
          lineHeight: 1,
          padding: 0,
          fontSize: 13,
          cursor: 'pointer',
          color: 'var(--text-muted)',
          background: 'transparent',
          border: '1px solid var(--border-subtle)',
        }}
      >
        ×
      </button>
    </div>
  )
}
