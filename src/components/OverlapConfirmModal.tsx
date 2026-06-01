import { useEffect } from 'react'

/**
 * Flexible-placement (2026-06-01) — overlap confirmation modal.
 *
 * Shown when the user picks a polygon size / orientation that would overlap an
 * already-placed Tile (or, under symmetry, an orbit sibling). The picker no
 * longer hard-blocks these; this modal explains the overlap and asks for an
 * explicit "Accept and continue" before committing with `force: true`.
 *
 * Styled to mirror the Complete-mode rejection pill / soft-override button
 * (`EditorVertexLayer.tsx`): `--bg-elevated` ground, Art-Deco double-line
 * border, flanking diamond ornaments, EB Garamond type, danger-toned caution
 * with a gold-accent accept action.
 */

const NGON_LABEL: Record<number, string> = {
  3: 'Triangle', 4: 'Square', 5: 'Pentagon', 6: 'Hexagon',
  7: 'Heptagon', 8: 'Octagon', 9: 'Nonagon', 10: 'Decagon', 12: 'Dodecagon',
}

const DANGER_COLOR = '#a85050'

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
    ? `This ${name} overlaps a Tile that's already placed, or one of the symmetry copies it would create.`
    : `This ${name} overlaps a Tile that's already placed.`

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Confirm overlapping placement"
      onClick={onCancel}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 40,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(2px)',
        WebkitBackdropFilter: 'blur(2px)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'relative',
          width: 'min(440px, calc(100vw - 48px))',
          background: 'var(--bg-elevated, #161620)',
          border: '1px solid var(--accent, #c9943a)',
          boxShadow: '0 14px 44px rgba(0,0,0,0.6)',
          padding: 26,
        }}
      >
        {/* Inset hairline — Art-Deco double-line border. */}
        <div aria-hidden style={{
          position: 'absolute',
          inset: 5,
          border: '1px solid var(--accent-line, rgba(201,148,58,0.4))',
          pointerEvents: 'none',
        }} />

        {/* Header — diamond · CAUTION · diamond. */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          marginBottom: 16,
        }}>
          <Diamond color={DANGER_COLOR} />
          <span style={{
            fontFamily: "'EB Garamond', Georgia, serif",
            fontSize: 12,
            fontWeight: 600,
            color: DANGER_COLOR,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
          }}>Overlapping placement</span>
          <Diamond color={DANGER_COLOR} />
        </div>

        <p style={{
          margin: '0 0 22px',
          textAlign: 'center',
          fontFamily: "'EB Garamond', Georgia, serif",
          fontSize: 15.5,
          lineHeight: 1.5,
          color: 'var(--text, #d8cfbf)',
          letterSpacing: '0.01em',
        }}>
          {body}<br />
          <span style={{ color: 'var(--text-muted, #8a7e6c)', fontSize: 14 }}>
            You can place it anyway and delete it later.
          </span>
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 12 }}>
          <DecoButton variant="ghost" onClick={onCancel}>Cancel</DecoButton>
          <DecoButton variant="accent" onClick={onConfirm}>Accept and continue</DecoButton>
        </div>
      </div>
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
        width: 6,
        height: 6,
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
        height: 40,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: '0 14px',
        border: `1.5px solid ${border}`,
        background: accent ? 'var(--accent-bg, rgba(201,148,58,0.12))' : 'transparent',
        color,
        cursor: 'pointer',
        fontFamily: "'EB Garamond', Georgia, serif",
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
      }}
    >
      {accent && <Diamond color="var(--accent, #c9943a)" />}
      {children}
      {accent && <Diamond color="var(--accent, #c9943a)" />}
    </button>
  )
}
