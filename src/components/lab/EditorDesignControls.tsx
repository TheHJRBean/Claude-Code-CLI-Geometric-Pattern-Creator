import type { PatternConfig } from '../../types/pattern'
import type { Action } from '../../state/actions'
import type { EditorMode } from '../../types/appMode'
import type { GuideTool, WorldBounds } from '../../editor/guides'
import type { PaintTarget, StrandPaintScope, VoidPaintScope } from '../../rendering/DecorationPaintLayer'
import type { PaintVoid } from '../../decoration/resolve'
import type { GradientDraft, GradientSelection } from '../../decoration/gradients'
import type { Vec2 } from '../../utils/math'
import { FieldLabel, HistoryButtonRow, segmentedButtonStyle } from './labShared'
import { hasDecoration } from '../../decoration/store'
import { CompositionPanel } from './CompositionPanel'
import { DecorationPanel } from './DecorationPanel'
import { patchSeedBBox } from './decorationSeedBox'
import { FramePanel } from './FramePanel'
import { nRingFrameSupported } from '../../editor/frameNRing'
import { MorphPanel } from './MorphPanel'
import { DesignPanel } from './DesignPanel'

export interface EditorDesignControlsProps {
  /** Whole config — most panels only need `editor`, but Morph (Composition
   *  Phase onward) also needs `config.figures` + `config.morph`. */
  config: PatternConfig
  editor: NonNullable<PatternConfig['editor']>
  dispatch: React.Dispatch<Action>
  /** Canvas's live visible world-rect — MorphPanel's view-aware defaults. */
  viewBoundsRef?: React.RefObject<WorldBounds | null>
  /** Morph overlay visibility (Lab state) — MorphPanel's "Show on canvas". */
  showMorphBoundaries?: boolean
  onSetShowMorphBoundaries?: (v: boolean) => void
  onClear: () => void
  editorMode: EditorMode
  onSetEditorMode: (m: EditorMode) => void
  constructAngleStep: number
  onSetConstructAngleStep: (deg: number) => void
  constructTool: GuideTool
  onSetConstructTool: (t: GuideTool) => void
  constructSnap: boolean
  onSetConstructSnap: (on: boolean) => void
  showGuides: boolean
  onToggleShowGuides: (next: boolean) => void
  /** Guides overlay toggles (#30) — Design-Phase Guide strokes, the Anchor
   *  dots (both Phases), and the neighbours variant (stamped Lattice copies). */
  showDesignGuides: boolean
  onToggleShowDesignGuides: (next: boolean) => void
  showGuideAnchors: boolean
  onToggleShowGuideAnchors: (next: boolean) => void
  showNeighbourGuides: boolean
  onToggleShowNeighbourGuides: (next: boolean) => void
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
  gradientMode: 'shape' | 'frame' | 'strands'
  onSetGradientMode: (m: 'shape' | 'frame' | 'strands') => void
  /** Decoration Stamp target — the Void shape selected on the canvas. */
  stampSelection: PaintVoid | null
  /** Decoration Stamp target — latest canvas Void hit-targets (Export all). */
  getStampVoids: () => PaintVoid[]
  /** Decoration Gradient target (#44) — working draft + last-painted group. */
  gradientDraft: GradientDraft
  onSetGradientDraft: (d: GradientDraft) => void
  gradientSelection: GradientSelection | null
  onClearGradientSelection: () => void
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
    config,
    editor,
    dispatch,
    viewBoundsRef,
    showMorphBoundaries,
    onSetShowMorphBoundaries,
    onClear,
    editorMode,
    onSetEditorMode,
    constructAngleStep,
    onSetConstructAngleStep,
    constructTool,
    onSetConstructTool,
    constructSnap,
    onSetConstructSnap,
    showGuides,
    onToggleShowGuides,
    showDesignGuides,
    onToggleShowDesignGuides,
    showGuideAnchors,
    onToggleShowGuideAnchors,
    showNeighbourGuides,
    onToggleShowNeighbourGuides,
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
    gradientMode,
    onSetGradientMode,
    stampSelection,
    getStampVoids,
    gradientDraft,
    onSetGradientDraft,
    gradientSelection,
    onClearGradientSelection,
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
  const painted = hasDecoration(config)
  return (
    <>
      {/* Step 17.9 — Undo / Redo header (Q12). Visible in every phase: history
          is preserved across phase-switches, and since 2026-08-04 Decoration
          paint actions push to it too.

          Clear sits here rather than at the head of DesignPanel (moved
          2026-07-29): DesignPanel renders directly under FramePanel, so a
          Clear button at its top read as "clear the Frame" when it actually
          wipes the whole Patch. Grouped with Undo/Redo it reads as the
          patch-level history/reset action it is.

          In Decoration the third slot is a *different* reset — "Clear paint",
          which drops the decoration block and leaves the Patch alone. Never
          the bare "Clear": one word covering both scopes in one row position
          is exactly how a user wipes a Patch meaning to wipe its colours. */}
      <HistoryButtonRow
        buttons={[
          { label: '↶ Undo', onClick: onUndo, disabled: !canUndo },
          { label: '↷ Redo', onClick: onRedo, disabled: !canRedo },
          ...(editorPhase === 'design'
            ? [{
              label: 'Clear',
              onClick: onClear,
              title: 'Discard the whole Patch and start a new one',
            }]
            : []),
          ...(inDecoration
            ? [{
              label: 'Clear paint',
              onClick: () => {
                if (window.confirm('Remove all decoration — Void fills, Strand colours, Stamps and gradients? The Patch itself is untouched, and Undo will bring the paint back.')) {
                  dispatch({ type: 'CLEAR_DECORATION' })
                }
              },
              disabled: !painted,
              title: painted
                ? 'Remove every fill, Strand colour, Stamp and gradient'
                : 'Nothing painted yet',
            }]
            : []),
        ]}
      />

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
          showGuides={showGuides}
          onToggleShowGuides={onToggleShowGuides}
          showGuideAnchors={showGuideAnchors}
          onToggleShowGuideAnchors={onToggleShowGuideAnchors}
        />
      )}

      {inDecoration && (
        <DecorationPanel
          substrate="patch"
          decoration={editor.decoration}
          frame={editor.frame}
          onSetFrame={f => dispatch({ type: 'SET_FRAME', payload: f })}
          seedBBox={() => patchSeedBBox(editor)}
          dispatch={dispatch}
          decorationColor={decorationColor}
          onSetDecorationColor={onSetDecorationColor}
          background={config.strand.background}
          paintTarget={paintTarget}
          onSetPaintTarget={onSetPaintTarget}
          voidScope={voidScope}
          onSetVoidScope={onSetVoidScope}
          strandScope={strandScope}
          onSetStrandScope={onSetStrandScope}
          gradientMode={gradientMode}
          onSetGradientMode={onSetGradientMode}
          stampSelection={stampSelection}
          getStampVoids={getStampVoids}
          gradientDraft={gradientDraft}
          onSetGradientDraft={onSetGradientDraft}
          gradientSelection={gradientSelection}
          onClearGradientSelection={onClearGradientSelection}
        />
      )}

      <FramePanel
        substrate="patch"
        frame={editor.frame}
        onSetFrame={f => dispatch({ type: 'SET_FRAME', payload: f })}
        // n-ring Frames support every multi-cell Configuration (the whole Patch
        // tiles by translation), and single-cell square / hexagon / triangle.
        // Only a single-cell octagon / dodecagon Patch has no lattice.
        nRingSupported={nRingFrameSupported(editor)}
      />

      {/* Morph (Step 20 slice 2, #38) — authored in Composition only; frozen
          in Decoration like Strand geometry (user decision 2026-07-18). The
          morphed field itself still renders there. */}
      {inStrand && (
        <MorphPanel
          config={config}
          dispatch={dispatch}
          viewBoundsRef={viewBoundsRef}
          showBoundaries={showMorphBoundaries}
          onSetShowBoundaries={onSetShowMorphBoundaries}
        />
      )}

      {editorPhase === 'design' && (
        <DesignPanel
          editor={editor}
          dispatch={dispatch}
          editorMode={editorMode}
          onSetEditorMode={onSetEditorMode}
          constructAngleStep={constructAngleStep}
          onSetConstructAngleStep={onSetConstructAngleStep}
          constructTool={constructTool}
          onSetConstructTool={onSetConstructTool}
          constructSnap={constructSnap}
          onSetConstructSnap={onSetConstructSnap}
          picks={picks}
          multiMode={multiMode}
          onCancelComplete={onCancelComplete}
          showNeighbours={showNeighbours}
          onToggleShowNeighbours={onToggleShowNeighbours}
          showNeighbourBoundaries={showNeighbourBoundaries}
          onToggleShowNeighbourBoundaries={onToggleShowNeighbourBoundaries}
          showNeighbourStrands={showNeighbourStrands}
          onToggleShowNeighbourStrands={onToggleShowNeighbourStrands}
          showGuides={showDesignGuides}
          onToggleShowGuides={onToggleShowDesignGuides}
          showGuideAnchors={showGuideAnchors}
          onToggleShowGuideAnchors={onToggleShowGuideAnchors}
          showNeighbourGuides={showNeighbourGuides}
          onToggleShowNeighbourGuides={onToggleShowNeighbourGuides}
        />
      )}
    </>
  )
}
