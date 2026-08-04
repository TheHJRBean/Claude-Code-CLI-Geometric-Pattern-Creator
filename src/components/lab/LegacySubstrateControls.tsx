import type { PatternConfig } from '../../types/pattern'
import type { Action } from '../../state/actions'
import type { PaintTarget, StrandPaintScope, VoidPaintScope } from '../../rendering/DecorationPaintLayer'
import type { PaintVoid } from '../../decoration/resolve'
import type { GradientDraft, GradientSelection, WorldBBox } from '../../decoration/gradients'
import { pointsBBox } from '../../decoration/gradients'
import type { WorldBounds } from '../../editor/guides'
import { frameOutlinePolygon } from '../../editor/frame'
import { hasDecoration, patternDecoration } from '../../decoration/store'
import { FieldLabel, HistoryButtonRow, segmentedButtonStyle } from './labShared'
import { DecorationPanel } from './DecorationPanel'
import { FramePanel } from './FramePanel'

/**
 * Lab controls for a **legacy substrate** — a pattern with no Builder Patch (a
 * Gallery preset, a Generator sample, any BFS / Taprats tiling opened via
 * "Edit in Lab" or My Tessellations).
 *
 * Two of the Builder's three Phases apply. There is no Design Phase because
 * there is nothing to author: the tiling comes from its `TilingDefinition`, not
 * from Tiles the user placed. Composition (tune the Figure recipes in the
 * Strands section) and Decoration (paint the field) both work, because the
 * decoration core takes segments and world points and never asks what produced
 * them.
 *
 * The Builder's own controls live in `EditorDesignControls`; this is
 * deliberately not that component with everything switched off.
 */

/**
 * The world bbox a seeded gradient spans on this substrate. A legacy pattern
 * is an infinite field, so unlike a Patch it has no content extent to measure
 * — the Gallery Frame's outline when one is clipping it, else whatever the
 * user can currently see. Null before the Canvas has reported its bounds.
 */
export function legacySeedBBox(
  frame: PatternConfig['frame'],
  viewBounds: WorldBounds | null,
): WorldBBox | null {
  if (frame?.type === 'shape') {
    const outline = frameOutlinePolygon(frame)
    const b = outline ? pointsBBox(outline) : null
    if (b) return b
  }
  return viewBounds
}

interface Props {
  config: PatternConfig
  dispatch: React.Dispatch<Action>
  /** Human label of the loaded tiling, for the explanatory note. */
  tilingLabel: string
  /** Live visible world rect, mirrored down from the Canvas. A ref, not a
   *  value: it updates on every pan/zoom without re-rendering, and the
   *  gradient seed reads it at click time. */
  viewBoundsRef: React.RefObject<WorldBounds | null>
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
  stampSelection: PaintVoid | null
  getStampVoids: () => PaintVoid[]
  gradientDraft: GradientDraft
  onSetGradientDraft: (d: GradientDraft) => void
  gradientSelection: GradientSelection | null
  onClearGradientSelection: () => void
  /** Combine target — the Voids picked on the canvas, and a reset. */
  combineSelection: PaintVoid[]
  onClearCombineSelection: () => void
  /** Undo/redo of the Decoration Phase's paint actions — the only mutations
   *  this substrate puts on the history stack (there is no Design Phase here
   *  and Composition has never been undoable). Shown in Decoration only, since
   *  in Composition the pair would always be inert. */
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
}

export function LegacySubstrateControls({
  config,
  dispatch,
  tilingLabel,
  viewBoundsRef,
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
  combineSelection,
  onClearCombineSelection,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: Props) {
  const inDecoration = editorPhase === 'decoration'
  const painted = hasDecoration(config)
  return (
    <>
      <p style={{
        marginTop: 0,
        marginBottom: 10,
        fontFamily: "'EB Garamond', Georgia, serif",
        fontSize: 12.5,
        color: 'var(--text-muted)',
        lineHeight: 1.5,
      }}>
        <strong>{tilingLabel}</strong> is loaded on the legacy substrate. Tune
        its Figures in <em>Strands</em> below, or switch to{' '}
        <em>Decoration</em> to paint it. The Design Phase needs a Patch, which
        this tiling can't form yet — the buttons at the bottom replace the
        loaded pattern with a new one.
      </p>

      <FieldLabel
        label="Phase"
        tooltip="Workflow stage. Composition = shape the Strands with the per-Tile-type Figure recipes below. Decoration = colour the Strands and fill the Voids (Strand geometry is frozen there — flip back to Composition to reshape). There is no Design Phase on this substrate: the tiling is generated from its definition, not authored Tile by Tile."
      />
      <div style={{ display: 'flex', gap: 0, marginBottom: 12 }}>
        {([['strand', 'Composition'], ['decoration', 'Decoration']] as const).map(([p, label]) => (
          <button
            key={p}
            onClick={() => onSetEditorPhase(p)}
            // `design` is the initial phase value and never legal here, so it
            // reads as Composition until the substrate effect folds it over.
            style={segmentedButtonStyle(p === 'decoration' ? inDecoration : !inDecoration)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Paint history (2026-08-04). Sits directly above the panel it governs
          rather than at the top of the sidebar like the Builder's copy: here
          it is Decoration-only, so anchoring it to the Phase switch is what
          makes "these undo the painting" read without a label. */}
      {inDecoration && (
        <HistoryButtonRow
          buttons={[
            { label: '↶ Undo', onClick: onUndo, disabled: !canUndo },
            { label: '↷ Redo', onClick: onRedo, disabled: !canRedo },
            {
              label: 'Clear paint',
              onClick: () => {
                if (window.confirm('Remove all decoration — Void fills, Strand colours, Stamps and gradients? The pattern itself is untouched, and Undo will bring the paint back.')) {
                  dispatch({ type: 'CLEAR_DECORATION' })
                }
              },
              disabled: !painted,
              title: painted
                ? 'Remove every fill, Strand colour, Stamp and gradient'
                : 'Nothing painted yet',
            },
          ]}
        />
      )}

      {inDecoration && (
        <DecorationPanel
          substrate="legacy"
          decoration={patternDecoration(config)}
          frame={config.frame}
          onSetFrame={f => dispatch({ type: 'SET_GALLERY_FRAME', payload: f })}
          seedBBox={() => legacySeedBBox(config.frame, viewBoundsRef.current)}
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
          combineSelection={combineSelection}
          onClearCombineSelection={onClearCombineSelection}
        />
      )}

      {/* Frame (2026-08-03) — the same persistent overlay the Builder offers,
          on the top-level `config.frame` this substrate keeps it in. Clip-only
          (no Patch ⇒ no completion, no lattice to ring), which is exactly what
          the Gallery Frame always was. Rendering needed nothing new: Canvas
          already clips a non-editor tiling to `config.frame` and draws its
          border stroke — only the controls were missing. */}
      <FramePanel
        substrate="legacy"
        frame={config.frame}
        onSetFrame={f => dispatch({ type: 'SET_GALLERY_FRAME', payload: f })}
        // A new Frame is centred on what the user is looking at. There is no
        // Patch here to make (0, 0) meaningful, and the camera is free — so a
        // Frame pinned to the world origin can be created entirely off screen,
        // clipping the visible field (Void fills and Stamps with it) away to a
        // blank canvas. Read at click time from the ref so it reflects the live
        // camera without re-rendering the sidebar on every pan.
        newFrameOrigin={() => {
          const b = viewBoundsRef.current
          return b ? { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 } : null
        }}
      />
    </>
  )
}
