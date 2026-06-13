import type { PatternConfig } from '../../types/pattern'
import type { Action } from '../../state/actions'
import type { BoundaryShape, ConfigurationId, SymmetryMode } from '../../types/editor'
import type { Vec2 } from '../../utils/math'
import { BOUNDARY_SIZE_MAX_BY_SHAPE } from '../../editor/createDefault'
import { activeCell } from '../../editor/active'
import { FieldLabel, segmentedButtonStyle } from './labShared'

type BoundaryPickerKind =
  | { kind: 'shape'; shape: BoundaryShape }
  | { kind: 'configuration'; id: ConfigurationId }

const BOUNDARY_OPTIONS: { value: BoundaryPickerKind; label: string }[] = [
  { value: { kind: 'shape', shape: 'triangle' }, label: 'Triangle' },
  { value: { kind: 'shape', shape: 'square' }, label: 'Square' },
  { value: { kind: 'shape', shape: 'hexagon' }, label: 'Hexagon' },
  { value: { kind: 'configuration', id: '4.8.8' }, label: '4.8.8' },
  { value: { kind: 'configuration', id: '3.12.12' }, label: '3.12.12' },
  { value: { kind: 'configuration', id: '4.6.12' }, label: '4.6.12' },
  { value: { kind: 'configuration', id: '3.6.3.6' }, label: '3.6.3.6' },
  { value: { kind: 'configuration', id: '3.4.6.4' }, label: '3.4.6.4' },
]

interface DesignPanelProps {
  editor: NonNullable<PatternConfig['editor']>
  dispatch: React.Dispatch<Action>
  editorMode: 'place' | 'complete'
  onSetEditorMode: (m: 'place' | 'complete') => void
  picks: Vec2[]
  multiMode: boolean
  onCancelComplete: () => void
  onClear: () => void
  showNeighbours: boolean
  onToggleShowNeighbours: (next: boolean) => void
  showNeighbourBoundaries: boolean
  onToggleShowNeighbourBoundaries: (next: boolean) => void
  showNeighbourStrands: boolean
  onToggleShowNeighbourStrands: (next: boolean) => void
}

/**
 * Design-Phase controls in the Builder sidebar: boundary/Configuration picker,
 * active-Cell selector, alternate orientation, boundary size, Seed sides,
 * symmetry, wrap, No-Seed, neighbour preview, and the Place/Complete tool
 * toggle. Extracted from `EditorDesignControls`.
 */
