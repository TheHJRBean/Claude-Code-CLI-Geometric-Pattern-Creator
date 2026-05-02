# SESSION_STATE.md

## Goal
Improve tessellation options and add UI customisability. Full plan lives in
**`TESSELLATION_REVAMP_PLAN.md`** — keep this file as the rolling status anchor only.

## Terminology (locked 2026-04-26)
- **Tessellation** — underlying polygon tiling (squares, hexagons, rhombi, etc.).
- **Strand** — a line in the decorative PIC pattern overlaid on a tessellation.

UI strings now use these. Internal code still refers to "tiling" / "lineLength"
in some identifiers; those are deferred refactors and not user-visible.

## Plan
See `TESSELLATION_REVAMP_PLAN.md` (v3) for the full step-by-step plan. Per-step
progress trackers (e.g. `STEP2_PROGRESS.md`) hold finer-grained sub-task state.
Status snapshot:

- [done] Phase 0 — grill-me interview, architectural decisions, terminology lock, Option-B restructure
- [done] Step 1 — Tessellation Lab scaffold
- [done] Step 2 — Port existing tessellations into Lab
- [done] Step 3 — Hexadecagonal-rosette tessellation (16-fold)
- [done] Step 4 — Tessellation preset catalogue
- [done] Step 5 — Layered mandala engine v1 (polygons only) · MQ-1 deferred to Step 6
- [done] Step 6 — Mandala preset catalogue · MQ-1 did not fire (strict-divisor sufficed); Octagonal shipped as 8+4 (dropped the 2-fold ring per plan guidance "preset list shrinks rather than rule loosens")
- [todo] Step 7 — Region-stitching v1, hard-frame · CG-1 + FS-1 fire here
- [todo] Step 8 — Composition preset catalogue (hard-frame)
- [todo] Step 9 — Lab polish
- [todo] Step 10 — Lift `FigureControls` into shared component
- [todo] Step 11 — Strand controls in Lab (archimedean / rosette-patch) · LX-1 + ID-1 fire here
- [todo] Step 12 — Mandala strand renderer · MS-1 fires here
- [todo] Step 13 — Composition strand renderer + match-up · CS-1 gates this step
- [todo] Step 14 — Lab-local library (save / rename / delete / duplicate)
- [todo] Steps 15–18 (opt)

## Done
- Grill-me interview: architectural decisions locked
- 5 alternative options saved as `/idea` memory entries
- Wrote `TILING_REVAMP_PLAN.md` (since renamed)
- **Step 1 implementation:** mode toggle in `App.tsx`, `TessellationLabMode.tsx`
  (renamed from `TilingLabMode`), Lab button in Main sidebar header. Independent
  `PatternConfig` per mode.
- **Step 2 implementation:** Lab "Tessellation" dropdown wired to
  `SYMMETRY_GROUPS` / `TILINGS`; scale slider; "Reset to default angle"; info
  panel (vertex config / fold / category); "Show strands" toggle.
- **Button overlap fix:** Main-mode Lab button at `left:50` so it no longer
  collides with `.sidebar-collapse-desktop` (`left:12`, w:30).
- **Terminology pass:** UI strings renamed throughout (Tiling→Tessellation,
  lines→strands). Lab defaults to tessellation-on, strands-off. Plan file
  renamed `TILING_REVAMP_PLAN.md` → `TESSELLATION_REVAMP_PLAN.md` and
  rewritten end-to-end.
- **Step 3 implementation:** `hexadecagonal-rosette` added to
  `src/tilings/index.ts` (vertex config `[16, 4]`, fold-16, default
  contact angle 78.75° on the 16-gon, 67.5° on the 4-gon ring).
  `SYMMETRY_GROUPS` gains a fold-16 entry. Research notes appended in
  `RESEARCH-TILING-CONFIGURATIONS.md` working log.
- **Step 4 implementation:** new `state/labPresets.ts` catalogue with 8
  tessellation-named presets (Square, 4.8.8, Hexagonal, 3.6.3.6, 4.6.12,
  3.12.12, Decagonal Rosette, Hexadecagonal Rosette). Lab sidebar gains
  a "Presets" section above "Tessellation" with a dropdown + "Load preset"
  button that dispatches `LOAD_CONFIG`. UX iteration: dropped the separate
  Load button; presets now apply on dropdown change.
