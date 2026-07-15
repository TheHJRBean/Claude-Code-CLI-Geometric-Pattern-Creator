import { useState } from 'react'
import type { PatternConfig } from '../../types/pattern'
import type { Action } from '../../state/actions'
import type { BoundaryShape, ConfigurationId, EditorCell, SymmetryMode } from '../../types/editor'
import type { EditorMode } from '../../types/appMode'
import type { Vec2 } from '../../utils/math'
import { BOUNDARY_SIZE_MAX_BY_SHAPE } from '../../editor/createDefault'
import { ANGLE_STEP_PRESETS } from '../../editor/guides'
import { FieldLabel, SectionTitle, segmentedButtonStyle } from './labShared'

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
  { value: { kind: 'configuration', id: '3.3.3.4.4' }, label: '3.3.3.4.4' },
  { value: { kind: 'configuration', id: '3.3.4.3.4' }, label: '3.3.4.3.4' },
  { value: { kind: 'configuration', id: '3.3.3.3.6' }, label: '3.3.3.3.6' },
]

// Repeated "small uppercase hint" style used by the lock / wrap notes.
const mutedNoteStyle: React.CSSProperties = {
  fontFamily: "'Cinzel', Georgia, serif",
  fontSize: 9,
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  marginTop: 2,
  marginBottom: 4,
  lineHeight: 1.4,
}

const checkboxLabelStyle = (on: boolean, extra?: React.CSSProperties): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  cursor: 'pointer',
  fontFamily: "'EB Garamond', Georgia, serif",
  fontSize: 13,
  color: on ? 'var(--text)' : 'var(--text-muted)',
  transition: 'color 0.15s',
  ...extra,
})

/**
 * Per-Cell Design controls — Boundary size (single-cell only), Seed sides,
 * Symmetry, Wrap boundary, No Seed. Each mutation carries the Cell's `id` so
 * the reducer targets this Cell directly. In a multi-cell Patch the panel
 * stacks one of these groups per Cell (there is no active-Cell selector); in a
 * single-cell Patch there's just one, unheaded.
 */
function CellControls({
  cell,
  dispatch,
  multiCell,
}: {
  cell: EditorCell
  dispatch: React.Dispatch<Action>
  multiCell: boolean
}) {
  const cellId = cell.id
  // Once the Cell holds any non-Seed Tile, changing Seed sides / toggling
  // No Seed would wipe that work — lock both until the Cell is cleared.
  const originLocked = cell.tiles.some(t => t.source !== 'seed')
  return (
    <>
      {/* Boundary size is per-Cell only in a single-cell Patch; multi-cell
          uses the shared patch-level Lattice edge slider instead. */}
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
          {cell.wrapBoundary && <div style={mutedNoteStyle}>Driven by Wrap boundary — drag to override.</div>}
        </>
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
        onChange={e => dispatch({ type: 'SET_CELL_SEED_SIDES', payload: { sides: Number(e.target.value), cellId } })}
        style={originLocked ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
      />
      {originLocked && (
        <div style={mutedNoteStyle}>Locked — clear the {multiCell ? 'cell' : 'patch'} to change the origin shape.</div>
      )}

      {/* Step 17.4 (re-enabled) — Symmetry picker. The chosen subgroup of the
          boundary's dihedral group governs how placements + deletes propagate.
          Horizontal mirror is hidden for triangle (no horizontal mirror axis
          exists on an equilateral triangle). */}
      <FieldLabel label="Symmetry" />
      <select
        className="pattern-select"
        value={cell.symmetryMode ?? 'none'}
        onChange={e => dispatch({ type: 'SET_EDITOR_SYMMETRY_MODE', payload: { mode: e.target.value as SymmetryMode, cellId } })}
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
        <div style={mutedNoteStyle}>Placements + deletes propagate under this subgroup.</div>
      )}

      {/* Wrap boundary — Design-Phase Boundary fitting (live). Per-Cell: wraps
          the lattice cell to this Cell's Tiles. In a multi-cell Patch the
          reducer's applyWrap propagates the fit to sibling Cells so the
          invariant — every Cell's Boundary edge = lattice edge — holds. */}
      <div style={{ marginTop: 14 }}>
        <label style={checkboxLabelStyle(!!cell.wrapBoundary, { cursor: 'pointer' })}>
          <input
            type="checkbox"
            checked={!!cell.wrapBoundary}
            onChange={e => dispatch({ type: 'SET_EDITOR_WRAP_BOUNDARY', payload: { value: e.target.checked, cellId } })}
          />
          Wrap boundary
        </label>
      </div>

      {/* Step 17.12 — No Seed Tile. Per-Cell: when on, the Cell starts empty
          (no auto-placed Seed) — useful when authoring from the boundary inward
          via the always-on section picker. Always toggleable (user decision
          2026-07-08): unlike the Seed-sides slider, removing the Seed is never
          locked — toggling on wipes any placed/completed Tiles, toggling off
          restores the Seed. The change is undoable. */}
      <div style={{ marginTop: 10 }}>
        <label style={checkboxLabelStyle(!!cell.noSeed, { cursor: 'pointer' })}>
          <input
            type="checkbox"
            checked={!!cell.noSeed}
            onChange={e => dispatch({ type: 'SET_CELL_NO_SEED', payload: { value: e.target.checked, cellId } })}
          />
          No Seed Tile
        </label>
        {originLocked && (
          <div style={mutedNoteStyle}>Toggling on will clear this {multiCell ? 'cell' : 'patch'}'s placed Tiles.</div>
        )}
      </div>
    </>
  )
}