export function DesignPanel({
  editor,
  dispatch,
  editorMode,
  onSetEditorMode,
  picks,
  multiMode,
  onCancelComplete,
  onClear,
  showNeighbours,
  onToggleShowNeighbours,
  showNeighbourBoundaries,
  onToggleShowNeighbourBoundaries,
  showNeighbourStrands,
  onToggleShowNeighbourStrands,
}: DesignPanelProps) {
  const cell = activeCell(editor)
  const multiCell = editor.cells.length > 1
  // Once the user has placed (or completed) any Tile in the active Cell
  // beyond the auto-placed Seed, changing Seed sides (or toggling No Seed)
  // would wipe their work — lock both controls until the Cell is cleared.
  const originLocked = cell.tiles.some(t => t.source !== 'seed')
  return (
    <>
      <FieldLabel
        label="Boundary"
        tooltip="Cell shape (or multi-cell Configuration) the Patch is built into. Single-cell options like Square/Hex/Triangle give one Cell; Configurations like 4.8.8 give a multi-cell Patch."
      />
      <select
        className="pattern-select"
        value={
          multiCell && editor.configuration
            ? `configuration:${editor.configuration}`
            : `shape:${cell.shape}`
        }
        onChange={e => {
          const [kind, id] = e.target.value.split(':') as [
            'shape' | 'configuration',
            string,
          ]
          if (kind === 'configuration') {
            dispatch({ type: 'SET_BUILDER_CONFIGURATION', payload: id as ConfigurationId })
          } else {
            // Reducer handles the composition → single-shape transition by
            // seeding a fresh patch in the requested shape.
            dispatch({ type: 'SET_CELL_SHAPE', payload: id as BoundaryShape })
          }
        }}
        style={{ marginBottom: 4 }}
      >
        {BOUNDARY_OPTIONS.map(opt => {
          const value = opt.value.kind === 'configuration'
            ? `configuration:${opt.value.id}`
            : `shape:${opt.value.shape}`
          return (
            <option key={value} value={value}>
              {opt.label}
            </option>
          )
        })}
      </select>

      {multiCell && (
        <>
          <FieldLabel
            label="Editing Cell"
            tooltip="Which Cell of the multi-cell Patch you're authoring Tiles into. Composition Phase renders all Cells together; Design Phase lets you author them one at a time."
          />
          <select
            className="pattern-select"
            value={editor.activeCellId}
            onChange={e => dispatch({ type: 'SET_ACTIVE_CELL', payload: { cellId: e.target.value } })}
            style={{ marginBottom: 8 }}
          >
            {editor.cells.map(t => (
              <option key={t.id} value={t.id}>
                {t.id.charAt(0).toUpperCase() + t.id.slice(1)}
              </option>
            ))}
          </select>
        </>
      )}

      <label style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        marginTop: 10,
        cursor: 'pointer',
        fontFamily: "'EB Garamond', Georgia, serif",
        fontSize: 13,
        color: (multiCell ? editor.alternateOrientation : cell.alternateBoundary) ? 'var(--text)' : 'var(--text-muted)',
        transition: 'color 0.15s',
      }}>
        <input
          type="checkbox"
          checked={multiCell ? !!editor.alternateOrientation : !!cell.alternateBoundary}
          onChange={e => dispatch({ type: 'SET_EDITOR_ALTERNATE_BOUNDARY', payload: e.target.checked })}
        />
        Alternate orientation
      </label>

      {!multiCell && (
        <>
          <FieldLabel
            label="Boundary size"
            value={cell.boundarySize.toFixed(0)}
            unit=" u"
            tooltip="Diameter of the Cell's Boundary polygon in world units. Scales the Cell uniformly."
          />
          <input
            type="range"
            className="pattern-slider"
            min={80}
            max={BOUNDARY_SIZE_MAX_BY_SHAPE[cell.shape]}
            step={1}
            value={cell.boundarySize}
            onChange={e => dispatch({ type: 'SET_CELL_BOUNDARY_SIZE', payload: Number(e.target.value) })}
          />
        </>
      )}

      {multiCell && (
        <>
          <FieldLabel
            label="Lattice edge"
            value={editor.edgeLength.toFixed(0)}
            unit=" u"
            tooltip="Edge length shared by every Cell in this multi-cell Patch — drives the Lattice basis that stamps the Patch across the canvas in Composition Phase."
          />
          <input
            type="range"
            className="pattern-slider"
            // Min is the seeded lattice edge — i.e. the Seed Tile's size.
            // Scaling below this would pinch the Cell centres tighter than
            // the (fixed-size) Seed polygons can fit, making sibling Cells
            // overlap each other.
            min={100}
            max={400}
            step={1}
            value={editor.edgeLength}
            onChange={e => dispatch({ type: 'SET_CELL_BOUNDARY_SIZE', payload: Number(e.target.value) })}
          />
        </>
      )}
      {cell.wrapBoundary && (
        <div
          style={{
            fontFamily: "'Cinzel', Georgia, serif",
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
            marginTop: 2,
            marginBottom: 4,
            lineHeight: 1.4,
          }}
        >
          Driven by Wrap boundary — drag to override.
        </div>
      )}

      <FieldLabel
        label="Seed sides"
        value={String(cell.seedSides)}
        tooltip="Side count of the auto-placed Seed Tile — the starter polygon the Builder drops into a Cell so you have something to build from."
      />
      <input
        type="range"
        className="pattern-slider"
        min={3}
        max={24}
        step={1}
        value={cell.seedSides}
        disabled={originLocked}
        onChange={e => dispatch({ type: 'SET_CELL_SEED_SIDES', payload: Number(e.target.value) })}
        style={originLocked ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
      />
      {originLocked && (
        <div
          style={{
            fontFamily: "'Cinzel', Georgia, serif",
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
            marginTop: 2,
            marginBottom: 4,
            lineHeight: 1.4,
          }}
        >
          Locked — clear the patch to change the origin shape.
        </div>
      )}

      {/* Step 17.4 (re-enabled) — Symmetry picker. The chosen subgroup of
          the boundary's dihedral group governs how placements + deletes
          propagate. None = single-edge (17.3 behaviour, the default).
          Horizontal mirror is hidden for triangle (no horizontal mirror
          axis exists on an equilateral triangle). */}
      <FieldLabel label="Symmetry" />
      <select
        className="pattern-select"
        value={cell.symmetryMode ?? 'none'}
        onChange={e => dispatch({ type: 'SET_EDITOR_SYMMETRY_MODE', payload: e.target.value as SymmetryMode })}
      >
        <option value="none">None — single edge</option>
        <option value="full">Full — all rotations + mirrors</option>
        <option value="rotation">Rotation only</option>
        <option value="vertical">Vertical mirror only</option>
        {cell.shape !== 'triangle' && (
          <option value="horizontal">Horizontal mirror only</option>
        )}
      </select>
      {(cell.symmetryMode ?? 'none') !== 'none' && (
        <div style={{
          fontFamily: "'Cinzel', Georgia, serif",
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
          marginTop: 4,
          marginBottom: 4,
          lineHeight: 1.4,
        }}>
          Placements + deletes propagate under this subgroup.
        </div>
      )}

      {/* Wrap boundary — Design-Phase Boundary fitting (live). In a multi-Cell
          Patch the toggle is per-active-Cell: wraps the lattice cell to
          whichever Cell the user is currently editing. The reducer's
          applyWrap propagates the fit to sibling Cells so the 4.8.8
          invariant — every Cell's Boundary edge = lattice edge — holds. */}
      <div style={{ marginTop: 14 }}>
        <label style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          cursor: 'pointer',
          fontFamily: "'EB Garamond', Georgia, serif",
          fontSize: 13,
          color: cell.wrapBoundary ? 'var(--text)' : 'var(--text-muted)',
          transition: 'color 0.15s',
        }}>
          <input
            type="checkbox"
            checked={!!cell.wrapBoundary}
            onChange={e => dispatch({ type: 'SET_EDITOR_WRAP_BOUNDARY', payload: e.target.checked })}
          />
          Wrap boundary
        </label>
      </div>

      {/* Step 17.12 — No Seed Tile. Per-Cell: applies to whichever Cell is
          currently active in Design Phase (single-cell Patch or one Cell of a
          multi-cell Configuration). When on, the active Cell starts empty
          (no auto-placed Seed) — useful when authoring from the boundary
          inward via the always-on section picker. Locked while the Cell
          holds any non-Seed Tile (mirrors the existing Seed-sides slider
          lock); the reducer silently refuses out-of-lock toggles. */}
      <div style={{ marginTop: 10 }}>
        <label style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          cursor: originLocked ? 'not-allowed' : 'pointer',
          fontFamily: "'EB Garamond', Georgia, serif",
          fontSize: 13,
          color: cell.noSeed ? 'var(--text)' : 'var(--text-muted)',
          opacity: originLocked ? 0.5 : 1,
          transition: 'color 0.15s, opacity 0.15s',
        }}>
          <input
            type="checkbox"
            checked={!!cell.noSeed}
            disabled={originLocked}
            onChange={e => dispatch({ type: 'SET_CELL_NO_SEED', payload: e.target.checked })}
          />
          No Seed Tile
        </label>
        {originLocked && (
          <div style={{
            fontFamily: "'Cinzel', Georgia, serif",
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
            marginTop: 2,
            marginBottom: 4,
            lineHeight: 1.4,
          }}>
            Locked — clear the {multiCell ? 'cell' : 'patch'} to toggle the Seed Tile.
          </div>
        )}
      </div>

      {/* Step 17.6d — Show neighbours. Disabled while wrap is on (boundary
          edge moves under the user's feet). Triangle support added — the
          three edge-shared down-triangles are computed directly from the
          boundary vertices. */}
      {(() => {
        const wrapOn = !!cell.wrapBoundary
        const disabled = wrapOn
        const active = showNeighbours && !disabled
        return (
          <div style={{ marginTop: 10 }}>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              cursor: disabled ? 'not-allowed' : 'pointer',
              fontFamily: "'EB Garamond', Georgia, serif",
              fontSize: 13,
              color: active ? 'var(--text)' : 'var(--text-muted)',
              opacity: disabled ? 0.5 : 1,
              transition: 'color 0.15s, opacity 0.15s',
            }}>
              <input
                type="checkbox"
                checked={active}
                disabled={disabled}
                onChange={e => onToggleShowNeighbours(e.target.checked)}
              />
              Show neighbours
            </label>
            {disabled && (
              <div style={{
                fontFamily: "'Cinzel', Georgia, serif",
                fontSize: 9,
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
                marginTop: 2,
                marginBottom: 4,
                lineHeight: 1.4,
              }}>
                Disable Wrap boundary to preview neighbours.
              </div>
            )}
            {active && (
              <div style={{ marginTop: 6, marginLeft: 22, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  cursor: 'pointer',
                  fontFamily: "'EB Garamond', Georgia, serif",
                  fontSize: 12.5,
                  color: showNeighbourBoundaries ? 'var(--text)' : 'var(--text-muted)',
                  transition: 'color 0.15s',
                }}>
                  <input
                    type="checkbox"
                    checked={showNeighbourBoundaries}
                    onChange={e => onToggleShowNeighbourBoundaries(e.target.checked)}
                  />
                  Show boundaries
                </label>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  cursor: 'pointer',
                  fontFamily: "'EB Garamond', Georgia, serif",
                  fontSize: 12.5,
                  color: showNeighbourStrands ? 'var(--text)' : 'var(--text-muted)',
                  transition: 'color 0.15s',
                }}>
                  <input
                    type="checkbox"
                    checked={showNeighbourStrands}
                    onChange={e => onToggleShowNeighbourStrands(e.target.checked)}
                  />
                  Show strands
                </label>
              </div>
            )}
          </div>
        )
      })()}

      {/* Step 17.5 — Tool toggle: Place edge Tiles vs. Complete gap Tiles. */}
      <div style={{ marginTop: 14 }}>
        <FieldLabel
          label="Tool"
          tooltip="Design-Phase tool. Place adds a single Tile on a clicked edge. Complete fills the gaps around your placed Tiles with regular polygons (or irregular fallbacks)."
        />
        <div style={{ display: 'flex', gap: 0 }}>
          {(['place', 'complete'] as const).map(m => {
            const active = editorMode === m
            const tooltip = m === 'place'
              ? 'Click a Cell edge to place a single Tile on that side.'
              : 'Fill the gaps around your placed Tiles with regular polygons (or irregular fallbacks). Fills with Tiles, not colour — colour-fill arrives later under the Decoration Phase.'
            return (
              <button
                key={m}
                onClick={() => onSetEditorMode(m)}
                title={tooltip}
                style={segmentedButtonStyle(active, { letterSpacing: '0.10em' })}
              >
                {m === 'place' ? 'Place' : 'Complete'}
              </button>
            )
          })}
        </div>
        {editorMode === 'complete' && (
          <>
            {/* Step 17.7 — Auto-complete on flip (Decision 11). Lives in
                Complete mode since it's a Complete-style operation that
                fires automatically on Design→Strand flip. */}
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginTop: 10,
              cursor: 'pointer',
              fontFamily: "'EB Garamond', Georgia, serif",
              fontSize: 13,
              color: editor.autoComplete?.enabled ? 'var(--text)' : 'var(--text-muted)',
              transition: 'color 0.15s',
            }}>
              <input
                type="checkbox"
                checked={!!editor.autoComplete?.enabled}
                onChange={e => dispatch({ type: 'SET_EDITOR_AUTO_COMPLETE_ENABLED', payload: e.target.checked })}
              />
              Auto-complete on phase-switch to Composition
            </label>
            <div style={{
              marginTop: 8,
              fontFamily: "'EB Garamond', Georgia, serif",
              fontSize: 12,
              color: 'var(--text-muted)',
              lineHeight: 1.4,
            }}>
              {multiMode
                ? `${picks.length} ${picks.length === 1 ? 'vertex' : 'vertices'} selected. Press Enter to commit, Esc to cancel.`
                : picks.length > 0
                  ? 'Pick a second outer vertex to fill the gap between them. Esc to cancel.'
                  : 'Pick two outer vertices to fill the gap, or hold Ctrl/Cmd and click N for a multi-vertex fill.'}
              {picks.length > 0 && (
                <button
                  onClick={onCancelComplete}
                  style={{
                    marginLeft: 6,
                    padding: '1px 6px',
                    fontFamily: "'Cinzel', Georgia, serif",
                    fontSize: 9,
                    fontWeight: 600,
                    letterSpacing: '0.10em',
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                    border: '1px solid var(--border-subtle)',
                    background: 'transparent',
                    color: 'var(--text-muted)',
                  }}
                >
                  Cancel
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
        <button
          onClick={onClear}
          style={{
            flex: '1 1 0',
            minWidth: 0,
            padding: '5px 0',
            fontFamily: "'Cinzel', Georgia, serif",
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            border: '1px solid var(--border-subtle)',
            background: 'transparent',
            color: 'var(--text-muted)',
            transition: 'all 0.15s',
          }}
        >
          Clear
        </button>
      </div>
    </>
  )
}
