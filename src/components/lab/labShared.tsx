import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import type { PatternConfig } from '../../types/pattern'
import { detectCellTilingStatus } from '../../editor/nonTilingDetection'

/**
 * Shared style for the Lab's segmented-control buttons — the accent-when-active
 * pill used by the phase switch, the Place/Complete tool toggle, and the
 * Decoration paint-target / reach toggles. The accent active/inactive triplet
 * (border + background + colour) was copy-pasted across those sites; centring
 * it here keeps them in lockstep. `letterSpacing` and the hover `transition`
 * are the only per-site variations, so they're options (defaults match the
 * phase switch).
 */
export function segmentedButtonStyle(
  active: boolean,
  opts: { letterSpacing?: string; transition?: boolean } = {},
): CSSProperties {
  const { letterSpacing = '0.06em', transition = true } = opts
  return {
    flex: 1,
    padding: '5px 0',
    fontFamily: "'Cinzel', Georgia, serif",
    fontSize: 9,
    fontWeight: 600,
    letterSpacing,
    textTransform: 'uppercase',
    cursor: 'pointer',
    border: `1px solid ${active ? 'var(--accent)' : 'var(--border-subtle)'}`,
    background: active ? 'var(--accent-bg)' : 'transparent',
    color: active ? 'var(--accent)' : 'var(--text-muted)',
    ...(transition ? { transition: 'all 0.15s' } : null),
  }
}

/**
 * Export button for the Lab sidebar's Export section. Mirrors the Gallery
 * Sidebar's `ExportBtn` (primary = filled accent gradient, secondary =
 * accent-outlined) so the two surfaces read identically.
 */
export function LabExportButton({ children, onClick, secondary = false }: {
  children: ReactNode
  onClick: () => void
  secondary?: boolean
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: secondary
          ? 'transparent'
          : 'linear-gradient(180deg, var(--btn-primary-from) 0%, var(--btn-primary-to) 100%)',
        color: secondary ? 'var(--accent)' : 'var(--btn-primary-text)',
        border: `1px solid ${secondary ? 'var(--border-accent)' : 'var(--btn-primary-border)'}`,
        padding: '8px 10px',
        fontFamily: "'Cinzel', Georgia, serif",
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        cursor: 'pointer',
        transition: 'border-color 0.15s, opacity 0.15s',
      }}
      onMouseEnter={e => {
        const el = e.currentTarget
        if (secondary) el.style.borderColor = 'var(--accent-border)'
        else el.style.opacity = '0.85'
      }}
      onMouseLeave={e => {
        const el = e.currentTarget
        if (secondary) el.style.borderColor = 'var(--border-accent)'
        else el.style.opacity = '1'
      }}
    >
      {children}
    </button>
  )
}

/**
 * Typeable numeric field with up/down nudge arrows — the precise-entry
 * counterpart to a coarse slider. The text input keeps a local draft so
 * partial entries ("1.", "") don't fight the controlled value; it commits on
 * blur / Enter (clamped + rounded to `precision`), reverting an unparseable
 * draft. ArrowUp/Down in the field and the ▲/▼ buttons step by `step`. Used by
 * the Frame controls so size / aspect / angle can be typed or nudged exactly.
 */
