# SESSION_STATE.md

## ▶ RESUME HERE

**Current branch:** `feat/art-deco-egypt-theme-revamp`.

**Last action:** 2026-05-05 — sub-step **17.4 archived** the same
day it was built. Built first as `e30fdb9` (orbit-symmetric
placement + delete under D3/D4/D6), then the user tried it in the
browser and didn't like how it felt — but wasn't yet sure what
alternative they wanted. Rather than iterate blindly we **parked
the whole feature**: moved `editor/symmetry.ts` and `editor/orbit.ts`
to `archive/editor-orbit-17.4/` (with a restoration `README.md`),
and reverted the reducer to 17.3's single-edge placement + tile
delete. The `project_editor_symmetry_axes_toggle_idea.md` `/idea`
was updated to note that re-enabling propagation should be bundled
with a symmetry-axis subgroup picker (full / rotation-only /
vertical / horizontal / none) — it shouldn't ship as full-D_n-by-
default again.

Earlier: 2026-05-04 — sub-step **17.3** shipped (`ccc7da0`):
single-edge tile placement. New geometry helpers
`computeExposedEdges`, `placeRegularNGonOnEdge`, `isPlacementViable`
(Decision 7 angle-sum check + Decision 14a non-conforming gate),
`viableSidesForEdge` filtering `PICKER_SIDES = {3,4,5,6,7,8,9,10,12}`.
New `EditorEdgeLayer` renders inside `PatternSVG`'s rotation `<g>`
via a new `editorOverlay` slot — each exposed edge has an invisible
hit-area; pointer events stop propagation so pan doesn't fire.
Non-conforming edges render dashed and inert. New
`EditorPickerOverlay` is a screen-space HTML popover positioned via
a new `worldToScreen` helper in `Canvas` that respects pan, zoom
and the rotation `<g>`. New reducer action
`EDITOR_PLACE_TILE_ON_EDGE` re-validates and appends a placed tile.
`TessellationLabMode` owns `selectedEdge` state and dispatches the
placement. Awaiting visual sign-off.

Earlier: 17.2 shipped 2026-05-04 (`f9d6197`) — Design-mode shell;
follow-up `0aff7fb` resets placed tiles when shape / origin sides
change. 17.1 shipped 2026-05-03 (`e199aee`) — data model +
read-only render. `94f651c` made Lab editor-only.

**Next action:** **Sub-step 17.5 — Complete operation (manual).**
Click two adjacent outer vertices, highlight the pair, compute the
gap polygon, prefer regular polygon fit then fall back to irregular
(bowtie / kite) per Decision 10. Add as first-class tiles
(Decision 12). Pull the per-polygon synthetic figures-map helper
out of `archive/tessellation-lab/` for irregulars. Acceptance:
square + 4 triangles → select two triangle tips → Complete fills
the 4 corner gaps with new triangles.

**17.4 parking note:** archived under `archive/editor-orbit-17.4/`.
When the user is ready, re-enable bundled with the symmetry-axis
subgroup picker (see `project_editor_symmetry_axes_toggle_idea.md`)
— don't ship full-D_n-by-default again.

**17.3 visual review (2026-05-04):** user confirmed it works well
overall. Two follow-ups landed in the same session:
1. Picker icon contrast — buttons were too dark; switched to
   accent-bordered + accent-coloured icons (`fix(picker): brighten
   icons` follow-up commit). Look for further refinement if still
   under-contrast in light theme.
2. Overlap detection — angle-sum at shared endpoints missed
   non-adjacent tile overlaps for large candidate n-gons (e.g.,
   placing a 12-gon on a small square's edge wrapping past
   neighbours). `isPlacementViable` now also runs a centre-in-polygon
   check both ways via `pointInPolygon` against `regularPolygonVertices`
   of the candidate. Should catch the cases the user saw.

**17.3 deferred:** symmetry conservation is *not* enforced on
single-edge placements — the user can still build asymmetric
patches. Captured as `/idea`
(`project_editor_symmetry_enforcement_idea.md`, MEMORY.md updated).
Decision: defer until 17.4 lands the orbit, then optionally add a
"Strict symmetry" checkbox that *refuses* asymmetric placements
(distinct from 17.4's default which *propagates* placements
across the orbit).

**To rebuild context in a fresh session, read:**
1. This file (status anchor).
2. `TESSELLATION_REVAMP_PLAN.md` — full plan, Steps 4–8 / 12 / 13 marked
   ARCHIVED but kept for design history. The Step 17 brief at the bottom
   is the live one.
3. `archive/tessellation-lab/README.md` — what's archived and which
   helpers may be worth lifting back into the editor.
4. `CLAUDE.md` (project) — repo conventions and architecture overview.

---

## Goal
Improve tessellation options and add UI customisability. The user-editable
tessellation editor (Step 17) is the remaining ambition; everything else
on the original plan has either shipped, been archived, or been parked.

## Terminology (locked 2026-04-26)
- **Tessellation** — underlying polygon tiling (squares, hexagons, etc.).
- **Strand** — a line in the decorative PIC pattern overlaid on a tessellation.

UI strings use these. Internal code still uses "tiling" / "lineLength" in
some identifiers; deferred refactors, not user-visible.

## Status snapshot

Plan steps live in `TESSELLATION_REVAMP_PLAN.md`. One-liner status:

