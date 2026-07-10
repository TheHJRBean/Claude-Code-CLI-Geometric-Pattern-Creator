import { buildPresetShelf, type PresetShelfEntry } from '../editor/presetShelf'

/**
 * Presets shelf (ADR-0006 slice 4) — the read-only preset section beside
 * My Tessellations. One card per Gallery preset; no rename / delete /
 * save affordances, ever — clicking hands a fresh working config to the
 * caller (via `buildPresetConfig` in the Lab), so the catalogue itself
 * cannot be corrupted. Non-convertible tiers are badged "view only"
 * (legacy BFS render path, Composition-level controls only).
 */

interface Props {
  onLoadPreset: (entry: PresetShelfEntry) => void
}

// The catalogue is static — assemble the shelf once per session.
const SHELF = buildPresetShelf()

export function PresetShelfPanel({ onLoadPreset }: Props) {
  return (
    <>
      <p style={{
        marginTop: 0,
        marginBottom: 8,
        fontFamily: "'EB Garamond', Georgia, serif",
        fontStyle: 'italic',
        fontSize: 11.5,
        color: 'var(--text-muted)',
        lineHeight: 1.4,
      }}>
        Templates — loading one opens a fresh copy; the preset itself never changes.
      </p>
      <div style={{ maxHeight: 260, overflowY: 'auto', paddingRight: 2 }}>
        {SHELF.map(entry => (
          <button
            key={entry.id}
            onClick={() => onLoadPreset(entry)}
            title={entry.viewOnly
              ? 'View only — renders on the legacy path; strand controls only, not yet editable as a Patch.'
              : 'Load as a fully editable Patch.'}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              width: '100%',
              marginBottom: 5,
              padding: '6px 8px',
              textAlign: 'left',
              cursor: 'pointer',
              border: '1px solid var(--border-subtle)',
              background: 'transparent',
              transition: 'all 0.15s',
            }}
          >
            <span style={{
              fontFamily: "'EB Garamond', Georgia, serif",
              fontSize: 12.5,
              color: 'var(--text)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {entry.label}
            </span>
            {entry.viewOnly && (
              <span style={{
                flexShrink: 0,
                fontFamily: "'Cinzel', Georgia, serif",
                fontSize: 8,
                fontWeight: 600,
                letterSpacing: '0.10em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
                border: '1px solid var(--border-subtle)',
                padding: '2px 5px',
              }}>
                View only
              </span>
            )}
          </button>
        ))}
      </div>
    </>
  )
}