- **Step 5 implementation:** new `tilings/mandala.ts` module with strict-
  divisor validation (`isLayerFoldValid`, `allowedInnerFolds`) and
  `generateMandala` (concentric regular polygons sharing one primary axis).
  `TilingCategory` extended to include `'mandala'`. `PatternConfig` gains
  optional `mandala?: MandalaConfig` (`{ outerFold, layers: [{ fold, scale }] }`).
  TILINGS gains a `'layered-mandala'` marker entry; SYMMETRY_GROUPS gains
  a fold-0 "Layered" group. Reducer gains `SET_MANDALA_*` actions; selecting
  the layered mandala seeds `DEFAULT_MANDALA_CONFIG`. Lab sidebar gains a
  "Layers" panel with outer-fold picker + per-layer fold (filtered by strict
  divisor) + scale slider + remove + "Add layer" (capped at 4). Strand
  rendering for mandala deferred to Step 12.
- **Post-Step-5 fixes (commit 46dd7c5):**
  - Lab state (`PatternConfig`, `showStrands`, `activePresetId`) lifted
    from `TessellationLabMode` up to `App.tsx` so it survives mode
    toggles. New `state/labDefaults.ts` holds `LAB_DEFAULT_CONFIG`.
  - Title overlap with mode + theme buttons fixed by bumping the h1
    `marginTop` from 4 → 48 px.
  - Camera centred on world origin: `usePanZoom` accepts `initialX/Y`;
    `Canvas` seeds them to `-size/2`. `resetCamera` mirrors it.
    Mandala (which anchors at `(0,0)`) now appears at canvas centre;
    archimedean / rosette-patch tessellations are unaffected because
    they fill the viewport regardless.
  - Mandala default scale bumped from 100 → 250 px on first entry
    (mandala uses `scale` as outer-ring radius, not edge length). Lab
    scale slider max raised to 600 for mandala (vs. 300 elsewhere) and
    the label switches to "Outer radius" for mandala.
- **Step 6 implementation:** `state/labPresets.ts` gains a
  `mandalaPreset()` helper and four entries — `Octagonal (8+4)`,
  `Hexagonal (12+6+3)`, `Sultan Hassan (16+8+4)`, `Decagonal (10+5)`.
  Lab "Preset" dropdown now uses `<optgroup>` to split entries into
  "Tessellations" and "Mandalas" sub-sections. MQ-1 evaluation: all
  three multi-layer targets satisfy strict divisor (12⊃{6,3}, 16⊃{8,4},
  10⊃5); Octagonal's nominal third ring `2` is below the polygon engine
  floor (n ≥ 3), not a divisor issue, so the preset list shrank to
  `8+4` per plan guidance. MQ-1 stays unresolved-but-deferred — no
  target preset has yet forced common-divisor.
- **Step 5/6 follow-up — per-layer rotation step:**
  `MandalaLayer` gains optional `rotationStep: number` (units of
  `π / fold`, i.e. half the inter-vertex angle). Even steps land on
  the outer's vertex axis, odd steps land on the edge-midpoint axis,
  so vertices always snap to either the outer's vertices or its edge
  centres. `generateMandala` adds `step * π / fold` to per-layer
  `phi`. Reducer gains `SET_MANDALA_LAYER_ROTATION_STEP` (modulo
  `2 * fold`). Layers panel gains a ◀ / Reset / ▶ control with a
  readout (`step N/M · θ° · vertex|edge-aligned`).

## Next
- Visual sign-off complete: Steps 1–5 verified by user. Step 6
  code-complete; awaiting visual sign-off on the four mandala presets
  (Octagonal 8+4, Hexagonal 12+6+3, Sultan Hassan 16+8+4, Decagonal 10+5).
- Strands turned on for mandala presets will *look broken* — the
  per-tile-type strand renderer doesn't know about layers. Step 12
  (specialised mandala strand renderer) fixes this; expected at this
  step per the plan.
- Next up: **Step 7 — Region-stitching v1, hard-frame only**. Open
  questions CG-1 and FS-1 fire there.

## Decisions
All architectural decisions captured in the "Locked architectural decisions"
section of `TESSELLATION_REVAMP_PLAN.md`. Recap (one-liner each):
1. All six original ambitions in scope, presets first, editor last.
2. Mandala = layered tessellation composition.
3. Mandala layer rule = strict divisor chain (conservative; revisit only if MQ-1 forces it).
4. Mix-and-combine = region-stitching, simplest-case-only in v1.
5. Boundary = (b) strand match primary, (a) hard frame as fallback toggle.
6. Pair handling = hybrid filter: legal pairs by default, "show all" unlocks with auto-fallback.
7. Engine work first, editor last (Step 17).
8. Lab is a separate mode; chrome grows step-by-step as engines stabilise.
9. Tessellation-first rendering in Lab; strands are an optional overlay.
10. Lab-resident custom tessellations (Option B). No Main-mode bridge.

## Blockers
None.