- [done] Phase 0 — architectural decisions, terminology, Option-B restructure
- [done] Steps 1–3 — Lab scaffold + existing tessellations + hexadecagonal-rosette
- [archived 2026-05-03] Steps 4–8 — preset catalogue, mandala engine + presets, composition + presets
- [done] Steps 9–11 — Lab polish, `FigureControls` lift, Lab Strands panel
- [archived 2026-05-03] Steps 12–13 — mandala strand renderer, composition strand renderer + match-up
- [done] Step 14 — Lab-local library (`state/customTessellations.ts`)
- [in progress] **Step 17** — user-editable tessellation editor. 17.0–17.3 done (17.3 signed off + two follow-ups); **17.4 next**.
- [parked] Steps 15, 16, 18 — k-uniform generator, quasi-periodic, Girih substitution

## Live architecture (post-cleanup, post-17.3)

- `TilingCategory` = `'archimedean' | 'rosette-patch'` (live tree). The
  editor patch is signalled by `tiling.type === 'editor'` plus
  `config.editor` payload — it has no `TilingDefinition` entry because
  it doesn't fit the static-tiling schema.
- `PatternConfig` carries `tiling`, `figures`, `lacing`, optional
  `edgeAngles`, optional `smoothTransitions`, and **optional `editor?:
  EditorConfig`** (Q13 Option C). `EditorConfig` has its own inner
  `version: 1`.
- `EditorConfig` shape: `{ version, boundaryShape, boundarySize,
  originSides, edgeLength, tiles: EditorTile[] }`. `EditorTile` is a
  tagged union of `EditorRegularTile` and `EditorIrregularTile` with
  an `origin: 'origin' | 'placed' | 'completed'` discriminator (single
  array per Decision 12).
- `SavedSourceCategory` = `'archimedean' | 'rosette-patch' | 'editor'`.
- Reducer actions: PIC + figure controls, plus editor actions —
  `EDITOR_NEW`, `EDITOR_CLEAR`, `SET_EDITOR_BOUNDARY_SHAPE`,
  `SET_EDITOR_BOUNDARY_SIZE`, `SET_EDITOR_ORIGIN_SIDES`,
  `EDITOR_PLACE_TILE_ON_EDGE`. Knob handlers are no-ops when no
  patch is active. Shape / origin-sides changes reset `tiles` to
  `[origin]` (orbit / origin invalidates downstream tiles).
  `EDITOR_PLACE_TILE_ON_EDGE` recomputes `computeExposedEdges`,
  re-validates with `isPlacementViable`, and appends an `origin:
  'placed'` tile.
- `usePattern` dispatches: editor branch first (`tiling.type === 'editor'
  && config.editor` → `editorTilesToPolygons` + `runPIC` +
  `editorBoundaryVertices`), then the existing archimedean /
  rosette-patch branches. Editor patches bypass viewport
  quantisation since they're finite. `PatternData` now carries an
  optional `boundaryOutline: Vec2[]` populated only in editor mode.
- `tileTypeIdFor()` keys regular tiles as `"<n>"`. Irregular tiles get a
  provisional `"<n>i:provisional"` placeholder until 17.5 lifts the
  canonical-signature hash from `archive/tessellation-lab/`.
- `PatternSVG` has no clipPath plumbing — single tile + strand layer.
  At 17.2 it accepts an optional `boundaryOutline: Vec2[]` and renders
  it as a non-interactive dashed accent polygon below `TileLayer`
  (via the local `BoundaryOutline` sub-component). At 17.3 it gained
  an `editorOverlay?: ReactNode` slot rendered above `TileLayer`
  inside the rotation `<g>`; `Canvas` plugs in `EditorEdgeLayer` and
  positions the picker via screen-space `worldToScreen`.
- `App.tsx` has no `activePresetId` state.
- `TessellationLabMode` chrome (post-17.2): header, **Editor
  section** which swaps based on patch state — when active, shows
  design controls (3 boundary-shape buttons + boundary-size slider
  + origin-sides slider + Clear); when inactive, shows New patch /
  Show sample patch. "My Tessellations" library (Save / Rename /
  Duplicate / Delete + saved-entries dropdown), Strands panel
  (currently inert in editor mode — wired at 17.6 per Q15),
  Display section. The standard tessellation Type dropdown /
  Scale / Reset / Info panel were removed in `94f651c` — Lab is
  editor-only.
- Editor defaults (`src/editor/createDefault.ts`): square boundary,
  boundarySize 200, originSides 4, edgeLength 100. Origin rotation
  is 0 across all combos; boundary rotation is `-π/2` for triangle /
  hex (point-up) and `π/4` for square (axis-aligned), defined in
  `BOUNDARY_ROTATION` inside `buildEditorPolygons.ts`.
- Migrations: `loadLabState` resets retired tiling types to `''` and
  strips dropped payloads; `listSavedTessellations` skips retired-type
  entries with `console.warn`. `'editor'` is *not* retired and passes
  through.

## Decisions still in force after the pivot

1. Lab is a separate mode; Main is unchanged.
2. Tessellation-first rendering in Lab; strands are an optional overlay.
3. Lab-resident custom work — no Main-mode bridge.
4. Library is Lab-only, persists to `lab-tessellations-v1` localStorage.
5. Existing JSON `saveJSON` / `loadJSON` remains the canonical share format.

Architectural decisions specific to mandala / composition (strict-divisor
layer rule, hard-frame fallback, verified-pairs allow-list, etc.) are
moot now those features are archived.

## Blockers
None. 17.3 visually signed off (with two follow-ups that shipped
in the same commit). 17.4 (orbit propagation) is queued.