export function NumberStepper({
  value, onChange, min, max, step, precision = 0, suffix = '', ariaLabel, width = 56,
}: {
  value: number
  onChange: (next: number) => void
  min: number
  max: number
  step: number
  precision?: number
  suffix?: string
  ariaLabel?: string
  width?: number
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n))
  const round = (n: number) => { const f = 10 ** precision; return Math.round(n * f) / f }
  const [draft, setDraft] = useState<string>(value.toFixed(precision))
  // Re-sync the draft when the value changes from outside (slider, preset, reset).
  useEffect(() => { setDraft(value.toFixed(precision)) }, [value, precision])
  const commit = () => {
    const n = parseFloat(draft)
    if (Number.isFinite(n)) onChange(round(clamp(n)))
    else setDraft(value.toFixed(precision))
  }
  const nudge = (dir: 1 | -1) => onChange(round(clamp(value + dir * step)))

  const arrowBtn: CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 18, height: 11, padding: 0, lineHeight: 1, fontSize: 7,
    cursor: 'pointer', color: 'var(--text-muted)',
    background: 'transparent', border: '1px solid var(--border-subtle)',
  }
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', gap: 4 }}>
      <input
        type="text"
        inputMode="decimal"
        aria-label={ariaLabel}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') { commit(); (e.target as HTMLInputElement).blur() }
          else if (e.key === 'ArrowUp') { e.preventDefault(); nudge(1) }
          else if (e.key === 'ArrowDown') { e.preventDefault(); nudge(-1) }
        }}
        style={{
          width, padding: '3px 6px', textAlign: 'right',
          fontFamily: "'EB Garamond', Georgia, serif", fontSize: 12,
          color: 'var(--text)', background: 'transparent',
          border: '1px solid var(--border-subtle)',
        }}
      />
      {suffix && (
        <span style={{ alignSelf: 'center', fontSize: 11, color: 'var(--text-muted)', fontFamily: "'EB Garamond', Georgia, serif" }}>{suffix}</span>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <button type="button" aria-label="Increase" onClick={() => nudge(1)} style={arrowBtn}>▲</button>
        <button type="button" aria-label="Decrease" onClick={() => nudge(-1)} style={arrowBtn}>▼</button>
      </div>
    </div>
  )
}

/**
 * Directional arrow pad for nudging a 2D position precisely. The four arrows
 * step by `step` world units (up = −y, screen convention); the centre ⊙ resets
 * to the origin via `onCenter`. Used by the Frame controls to move the Frame
 * origin without dragging a slider.
 */
export function NudgePad({ onNudge, onCenter, step = 10 }: {
  onNudge: (dx: number, dy: number) => void
  onCenter?: () => void
  step?: number
}) {
  const cell: CSSProperties = {
    width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', color: 'var(--text-muted)', background: 'transparent',
    border: '1px solid var(--border-subtle)', fontSize: 11, padding: 0,
  }
  const blank: CSSProperties = { width: 22, height: 22 }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 22px)', gap: 2 }}>
      <span style={blank} />
      <button type="button" aria-label="Move up" onClick={() => onNudge(0, -step)} style={cell}>↑</button>
      <span style={blank} />
      <button type="button" aria-label="Move left" onClick={() => onNudge(-step, 0)} style={cell}>←</button>
      <button type="button" aria-label="Reset position" title="Reset position" onClick={onCenter} style={{ ...cell, fontSize: 13 }}>⊙</button>
      <button type="button" aria-label="Move right" onClick={() => onNudge(step, 0)} style={cell}>→</button>
      <span style={blank} />
      <button type="button" aria-label="Move down" onClick={() => onNudge(0, step)} style={cell}>↓</button>
      <span style={blank} />
    </div>
  )
}

/**
 * Shared presentational primitives for the Builder (Lab) sidebar — icons,
 * the mode toggle, collapsible section title, field label, and the
 * non-tiling warning. Extracted from `TessellationLabMode.tsx` so the Lab
 * shell and `EditorDesignControls` panels can share them without the file
 * sprawling past the 1k-line bar.
 */

export function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  )
}

export function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

export function ModeToggleButton({ mode, onToggleMode }: { mode: 'main' | 'lab'; onToggleMode: () => void }) {
  const inMain = mode === 'main'
  return (
    <button
      onClick={onToggleMode}
      aria-label={inMain ? 'Open Lab' : 'Return to Gallery'}
      title={inMain ? 'Open Lab — Exploratory Workspace' : 'Return to Gallery'}
      style={{
        position: 'absolute',
        top: 14,
        left: 12,
        height: 26,
        background: inMain ? 'transparent' : 'var(--accent-bg)',
        color: 'var(--accent)',
        border: `1px solid ${inMain ? 'var(--border-accent)' : 'var(--accent)'}`,
        padding: '0 10px',
        fontFamily: "'Cinzel', Georgia, serif",
        fontSize: 9,
        fontWeight: 600,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        cursor: 'pointer',
        zIndex: 5,
      }}
    >
      {inMain ? 'Lab' : '← Gallery'}
    </button>
  )
}

