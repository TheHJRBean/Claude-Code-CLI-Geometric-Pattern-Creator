/**
 * Shared label row: a left-aligned field name plus an optional right-aligned
 * mono value/unit. Previously copy-pasted in Sidebar, lab/labShared, and
 * ConfigLibraryPanel — this is the single source of truth.
 */
export function FieldLabel({ label, value, unit, tooltip }: {
  label: string
  value?: string
  unit?: string
  tooltip?: string
}) {
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
          fontFamily: 'var(--font-body)',
          fontSize: 'var(--fs-label)',
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
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--fs-mono)',
          color: 'var(--accent)',
          letterSpacing: '0.04em',
        }}>
          {value}{unit}
        </span>
      )}
    </div>
  )
}
