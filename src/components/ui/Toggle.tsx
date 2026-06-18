/**
 * Shared checkbox + label toggle row. The label dims when unchecked. Was
 * defined inline in the Gallery Sidebar; now shared with StrandStyleControls
 * and the Lab.
 */
export function Toggle({ checked, onChange, label }: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <label style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      cursor: 'pointer',
      fontFamily: 'var(--font-body)',
      fontSize: 'var(--fs-label)',
      color: checked ? 'var(--text)' : 'var(--text-muted)',
      transition: 'color 0.15s',
    }}>
      <input
        type="checkbox"
        className="pattern-checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
      />
      {label}
    </label>
  )
}