interface DesignPanelProps {
  editor: NonNullable<PatternConfig['editor']>
  dispatch: React.Dispatch<Action>
  editorMode: EditorMode
  onSetEditorMode: (m: EditorMode) => void
  /** Construct toolbar (spec Decision 11) — angle-snap step + snap toggle. */
  constructAngleStep: number
  onSetConstructAngleStep: (deg: number) => void
  constructSnap: boolean
  onSetConstructSnap: (on: boolean) => void
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
 * Design-Phase controls in the Builder sidebar: boundary/Configuration picker
 * and alternate orientation (patch-level), then a per-Cell control group for
 * every Cell (Symmetry, Seed sides, Wrap, No Seed — all Cells exposed at once,
 * no active-Cell selector), then neighbour preview + the Place/Complete tool
 * toggle (patch-level). Extracted from `EditorDesignControls`.
 */
export function DesignPanel({
  editor,
  dispatch,
  editorMode,
  onSetEditorMode,
  constructAngleStep,
  onSetConstructAngleStep,
  constructSnap,
  onSetConstructSnap,
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
  const multiCell = editor.cells.length > 1
  const primaryCell = editor.cells[0]
  const anyWrap = editor.cells.some(c => c.wrapBoundary)
  // Per-Cell collapse state (multi-cell only) — keeps the panel manageable when
  // a Configuration has several Cells. Default open; collapsing is opt-in.
  const [collapsedCells, setCollapsedCells] = useState<Record<string, boolean>>({})
  const toggleCell = (id: string) => setCollapsedCells(prev => ({ ...prev, [id]: !prev[id] }))
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
            : `shape:${primaryCell.shape}`
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

      <label style={checkboxLabelStyle(multiCell ? !!editor.alternateOrientation : !!primaryCell.alternateBoundary, { marginTop: 10 })}>
        <input
          type="checkbox"
          checked={multiCell ? !!editor.alternateOrientation : !!primaryCell.alternateBoundary}
          onChange={e => dispatch({ type: 'SET_EDITOR_ALTERNATE_BOUNDARY', payload: e.target.checked })}
        />
        Alternate orientation
      </label>

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
            max={800}
            step={1}
            value={editor.edgeLength}
            onChange={e => dispatch({ type: 'SET_CELL_BOUNDARY_SIZE', payload: Number(e.target.value) })}
          />
          {anyWrap && <div style={mutedNoteStyle}>Driven by Wrap boundary — drag to override.</div>}
        </>
      )}

      {/* Per-Cell controls. Single-cell: one unheaded group. Multi-cell: a
          headed group per Cell — all Cells editable at once, no selector. */}
      {multiCell ? (
        editor.cells.map(cell => {
          const open = !collapsedCells[cell.id]
          return (
            <div
              key={cell.id}
              style={{
                marginTop: 14,
                paddingTop: 4,
                borderTop: '1px solid var(--border-subtle)',
              }}
            >
              <SectionTitle open={open} onToggle={() => toggleCell(cell.id)}>
                {cell.id.charAt(0).toUpperCase() + cell.id.slice(1)} Cell
              </SectionTitle>
              {open && <CellControls cell={cell} dispatch={dispatch} multiCell />}
            </div>
          )
        })
      ) : (
        <CellControls cell={primaryCell} dispatch={dispatch} multiCell={false} />
      )}

