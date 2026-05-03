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
- [archived 2026-05-03] Step 4 — Tessellation preset catalogue (presets dropped; replaced by user library)
- [archived 2026-05-03] Step 5 — Layered mandala engine v1 (mandala feature scrapped)
- [archived 2026-05-03] Step 6 — Mandala preset catalogue (mandala feature scrapped)
- [archived 2026-05-03] Step 7 — Region-stitching v1, hard-frame (composition feature scrapped)
- [archived 2026-05-03] Step 8 — Composition preset catalogue (composition feature scrapped)
- [done] Step 9 — Lab polish: localStorage persistence of full Lab state, tessellation outline weight slider, fill-on-hover toggle.
- [done] Step 10 — `FigureControls` lifted to `components/strands/FigureControls.tsx`. Sidebar imports from new location; no behavioural change in Main.
- [done] Step 11 — Lab Strands panel (basic per-tile-type controls: figure type + contact angle + auto/length). LX-1 = (a) trimmed Lab variant; ID-1 = identical render where overlap exists.
- [archived 2026-05-03] Step 12 — Specialised mandala strand renderer (mandala feature scrapped)
- [archived 2026-05-03] Step 13 + follow-up — Composition strand renderer + match-up boundary mode (composition feature scrapped)
- [done] Step 14 — Lab-local library. `state/customTessellations.ts` (schema-versioned localStorage at `lab-tessellations-v1`, list/save/rename/delete/duplicate, quota + corruption handling). Library buttons + saved-entries dropdown live under "My Tessellations".
- [next] Step 17 — User-editable tessellation editor (drag-and-drop polygon placement). Now the primary focus.
- [todo / parked] Steps 15, 16, 18 (k-uniform generator, quasi-periodic, Girih substitution).

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
- **Step 7 implementation:** new `tilings/composition.ts` module exports
  `generateComposition()`, `compositionPickerNames()`, and
  `DEFAULT_COMPOSITION_CONFIG`. New `composition` entry in `TilingCategory`
  + a `'composition'` marker entry in `TILINGS` (similar to the
  layered-mandala marker) + a "Composed" group in `SYMMETRY_GROUPS`.
  `PatternConfig` gains optional `composition?: CompositionConfig`
  (`{ centre, background, centreScale, backgroundScale, regionRadius,
  frameEnabled, frameColor }`). `usePattern` returns an extra
  `composition: CompositionRender` field with per-region polygons +
  segments + region polygon. `PatternSVG` defines two `<clipPath>`s
  (region + viewport-minus-region via even-odd path) and renders the
  centre/background tile + strand layers under their respective clips,
  then draws the frame `<polygon>` on top. Reducer seeds default config
  on category entry and gains `SET_COMPOSITION_*` actions for centre,
  background, centreScale, backgroundScale, regionRadius, frameEnabled,
  frameColor. Lab sidebar gains a "Composition" panel with both
  pickers, three sliders, frame toggle, and colour picker. Global Scale
  slider hidden in composition mode (composition has its own per-side
  scales). CG-1 = (a) two sliders, FS-1 = (a) on/off + single colour
  swatch — both per plan-default. Auto-fit, fixed-ratio, weight slider,
  dash style, inset offset, and contrast-only variants parked as
  `project_composition_scale_expansion_idea.md` and
  `project_composition_frame_expansion_idea.md`.
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
- **2026-05-03 cleanup shipped.** User scrapped the mandala and
  composition features; the entire preset catalogue went with them.
  Lab UI shell preserved and repurposed as the workspace for the
  user-editable tessellation editor (formerly Step 17).
  Archived to `archive/tessellation-lab/`:
  `tilings/{mandala,mandalaStrand,composition,compositionStrand,compositionVerifiedPairs}.ts`
  and `state/labPresets.ts`. README in the archive folder lists the
  reusable bits (per-polygon synthetic figures map, regular polygon
  vertex generator, strict-divisor / common-divisor fold validation,
  even-odd `clipPath` "viewport minus polygon" technique).
- Removed `MandalaConfig` / `CompositionConfig` from
  `types/pattern.ts`, `'mandala'` and `'composition'` from
  `TilingCategory`, all `SET_MANDALA_*` / `SET_COMPOSITION_*`
  reducer actions, the marker `layered-mandala` and `composition`
  TILINGS entries plus their SYMMETRY_GROUPS rows, the composition
  rendering branch in `PatternSVG`, the composition / mandala
  branches in `usePattern`, and the activePresetId plumbing through
  `App.tsx`.
- `loadLabState` migration: persisted configs that point at
  `layered-mandala` or `composition` reset to a blank tessellation
  type and have their `mandala` / `composition` payloads stripped.
- `customTessellations.ts` migration: saved entries pointing at the
  retired tiling types are skipped on load with a console warning;
  `SavedSourceCategory` narrowed to `'archimedean' | 'rosette-patch'`.
- TessellationLabMode rewritten: stripped Presets section, Layers
  panel, Composition panel. Kept the Tessellation picker, Strands
  panel, Display section, and the library (Save / Rename /
  Duplicate / Delete + saved-entries dropdown under "My
  Tessellations"). Added an "Editor" section placeholder where the
  drag-and-drop editor will dock.
- `npm run build` green; ready to plan Step 17.
- Next up: plan the user-editable tessellation editor.

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
