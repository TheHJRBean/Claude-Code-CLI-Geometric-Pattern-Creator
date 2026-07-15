import type { PatternConfig } from '../../types/pattern'
import { NonTilingWarning } from './labShared'

/**
 * Composition-Phase ("strand") info block in the Builder sidebar: explains the
 * lattice stamping, surfaces the non-tiling warning, and offers the
 * boundary-tessellation preview toggle. Extracted from `EditorDesignControls`.
 */
export function CompositionPanel({
  editor,
  showBoundaryLattice,
  onToggleShowBoundaryLattice,
  showGuides,
  onToggleShowGuides,
}: {
  editor: NonNullable<PatternConfig['editor']>
  showBoundaryLattice: boolean
  onToggleShowBoundaryLattice: (next: boolean) => void
  /** Guides overlay show/hide — hidden by default in Composition (spec
   *  Decision 9). Only offered when the Patch carries Guides. */
  showGuides: boolean
  onToggleShowGuides: (next: boolean) => void
}) {
  return (
    <div style={{
      marginTop: 0,
      marginBottom: 14,
      padding: '8px 10px',
      fontFamily: "'EB Garamond', Georgia, serif",
      fontSize: 12,
      color: 'var(--text-muted)',
      lineHeight: 1.45,
      border: '1px solid var(--border-subtle)',
    }}>
      <div>
        Patch is stamped on the boundary's translation lattice. Edit
        strand controls below; flip back to Design to change tiles.
      </div>
      <NonTilingWarning editor={editor} />
      <label style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginTop: 8,
        cursor: 'pointer',
        color: showBoundaryLattice ? 'var(--text)' : 'var(--text-muted)',
      }}>
        <input
          type="checkbox"
          checked={showBoundaryLattice}
          onChange={e => onToggleShowBoundaryLattice(e.target.checked)}
        />
        Show boundary tessellation
      </label>
      {(editor.guides?.length ?? 0) > 0 && (
        <label style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginTop: 8,
          cursor: 'pointer',
          color: showGuides ? 'var(--text)' : 'var(--text-muted)',
        }}>
          <input
            type="checkbox"
            checked={showGuides}
            onChange={e => onToggleShowGuides(e.target.checked)}
          />
          Show guides
        </label>
      )}
    </div>
  )
}