function SectionChevron({ open }: { open: boolean }) {
  return (
    <svg
      width="9"
      height="9"
      viewBox="0 0 10 10"
      style={{
        transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
        transition: 'transform 0.2s ease',
        flexShrink: 0,
        color: 'var(--accent)',
        opacity: 0.5,
      }}
      aria-hidden="true"
    >
      <polyline points="2.5 4 5 6.5 7.5 4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function SectionTitle({ children, open, onToggle, tooltip }: {
  children: ReactNode
  open?: boolean
  onToggle?: () => void
  tooltip?: string
}) {
  const interactive = typeof onToggle === 'function'
  const isOpen = open ?? true
  const inner = (
    <>
      <span style={{
        fontFamily: "'Cinzel', Georgia, serif",
        fontSize: 10,
        fontWeight: 600,
        color: 'var(--accent)',
        letterSpacing: '0.20em',
        textTransform: 'uppercase' as const,
        textDecoration: tooltip ? 'underline dotted var(--text-muted)' : 'none',
        textUnderlineOffset: 4,
      }}>
        {children}
      </span>
      <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, var(--divider), transparent)' }} />
      {interactive && <SectionChevron open={isOpen} />}
    </>
  )
  if (!interactive) {
    return (
      <div
        title={tooltip}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          marginBottom: 14,
          cursor: tooltip ? 'help' : 'default',
        }}
      >
        {inner}
      </div>
    )
  }
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={isOpen}
      title={tooltip}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        marginBottom: isOpen ? 14 : 2,
        width: '100%',
        background: 'transparent',
        border: 'none',
        padding: '6px 0',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'margin-bottom 0.2s ease',
      }}
    >
      {inner}
    </button>
  )
}

export function FieldLabel({ label, value, unit, tooltip }: { label: string; value?: string; unit?: string; tooltip?: string }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      marginBottom: 7,
      marginTop: 12,
    }}>
      <span
        title={tooltip}
        style={{
          fontFamily: "'EB Garamond', Georgia, serif",
          fontSize: 13.5,
          color: 'var(--text-secondary)',
          letterSpacing: '0.02em',
          cursor: tooltip ? 'help' : 'default',
          textDecoration: tooltip ? 'underline dotted var(--text-muted)' : 'none',
          textUnderlineOffset: 3,
        }}
      >
        {label}
      </span>
      {value !== undefined && (
        <span style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11,
          color: 'var(--accent)',
          letterSpacing: '0.04em',
        }}>
          {value}{unit}
        </span>
      )}
    </div>
  )
}

/* ── Step 17.10 — non-tiling patch warning ─────────────── */

export function NonTilingWarning({ editor }: { editor: NonNullable<PatternConfig['editor']> }) {
  // Aggregate across every Cell: if any Cell is non-tiling, surface that as
  // the Patch-level warning. Multi-cell Configurations are non-tiling as soon
  // as a single Cell is — the lattice stamps depend on all Cells fitting.
  let status: ReturnType<typeof detectCellTilingStatus> | null = null
  for (const cell of editor.cells) {
    const s = detectCellTilingStatus(cell)
    if (s.kind === 'non-tiling') { status = s; break }
  }
  if (!status) return null
  const message = status.reason === 'overflows'
    ? "Patch extends past the boundary — stamped copies will overlap."
    : status.reason === 'empty'
      ? "Patch is empty — no tiles to stamp."
      : "Patch doesn't fill the boundary — stamped copies will leave gaps."
  return (
    <div style={{
      marginTop: 8,
      padding: '6px 8px',
      border: '1px solid #a85050',
      background: 'rgba(168, 80, 80, 0.08)',
      color: '#a85050',
      fontSize: 11.5,
      lineHeight: 1.4,
    }}>
      <span style={{
        fontFamily: "'Cinzel', Georgia, serif",
        fontSize: 9,
        fontWeight: 600,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        display: 'block',
        marginBottom: 3,
      }}>
        Non-tiling patch
      </span>
      {message}
    </div>
  )
}
