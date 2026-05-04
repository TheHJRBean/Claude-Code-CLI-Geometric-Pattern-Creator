# SESSION_STATE.md

## ▶ RESUME HERE

**Current branch:** `feat/art-deco-egypt-theme-revamp`.

**Last action:** 2026-05-04 — sub-step **17.2** shipped (`f9d6197`):
Design-mode shell. New `EDITOR_NEW` / `EDITOR_CLEAR` plus per-knob
actions for boundary shape / boundary size / origin sides. New
`createDefaultEditorConfig` + `createOriginTile` helpers
(Decision 6 auto-placement, rotation 0, edgeLength 100). New
`editorBoundaryVertices` returns the boundary outline; `usePattern`
surfaces it via `PatternData.boundaryOutline`, `PatternSVG` renders
it as a non-interactive dashed accent polygon under tiles. The
Editor section in `TessellationLabMode` swaps to design controls
(3 shape buttons + boundary-size slider + origin-sides slider +
Clear) when a patch is active; otherwise shows New patch / Show
sample patch. Q9 Option B respected — boundary size only rescales
the outline, tile sizes untouched. Awaiting visual sign-off.

Earlier: 17.1 shipped 2026-05-03 (`e199aee`) — `EditorConfig` data
model + read-only render. Follow-up `94f651c` removed the standard
tessellation Type dropdown / Scale / Reset / Info panel from Lab.

**Next action:** Visually verify 17.2 in the browser (each shape,
size slider, origin sides 3–12). Then begin sub-step **17.3 — Tile
selection + viable-polygon picker (single edge)**. Click a tile →
highlight its edges; show viable-polygon picker per Q10; pick a
polygon → place on the clicked edge only (no propagation yet).
Apply edge-length match (Decision 14) and overlap check (Decision 7).
Apply non-conforming-edge rule (Decision 14a). Acceptance: click
origin's top edge → pick triangle → triangle appears on that edge.

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
- [in progress] **Step 17** — user-editable tessellation editor. 17.0–17.2 done (17.2 awaiting visual sign-off); **17.3 next**.
- [parked] Steps 15, 16, 18 — k-uniform generator, quasi-periodic, Girih substitution

## Live architecture (post-cleanup, post-17.2)

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
- Reducer actions: PIC + figure controls, plus editor actions
  added at 17.2 — `EDITOR_NEW`, `EDITOR_CLEAR`,
  `SET_EDITOR_BOUNDARY_SHAPE`, `SET_EDITOR_BOUNDARY_SIZE`,
  `SET_EDITOR_ORIGIN_SIDES`. Knob handlers are no-ops when no
  patch is active. `SET_EDITOR_ORIGIN_SIDES` rebuilds the origin
  tile in place via `rebuildOriginTile`, preserving any non-origin
  tiles for 17.3+.
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
  (via the local `BoundaryOutline` sub-component).
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
None. 17.2 awaits visual sign-off; once confirmed, 17.3 (single-edge
tile placement) is the next active task.
