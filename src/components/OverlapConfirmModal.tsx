import { useEffect, useRef } from 'react'

/**
 * Flexible-placement (2026-06-01) — overlap confirmation popover.
 *
 * Shown when the user picks a polygon size / orientation that would overlap an
 * already-placed Tile (or, under symmetry, an orbit sibling). The picker no
 * longer hard-blocks these; this popover explains the overlap and asks for an
 * explicit "Accept and continue" before committing with `force: true`.
 *
 * A LOCAL floating popover anchored at the picker's screen position (not a
 * screen overlay) — same anchoring + arrow as `EditorPickerOverlay`. Styled to
 * mirror the Complete-mode rejection pill / soft-override button: `--bg-elevated`
 * ground, Art-Deco double-line border, flanking diamond ornaments, EB Garamond
 * type, danger-toned caution with a gold-accent accept action.
 */

const NGON_LABEL: Record<number, string> = {
  3: 'Triangle', 4: 'Square', 5: 'Pentagon', 6: 'Hexagon',
  7: 'Heptagon', 8: 'Octagon', 9: 'Nonagon', 10: 'Decagon', 12: 'Dodecagon',
}

const DANGER_COLOR = '#a85050'

interface Props {
  /** Screen-space anchor (picker position the overlap was triggered from). */
  position: { x: number; y: number }
  /** Polygon being placed — names the shape in the prompt. */
  sides: number
  /** True when symmetry mode is on, so the copy mentions orbit siblings. */
  symmetry?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function OverlapConfirmModal({ position, sides, symmetry, onConfirm, onCancel }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onCancel() }
      if (e.key === 'Enter') { e.preventDefault(); onConfirm() }
    }
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node | null
      if (t && ref.current && ref.current.contains(t)) return
      onCancel()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointerDown)
    }
  }, [onConfirm, onCancel])

  const name = NGON_LABEL[sides] ?? `${sides}-gon`
  const body = symmetry
    ? `This ${name} overlaps a Tile already placed, or one of its symmetry copies.`
    : `This ${name} overlaps a Tile that's already placed.`

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Confirm overlapping placement"
      onPointerDown={e => e.stopPropagation()}
      style={{
        position: 'absolute',
        left: position.x,
        top: position.y,
        transform: 'translate(-50%, calc(-100% - 18px))',
        width: 300,
        maxWidth: 'calc(100vw - 32px)',
        zIndex: 30,
        background: 'var(--bg-elevated, #161620)',
        border: '1px solid var(--accent, #c9943a)',
        boxShadow: '0 10px 32px rgba(0,0,0,0.55)',
        padding: 18,
      }}
    >
      {/* Inset hairline — Art-Deco double-line border. */}
      <div aria-hidden style={{
        position: 'absolute',
        inset: 4,
        border: '1px solid var(--accent-line, rgba(201,148,58,0.4))',
        pointerEvents: 'none',
      }} />

      {/* Header — diamond · CAUTION · diamond. */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        marginBottom: 10,
      }}>
        <Diamond color={DANGER_COLOR} />
        <span style={{
          fontFamily: "'EB Garamond', Georgia, serif",
          fontSize: 11,
          fontWeight: 600,
          color: DANGER_COLOR,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
        }}>Overlapping placement</span>
        <Diamond color={DANGER_COLOR} />
      </div>

      <p style={{
        margin: '0 0 16px',
        textAlign: 'center',
        fontFamily: "'EB Garamond', Georgia, serif",
        fontSize: 14,
        lineHeight: 1.45,
        color: 'var(--text, #d8cfbf)',
        letterSpacing: '0.01em',
      }}>
        {body}{' '}
        <span style={{ color: 'var(--text-muted, #8a7e6c)' }}>
          You can place it anyway and delete it later.
        </span>
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 8 }}>
        <DecoButton variant="ghost" onClick={onCancel}>Cancel</DecoButton>
        <DecoButton variant="accent" onClick={onConfirm}>Accept</DecoButton>
      </div>

      {/* Down-pointing arrow toward the anchor, matching the picker popover. */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: '50%',
          bottom: -7,
          transform: 'translateX(-50%) rotate(45deg)',
          width: 12,
          height: 12,
          background: 'var(--bg-elevated, #161620)',
          borderRight: '1px solid var(--accent, #c9943a)',
          borderBottom: '1px solid var(--accent, #c9943a)',
        }}
      />
    </div>
  )
}

/** Small Art-Deco diamond ornament (rotated square). */
function Diamond({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-block',
        width: 5,
        height: 5,
        background: color,
        transform: 'rotate(45deg)',
        flex: 'none',
      }}
    />
  )
}

/** Art-Deco button mirroring the Complete-mode soft-override button: ground +
 *  accent rule, flanking diamonds on the primary action, EB Garamond uppercase. */
function DecoButton({
  children, variant, onClick,
}: {
  children: React.ReactNode
  variant: 'accent' | 'ghost'
  onClick: () => void
}) {
  const accent = variant === 'accent'
  const color = accent ? 'var(--accent, #c9943a)' : 'var(--text-muted, #8a7e6c)'
  const border = accent ? 'var(--accent, #c9943a)' : 'var(--border-accent, #2c2418)'
  return (
    <button
      onClick={onClick}
      style={{
        position: 'relative',
        height: 34,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: '0 10px',
        border: `1.4px solid ${border}`,
        background: accent ? 'var(--accent-bg, rgba(201,148,58,0.12))' : 'transparent',
        color,
        cursor: 'pointer',
        fontFamily: "'EB Garamond', Georgia, serif",
        fontSize: 11.5,
        fontWeight: 600,
        letterSpacing: '0.16em',
        textTransform: 'uppercase',
      }}
    >
      {accent && <Diamond color="var(--accent, #c9943a)" />}
      {children}
      {accent && <Diamond color="var(--accent, #c9943a)" />}
    </button>
  )
}
