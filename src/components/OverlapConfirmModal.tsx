import { useEffect } from 'react'

/**
 * Flexible-placement (2026-06-01) — overlap confirmation modal.
 *
 * Shown when the user picks a polygon size / orientation that would overlap an
 * already-placed Tile (or, under symmetry, an orbit sibling). The picker no
 * longer hard-blocks these; instead this modal explains the overlap and asks
 * for an explicit "Place anyway" before committing with `force: true`.
 *
 * Centred over the canvas with a dimmed backdrop. Escape or backdrop click
 * cancels; the accent "Place anyway" button confirms.
 */

const NGON_LABEL: Record<number, string> = {
  3: 'Triangle', 4: 'Square', 5: 'Pentagon', 6: 'Hexagon',
  7: 'Heptagon', 8: 'Octagon', 9: 'Nonagon', 10: 'Decagon', 12: 'Dodecagon',
}

const WARN_COLOR = '#d99a4a'

interface Props {
  /** Polygon being placed — names the shape in the prompt. */
  sides: number
  /** True when symmetry mode is on, so the copy mentions orbit siblings. */
  symmetry?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function OverlapConfirmModal({ sides, symmetry, onConfirm, onCancel }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onCancel() }
      if (e.key === 'Enter') { e.preventDefault(); onConfirm() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onConfirm, onCancel])

  const name = NGON_LABEL[sides] ?? `${sides}-gon`
  const body = symmetry
    ? `This ${name} overlaps a Tile that's already placed, or one of the symmetry copies it would create. Placing it anyway keeps the overlap — you can delete it afterwards if it's not what you wanted.`
    : `This ${name} overlaps a Tile that's already placed. Placing it anyway keeps the overlap — you can delete it afterwards if it's not what you wanted.`

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Confirm overlapping placement"
      onPointerDown={onCancel}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 40,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.45)',
        backdropFilter: 'blur(2px)',
        WebkitBackdropFilter: 'blur(2px)',
      }}
    >
      <div
        onPointerDown={e => e.stopPropagation()}
        style={{
          width: 'min(420px, calc(100vw - 48px))',
          background: 'var(--surface, var(--bg, #1a1a1a))',
          border: `1px solid ${WARN_COLOR}`,
          boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
          padding: 22,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <span aria-hidden style={{ fontSize: 18, color: WARN_COLOR, lineHeight: 1 }}>⚠</span>
          <span style={{
            fontFamily: "'Cinzel', Georgia, serif",
            fontSize: 12,
            fontWeight: 600,
            color: WARN_COLOR,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
          }}>Overlapping placement</span>
        </div>

        <p style={{
          margin: '0 0 20px',
          fontFamily: "'EB Garamond', Georgia, serif",
          fontSize: 15,
          lineHeight: 1.5,
          color: 'var(--text, #e8e0d0)',
          letterSpacing: '0.01em',
        }}>{body}</p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <ModalButton variant="ghost" onClick={onCancel}>Cancel</ModalButton>
          <ModalButton variant="warn" onClick={onConfirm}>Place anyway</ModalButton>
        </div>
      </div>
    </div>
  )
}

function ModalButton({
  children, variant, onClick,
}: {
  children: React.ReactNode
  variant: 'warn' | 'ghost'
  onClick: () => void
}) {
  const warn = variant === 'warn'
  return (
    <button
      onClick={onClick}
      style={{
        height: 40,
        padding: '0 14px',
        border: `1px solid ${warn ? WARN_COLOR : 'var(--border-subtle, rgba(255,255,255,0.25))'}`,
        background: warn ? 'rgba(217,154,74,0.18)' : 'transparent',
        color: warn ? WARN_COLOR : 'var(--text-muted, #b8ad97)',
        cursor: 'pointer',
        fontFamily: "'Cinzel', Georgia, serif",
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        transition: 'background 0.14s',
      }}
    >{children}</button>
  )
}
