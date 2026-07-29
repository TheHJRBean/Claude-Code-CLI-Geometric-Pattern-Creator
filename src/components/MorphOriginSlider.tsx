import { useEffect, useRef } from 'react'
import type { MorphConfig, MorphOrigin, MorphSides } from '../types/pattern'
import { MORPH_POSITION_RANGE, MORPH_REACH_RANGE, morphSideLabels } from '../editor/morph'
import { NumberStepper } from './lab/labShared'

/**
 * The spec's "transient position slider docked at the bottom of the
 * screen" — present only while a Morph Origin is selected on canvas
 * (`EditorMorphLayer`'s selection, threaded through `Canvas.tsx`). Modelled
 * loosely on `GuidePopupOverlay` (Escape / outside-click closes) but docked
 * bottom-centre rather than anchored to a canvas point, since an Origin is
 * a line/ring spanning the whole viewport rather than a single point.
 *
 * Carries the two controls that shape the ramp alongside the position (#48):
 * **Reach** (how far the blend runs before the target is reached) and
 * **Sides** (which side(s) of the line/ring it runs into) — so the whole
 * gesture stays on canvas without a trip to the sidebar.
 */
interface Props {
  origin: MorphOrigin
  mode: MorphConfig['mode']
  /** The reach the Origin actually resolves to — differs from `origin.reach`
   *  while auto-fit is on (#49). */
  effectiveReach: number
  onChangePosition: (position: number) => void
  onChangeReach: (reach: number) => void
  onChangeAutoReach: (auto: boolean) => void
  onChangeSides: (sides: MorphSides) => void
  onDelete: () => void
  onClose: () => void
}

const SIDES_ORDER: MorphSides[] = ['both', 'negative', 'positive']

const labelStyle: React.CSSProperties = {
  fontFamily: "'Cinzel', Georgia, serif",
  fontSize: 9,
  fontWeight: 600,
  letterSpacing: '0.10em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  whiteSpace: 'nowrap',
}

export function MorphOriginSlider({
  origin,
  mode,
  effectiveReach,
  onChangePosition,
  onChangeReach,
  onChangeAutoReach,
  onChangeSides,
  onDelete,
  onClose,
}: Props) {
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

  const min = mode === 'radial' ? 0 : -MORPH_POSITION_RANGE
  const label = mode === 'radial' ? 'Ring radius' : 'Origin position'
  const sideLabels = morphSideLabels(mode)

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
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ ...labelStyle, width: 68 }}>{label}</span>
        <input
          type="range"
          min={min}
          max={MORPH_POSITION_RANGE}
          step={1}
          value={origin.position}
          onChange={e => onChangePosition(Number(e.target.value))}
          style={{ flex: 1 }}
        />
        <NumberStepper
          value={Math.round(origin.position)}
          onChange={onChangePosition}
          min={min}
          max={MORPH_POSITION_RANGE}
          step={1}
          ariaLabel={label}
        />
        <button
          onClick={onDelete}
          title="Delete Origin"
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

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ ...labelStyle, width: 68 }}>Reach</span>
        <label
          title="Meet the neighbouring Origins halfway"
          style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', flexShrink: 0 }}
        >
          <input
            type="checkbox"
            checked={origin.autoReach === true}
            onChange={e => onChangeAutoReach(e.target.checked)}
            aria-label="Auto reach"
          />
          Auto
        </label>
        <input
          type="range"
          min={0}
          max={MORPH_REACH_RANGE}
          step={1}
          value={Math.round(effectiveReach)}
          disabled={origin.autoReach === true}
          onChange={e => onChangeReach(Number(e.target.value))}
          style={{ flex: 1, opacity: origin.autoReach ? 0.45 : 1 }}
          aria-label="Morph Origin reach"
        />
        <NumberStepper
          value={Math.round(effectiveReach)}
          onChange={onChangeReach}
          min={0}
          max={MORPH_REACH_RANGE}
          step={1}
          ariaLabel="Morph Origin reach"
        />
        <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
          {SIDES_ORDER.map(s => (
            <button
              key={s}
              onClick={() => onChangeSides(s)}
              aria-pressed={origin.sides === s}
              style={{
                padding: '4px 7px',
                fontFamily: "'Cinzel', Georgia, serif",
                fontSize: 9,
                fontWeight: 600,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                border: `1px solid ${origin.sides === s ? 'var(--accent)' : 'var(--border-subtle)'}`,
                background: origin.sides === s ? 'var(--accent-bg)' : 'transparent',
                color: origin.sides === s ? 'var(--accent)' : 'var(--text-muted)',
              }}
            >
              {sideLabels[s]}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
