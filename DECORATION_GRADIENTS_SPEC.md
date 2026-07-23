# Decoration Gradients — Spec

Grilled + agreed 2026-07-20. Status: **#44 + #45 SHIPPED + browser-verified;
#46 v2 strand gradients — global-field slice SHIPPED + browser-verified
(2026-07-23), single-Strand scope deferred.** Tickets:
**#44** (slice 1), **#45** (slice 2), **#46** (v2 strand gradients).
Companion memory: `project_decoration_gradients_idea.md`.

## Summary

Gradient fills for the Decoration Phase. Two modes for Voids in v1 —
**per-shape** gradients repeated across a congruent Void group, and a single
**across-frame** gradient underlay that shows through every unpainted Void.
Strand gradients are v2 (design captured below, deferred).

Builder Decoration Phase only (rides `DecorationConfig`); exports come free
via SVG gradient defs.

## Decisions (grill outcomes)

1. **V1 targets = Void fills only.** Strand + frame-border gradients deferred
   to v2; canvas background stays flat.
2. **Gradient vocabulary:** `linear` + `radial`. Arbitrary stops — min 2,
   soft cap ~8 — each stop has a draggable offset, add/remove, and its own
   colour.
3. **Per-shape geometry editing** happens in a **focus modal**
   (`StampFocusEditor` pattern): the shape rendered large in canonical pose,
   draggable handles for the linear start/end axis or radial centre/radius,
   stop bar underneath. Edits replicate to every congruent instance exactly
   like stamp placement (canonical pose handles mirrored instances).
4. **`'gradient'` is a fourth `PaintTarget`** (Voids | Strands | Stamp |
   Gradient) with a mode toggle: **This shape / Across frame**.
5. **Across-frame = underlay, not paint-to-assign.** One frame gradient per
   composition (one geometry + stop set). It renders as the default fill of
   every **unpainted** Void; explicitly painted groups cover it; clearing a
   group's paint reveals it again. No Void clicking in frame mode.
6. **Frame-gradient enablement:** on/off toggle, off by default. First enable
   seeds a vertical linear gradient spanning the Frame bbox (visible-content
   bounds fallback — the feature works with no Frame; "across frame" means
   "across the composition", anchored in world space). Stops seed from the
   current decoration colour → canvas background. Geometry edited via
   **on-canvas drag handles** (Morph-layer precedent: linear start/end;
   radial centre + radius handle).
7. **Scope ladder reused** for per-shape gradients (congruent / cell / patch /
   instance selector, congruent default) — a gradient record is just a
   `voidFills` record with a gradient spec.
8. **Stop colours route through the existing `ColourPicker`** (themes +
   recents shared with flat paint).
9. **Removal = existing mechanics.** Clearing a Void group's fill clears its
   gradient (same record); the frame gradient's toggle-off removes the
   underlay. No separate delete UI.

## Data model

- `ColourRecord` gains additive `gradient?: GradientSpec`. `colour` stays as
  the representative flat colour (swatches, recents, legacy fallback);
  `gradient` wins when present. Zero migration — absent field ⇒ pre-gradient
  behaviour byte-identical.
- `GradientSpec` (shared by both modes and by v2 strands):
  - `type: 'linear' | 'radial'`
  - `stops: { offset: number /* 0..1 */; colour: string }[]` (min 2, cap ~8)
  - geometry — linear: start/end points; radial: centre + radius. Per-shape
    records store geometry in **canonical-pose coordinates**; the frame
    gradient stores **world coordinates**.
- Frame gradient config: one optional slot on `DecorationConfig`
  (`frameGradient?: { enabled: boolean } & GradientSpec`).

## Rendering

- `VoidFillLayer` mints `<linearGradient>`/`<radialGradient>` defs at render:
  per-shape ⇒ canonical-pose transform per instance (stamp-placement maths);
  frame ⇒ single `userSpaceOnUse` def referenced by every unpainted Void
  polygon.
- Id-collision care on the periodic fast-path `<use>` fragment (defs live
  inside the cloned fragment; ids must be unique per layer instance).
- Validation additive in the colour-record readers (`editor/migrations.ts`);
  malformed gradient ⇒ drop the gradient, keep the flat colour.

## Slices

1. **Data model + per-shape gradients + focus editor** — GradientSpec,
   record plumbing, gradient PaintTarget ('This shape' mode), stop bar,
   focus modal with geometry handles, scope ladder, save/load. Model: Fable
   (canonical-pose gradient transform + resolve-ladder touch), UI parts
   Sonnet-able.
2. **Across-frame underlay + on-canvas handles** — frame gradient slot,
   unpainted-Void underlay rendering on both render paths, enable toggle +
   seeding, canvas handle layer (Morph precedent). Model: Opus.
3. **Strand gradients (v2, deferred)** — see below. Model: Fable (gradients
   along stroked curved paths are non-trivial in SVG).

## V2 — Strand gradients (user design 2026-07-20)

**Status (2026-07-23): global-field slice SHIPPED + browser-verified.** The
render model was locked to **Model A — one shared world-space `GradientSpec`**
(user decision): a single `userSpaceOnUse` `<linearGradient>`/`<radialGradient>`
def stroked across **every** Strand (`StrandLayer` `stroke="url(#strand-gradient-def)"`),
a continuous wash over the whole field — *not* the literal "a gradient def per
Ray" reading (thousands of handles/defs, unusable at scale). Data model mirrors
the #45 frame gradient exactly: `DecorationConfig.strandGradient?: StrandGradient`
(`{enabled}&GradientSpec`, world coords), `SET_DECORATION_STRAND_GRADIENT` dumb
setter, additive migration, `enabled` disqualifies the periodic fast-path (so the
def spans the full world field, not one tiled `<use>` fragment). UI: a Flat /
Gradient mode toggle under the **Strands** paint target → `StrandGradientControls`
(enable + linear/radial + stop bar + colour picker, first-enable seeds across the
composition bbox), on-canvas handles reuse `EditorFrameGradientLayer` (gold).
Commits `94c7147` (data) → `306e0e8` (render) → `0c2c640` (UI+handles).

**Deferred to a follow-up slice:** the **single-Strand scope toggle** below (this
slice ships only the DEFAULT "ALL strands at once" scope). Also not yet
visually verified: gradient × weave / double / triple line styles (the code path
applies the url stroke to those too, but the combo wasn't screenshotted).

User's intent, captured verbatim-in-spirit:

- **Handles appear on every Ray** when the strand-gradient tool is active —
  the gradient control points live on the rendered strand geometry itself.
- **Default editing scope = ALL strands at once**: the UI elements edit every
  strand's gradient together (one shared gradient definition). Handle
  **colour** is edited in the sidebar; handle **position** is dragged
  directly on screen.
- **A UI selection toggle narrows scope to a single Strand**: with it on,
  clicking a Strand scopes the same tools to that strand only (the tools
  "just scope to facilitate" — same handles/sidebar, narrower reach).

Implementation notes for the future session: SVG has no native
gradient-along-a-path; expect per-Ray gradient segments (each Ray stroked
with its own linear gradient interpolated between the handle colours at its
endpoints — matches "handles on every Ray") or path-splitting. Interacts
with weave rendering, the double/triple mask + `innerFill`, and Decoration
strand-colour records (scope ladder vs the new all-strands/single-strand
toggle needs reconciling when this is picked up).

## Out of scope (v1)

- Strand + frame-border-stroke gradients (v2 above).
- Background gradient.
- Multiple simultaneous across-frame gradients.
- Gallery (Decoration is Builder-only).
