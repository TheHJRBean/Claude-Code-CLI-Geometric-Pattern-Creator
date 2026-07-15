import type { PatternConfig } from '../../types/pattern'
import type { Action } from '../../state/actions'
import type { PaintTarget, StrandPaintScope, VoidPaintScope } from '../../rendering/DecorationPaintLayer'
import type { PaintVoid } from '../../decoration/resolve'
import type { Vec2 } from '../../utils/math'
import { FieldLabel, segmentedButtonStyle } from './labShared'
import { CompositionPanel } from './CompositionPanel'
import { DecorationPanel } from './DecorationPanel'
import { FramePanel } from './FramePanel'
import { DesignPanel } from './DesignPanel'

export interface EditorDesignControlsProps {
  editor: NonNullable<PatternConfig['editor']>
  dispatch: React.Dispatch<Action>
  onClear: () => void
  editorMode: 'place' | 'complete'
  onSetEditorMode: (m: 'place' | 'complete') => void
  picks: Vec2[]
  multiMode: boolean
  onCancelComplete: () => void
  editorPhase: 'design' | 'strand' | 'decoration'
  onSetEditorPhase: (p: 'design' | 'strand' | 'decoration') => void
  decorationColor: string
  onSetDecorationColor: (c: string) => void
  paintTarget: PaintTarget
  onSetPaintTarget: (t: PaintTarget) => void
  voidScope: VoidPaintScope
  onSetVoidScope: (s: VoidPaintScope) => void
  strandScope: StrandPaintScope
  onSetStrandScope: (s: StrandPaintScope) => void
  /** Decoration Stamp target — the Void shape selected on the canvas. */
  stampSelection: PaintVoid | null
  /** Decoration Stamp target — latest canvas Void hit-targets (Export all). */
  getStampVoids: () => PaintVoid[]
  showBoundaryLattice: boolean
  onToggleShowBoundaryLattice: (next: boolean) => void
  showNeighbours: boolean
  onToggleShowNeighbours: (next: boolean) => void
  showNeighbourBoundaries: boolean
  onToggleShowNeighbourBoundaries: (next: boolean) => void
  showNeighbourStrands: boolean
  onToggleShowNeighbourStrands: (next: boolean) => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
}

/**
 * Builder Design-controls orchestrator (Step 17.2). Owns the undo/redo header
 * and the Design → Composition → Decoration phase switch, and composes the
 * per-phase panels (Composition / Decoration / Frame / Design). The heavy
 * per-panel JSX lives in sibling files under `lab/`.
 */
export function EditorDesignControls(props: EditorDesignControlsProps) {
  const {
    editor,
    dispatch,
    onClear,
    editorMode,
    onSetEditorMode,
    picks,
    multiMode,
    onCancelComplete,
    editorPhase,
    onSetEditorPhase,
    decorationColor,
    onSetDecorationColor,
    paintTarget,
    onSetPaintTarget,
    voidScope,
    onSetVoidScope,
    strandScope,
    onSetStrandScope,
    stampSelection,
    getStampVoids,
    showBoundaryLattice,
    onToggleShowBoundaryLattice,
    showNeighbours,
    onToggleShowNeighbours,
    showNeighbourBoundaries,
    onToggleShowNeighbourBoundaries,
    showNeighbourStrands,
    onToggleShowNeighbourStrands,
    onUndo,
    onRedo,
    canUndo,
    canRedo,
  } = props
  const inStrand = editorPhase === 'strand'
  const inDecoration = editorPhase === 'decoration'
  return (
    <>
      {/* Step 17.9 — Undo / Redo header (Q12). Visible in both phases:
          history is preserved across Design ↔ Strand flips, but only design-
          mode actions ever push to it. */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {([
          { label: '↶ Undo', onClick: onUndo, disabled: !canUndo },
          { label: '↷ Redo', onClick: onRedo, disabled: !canRedo },
        ] as const).map(b => (
          <button
            key={b.label}
            onClick={b.onClick}
            disabled={b.disabled}
            style={{
              flex: 1,
              padding: '5px 0',
              fontFamily: "'Cinzel', Georgia, serif",
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: '0.10em',
              textTransform: 'uppercase',
              cursor: b.disabled ? 'not-allowed' : 'pointer',
              border: '1px solid var(--border-subtle)',
              background: 'transparent',
              color: 'var(--text-muted)',
              opacity: b.disabled ? 0.4 : 1,
              transition: 'all 0.15s',
            }}
          >
            {b.label}
          </button>
        ))}
      </div>

      {/* Step 17.6 — Design / Composition phase-switch (Decision 15). */}
      <FieldLabel
        label="Phase"
        tooltip="Build workflow stage. Design = author Tiles into Cells of a Patch. Composition = see the Patch composed across the canvas with Strands rendered by PIC. Decoration = colour the Strands and Fill the Voids (strand geometry is frozen here — change it in Composition). The Frame is a persistent overlay across all phases (see below)."
      />
      <div style={{ display: 'flex', gap: 0, marginBottom: inStrand ? 4 : 12 }}>
        {(['design', 'strand', 'decoration'] as const).map(p => {
          const active = editorPhase === p
          const label = p === 'design' ? 'Design' : p === 'strand' ? 'Composition' : 'Decoration'
          return (
            <button
              key={p}
              onClick={() => onSetEditorPhase(p)}
              style={segmentedButtonStyle(active)}
            >
              {label}
            </button>
          )
        })}
      </div>

      {inStrand && (
        <CompositionPanel
          editor={editor}
          showBoundaryLattice={showBoundaryLattice}
          onToggleShowBoundaryLattice={onToggleShowBoundaryLattice}
        />
      )}

      {inDecoration && (
        <DecorationPanel
          editor={editor}
          dispatch={dispatch}
          decorationColor={decorationColor}
          onSetDecorationColor={onSetDecorationColor}
          paintTarget={paintTarget}
          onSetPaintTarget={onSetPaintTarget}
          voidScope={voidScope}
          onSetVoidScope={onSetVoidScope}
          strandScope={strandScope}
          onSetStrandScope={onSetStrandScope}
          stampSelection={stampSelection}
          getStampVoids={getStampVoids}
        />
      )}

      <FramePanel editor={editor} dispatch={dispatch} />

      {editorPhase === 'design' && (
        <DesignPanel
          editor={editor}
          dispatch={dispatch}
          editorMode={editorMode}
          onSetEditorMode={onSetEditorMode}
          picks={picks}
          multiMode={multiMode}
          onCancelComplete={onCancelComplete}
          onClear={onClear}
          showNeighbours={showNeighbours}
          onToggleShowNeighbours={onToggleShowNeighbours}
          showNeighbourBoundaries={showNeighbourBoundaries}
          onToggleShowNeighbourBoundaries={onToggleShowNeighbourBoundaries}
          showNeighbourStrands={showNeighbourStrands}
          onToggleShowNeighbourStrands={onToggleShowNeighbourStrands}
        />
      )}
    </>
  )
}
