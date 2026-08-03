import type { PatternConfig } from '../../types/pattern'
import type { Action } from '../../state/actions'
import type { PaintTarget, StrandPaintScope, VoidPaintScope } from '../../rendering/DecorationPaintLayer'
import type { PaintVoid } from '../../decoration/resolve'
import type { GradientDraft, GradientSelection, WorldBBox } from '../../decoration/gradients'
import { pointsBBox } from '../../decoration/gradients'
import type { WorldBounds } from '../../editor/guides'
import { frameOutlinePolygon } from '../../editor/frame'
import { patternDecoration } from '../../decoration/store'
import { FieldLabel, segmentedButtonStyle } from './labShared'
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
}: Props) {
  const inDecoration = editorPhase === 'decoration'
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
      />
    </>
  )
}