      {/* Step 17.6d — Show neighbours. Disabled while any Cell has wrap on
          (boundary edge moves under the user's feet). */}
      {(() => {
        const disabled = anyWrap
        const active = showNeighbours && !disabled
        return (
          <div style={{ marginTop: 14 }}>
            <label style={checkboxLabelStyle(active, {
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.5 : 1,
              transition: 'color 0.15s, opacity 0.15s',
            })}>
              <input
                type="checkbox"
                checked={active}
                disabled={disabled}
                onChange={e => onToggleShowNeighbours(e.target.checked)}
              />
              Show neighbours
            </label>
            {disabled && (
              <div style={mutedNoteStyle}>Disable Wrap boundary to preview neighbours.</div>
            )}
            {active && (
              <div style={{ marginTop: 6, marginLeft: 22, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={checkboxLabelStyle(showNeighbourBoundaries, { fontSize: 12.5 })}>
                  <input
                    type="checkbox"
                    checked={showNeighbourBoundaries}
                    onChange={e => onToggleShowNeighbourBoundaries(e.target.checked)}
                  />
                  Show boundaries
                </label>
                <label style={checkboxLabelStyle(showNeighbourStrands, { fontSize: 12.5 })}>
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

      {/* Step 17.5 / Guides — Tool toggle: Place / Complete / Construct. */}
      <div style={{ marginTop: 14 }}>
        <FieldLabel
          label="Tool"
          tooltip="Design-Phase tool. Place adds a single Tile on a clicked edge. Complete fills the gaps around your placed Tiles. Construct draws Guides — compass-and-straightedge scaffolding whose Anchors will feed Place and Complete."
        />
        <div style={{ display: 'flex', gap: 0 }}>
          {(['place', 'complete', 'construct'] as const).map(m => {
            const active = editorMode === m
            const tooltip = m === 'place'
              ? 'Click a Cell edge to place a single Tile on that side.'
              : m === 'complete'
                ? 'Fill the gaps around your placed Tiles with regular polygons (or irregular fallbacks). Fills with Tiles, not colour — colour-fill arrives later under the Decoration Phase.'
                : 'Draw Guide lines — two clicks per line, snapping to Tile vertices, edge midpoints, Boundary corners, and existing Guide anchors. Click a Guide to edit or delete it.'
            const label = m === 'place' ? 'Place' : m === 'complete' ? 'Complete' : 'Construct'
            return (
              <button
                key={m}
                onClick={() => onSetEditorMode(m)}
                title={tooltip}
                style={segmentedButtonStyle(active, { letterSpacing: '0.10em' })}
              >
                {label}
              </button>
            )
          })}
        </div>
        {editorMode === 'construct' && (
          <>
            {/* Construct toolbar (spec Decision 11) — appears only in-mode.
                The Guide-line tool is the sole (implicitly armed) tool in
                slice 1; circles join in slice 2. */}
            <FieldLabel
              label="Angle step"
              tooltip="Angle-snap step while drawing: lines snap to multiples of this from the horizontal — and from the edge the line starts on, so continuations and perpendiculars come free. 36° / 72° serve five-fold and Girih layouts. Hold Shift to draw freehand."
            />
            <select
              className="pattern-select"
              value={String(constructAngleStep)}
              onChange={e => onSetConstructAngleStep(Number(e.target.value))}
            >
              {ANGLE_STEP_PRESETS.map(deg => (
                <option key={deg} value={String(deg)}>{deg}°</option>
              ))}
            </select>
            <label style={checkboxLabelStyle(constructSnap, { marginTop: 8 })}>
              <input
                type="checkbox"
                checked={constructSnap}
                onChange={e => onSetConstructSnap(e.target.checked)}
              />
              Snap while drawing
            </label>
            <div style={{
              marginTop: 8,
              fontFamily: "'EB Garamond', Georgia, serif",
              fontSize: 12,
              color: 'var(--text-muted)',
              lineHeight: 1.4,
            }}>
              Click twice to draw a Guide line. Hold Shift for freehand,
              Esc to cancel. Click a Guide to edit it — stamp, extend,
              ticks, angle, delete.
            </div>
          </>
        )}
        {editorMode === 'complete' && (
          <>
            {/* Step 17.7 — Auto-complete on flip (Decision 11). Lives in
                Complete mode since it's a Complete-style operation that
                fires automatically on Design→Strand flip. */}
            <label style={checkboxLabelStyle(!!editor.autoComplete?.enabled, { marginTop: 10 })}>
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
