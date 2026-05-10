# SESSION_STATE.md

## ▶ RESUME HERE

**Current branch:** `feat/art-deco-egypt-theme-revamp`.

**Last action:** 2026-05-10 — Editor v2 boundary configurations
**4.8.8 (octagon + square)** wired end-to-end across phases 1–7
of the plan in `~/.claude/plans/graceful-kindling-charm.md`.
Type-check + production build pass; dev server boots clean.
**Awaiting manual UI sign-off before phase 8 (persistence
round-trip) is closed.**

Phase log:
- `93dcdd4` Phase 1 — `EditorPatch` + `src/editor/active.ts`
  adapter; ~12 helper signatures migrated. No behaviour change.
- `b3c98ee` Phase 2 — octagon polygon (`BoundaryShape += 'octagon'`,
  `BOUNDARY_SIDES[octagon]=8`, `BOUNDARY_ROTATION[octagon]=3π/8`,
  D8 symmetry). Octagon never assignable to a top-level
  `boundaryShape` (migration's allow-list keeps it inside
  `BoundaryTile.shape` only).
- `13a6a63` Phase 3 — `BoundaryComposition` + `BoundaryTile` +
  `EditorConfig.version: 2`. `createDefault488EditorConfig()` +
  `migrateEditorConfig` accepts both v1 (legacy) and v2 with
  optional composition.
- `1d30054` Phases 4 + 7 — two new actions:
  `SET_EDITOR_BOUNDARY_CONFIGURATION` (snapshots history) and
  `SET_ACTIVE_BOUNDARY_TILE` (pure pane swap, excluded). Existing
  per-patch reducer cases route via new `updatePatch` →
  `activePatch` / `withActivePatch`.
- `1a0a247` Phase 5 — `src/editor/compositionLattice.ts`:
  `compositionToPolygons`, `compositionBoundaryOutlines`,
  `compositionLatticeStamps` (4.8.8 cell vectors `(L(1+√2), 0)`
  and `(0, L(1+√2))`). `usePattern` branches once on `composition`.
- `d703dec` Phase 6 — picker now shows 4 entries (Triangle /
  Square / Hexagon / 4.8.8). Active-tile sub-picker
  ("Editing: [Octagon] [Square]") under composition. Single-shape
  controls (Alternate orientation, Boundary size, Wrap boundary)
  hide when composition is active. Strand panel aggregates tile
  types via `allPatches`. Canvas transforms picker overlay to
  cell-local while keeping validation in patch-local.

**Sign-off probes for the 4.8.8 boundary configuration:**

Single-shape regression (Phase 1 adapter):
1. New patch → triangle / square / hexagon → place + delete +
   Complete → undo / redo. Behaviour identical to pre-refactor.
2. Save to library + reload from library — single-shape patches
   survive.

4.8.8 composition (Phases 3–6):
3. New patch → Boundary picker shows **4.8.8** as a 4th entry.
4. Click 4.8.8 → octagon + square outlines render at their cell
   positions; "Editing: [Octagon] [Square]" appears under the
   picker; alternate orientation / boundary size / wrap boundary
   controls hide.
5. Active = Octagon → place a tile inside the octagon → tile
   appears at the octagon's cell position. Switch active to
   Square → place a tile inside the square → tile appears at the
   square's cell position. Picker overlay relocates correctly
   between active-tile switches.
6. Strand mode → both boundary tiles' interiors stamp across the
   viewport on the 4.8.8 lattice. PIC strands flow naturally
   between octagon and square at the shared edges (assuming
   matching contact angles — the 4.8.8 magic).
7. Strand panel → cards appear for every distinct tile type
   across both inner patches (octagon, square, plus any
   user-placed shapes inside either).
8. Picking Triangle / Square / Hexagon while 4.8.8 is active →
   exits composition with a fresh single-shape patch in the
   chosen shape (destructive, undoable).
9. Undo across composition switch → single-shape patch restored
   intact. Active-tile pane swap is **not** undoable (the active
   tile changes back via the picker, not via undo).

Persistence (Phase 8 — open):
10. Author a 4.8.8 patch (place tiles inside both octagon and
    square). Save to Lab library + reload page → composition
    entry round-trips. saveJSON to file → loadJSON → both inner
    patches survive intact.
11. Load a legacy v1 single-shape patch (saved before this
    feature) → loads as v2 with composition absent.

**Previous milestone:** 2026-05-07 — Step **17.11b** (orbit
propagation for multi-vertex Complete) shipped + signed off
(`73f5f81`).

New `placePolygonsOnOrbit(editor, picks, idPrefix)` in
`src/editor/orbit.ts` mirrors `placeTilesOnOrbit`'s conventions:
applies each subgroup element to each pick, gates by
vertex-coincidence with the union of patch-outer / boundary /
pocket / neighbour vertex sets snapshotted from the initial
editor, dedups by tile centroid, and builds the placements
cumulatively against a working state — aborts (returns `null`)
if any orbit copy fails `completeNGap`. `symmetryMode='none'` ⇒
identity-only group ⇒ identical to 17.11 single-instance
behaviour. Reducer's `EDITOR_COMPLETE_N_GAP` now routes through
this helper instead of the bare `completeNGap`.

**Sign-off probes for 17.11b:**
1. `symmetryMode='none'` — multi-vertex Complete still produces
   exactly one tile (regression check vs. 17.11 sign-off probes).
2. Square + `'full'` (D4) + Ctrl-pick a corner-gap polygon →
   Enter → all 4 corners fill in one gesture.
3. Hexagon + `'full'` (D6) + Ctrl-pick a corner-gap polygon →
   Enter → all 6 corners fill.
4. Triangle + `'full'` (D3) + Ctrl-pick → all 3 corner gaps fill.
5. Square + `'rotation'` only + Ctrl-pick → 4 rotated copies fill,
   no reflections.
6. Square + `'vertical'` mirror only + Ctrl-pick on the right →
   the seed + the left mirror image fill (2 tiles).
7. Asymmetric patch — square + an extra placed tile that breaks
   D4 + `'full'` + Ctrl-pick a gap on the asymmetric side → only
   the seed places (orbit images that would land in non-existent
   gaps are silently dropped via the vertex-coincidence gate).
8. Cross-boundary case — square + `'full'` + Ctrl-pick spanning
   the boundary edge to a neighbour vertex → 4 corner-meet tiles,
   one per stamp corner.
9. Undo after orbit commit — Ctrl/Cmd+Z reverts the entire orbit
   set in one undo step (single action = single history entry).
10. Pick on the symmetry axis — Ctrl-pick 3 vertices that lie on
    the vertical mirror with `'full'` → the vertical-reflection
    orbit image deduplicates with itself (centroid dedup), no
    duplicate tile.

Earlier 2026-05-07 — Step **17.11** (multi-vertex Complete:

Earlier 2026-05-07 — Step **17.11** (multi-vertex Complete:
cross-boundary + enclosed pocket) shipped + signed off. First
sub-step of Step 17 v2 done. User confirmed multi-vertex
completions work, click order produces the expected polygon, and
the preview/hint UI guides cleanly. Tracking memo
`project_editor_complete_n_gap.md` deleted on delivery; `MEMORY.md`
line removed.

Two follow-ups captured in the plan (not blocking sign-off):
1. **Neighbour-vertex Ctrl/Cmd-click** — `b6a2568` moved
   `editorOverlay` to be the topmost child of the rotation `<g>` in
   `PatternSVG`. Strand strokes had been catching clicks at
   neighbour coordinates because they painted above the editor
   overlay. Awaiting browser confirmation that neighbour picks now
   register.
2. **Chord-mode click-on-neighbour silently no-ops.** No modifier
   + click 1 patch + click 1 neighbour → `completeGap` can't find
   the neighbour on any cycle → returns null, picks reset, no tile.
   Path forward: either auto-promote chord → multi when the second
   click lands on a neighbour, or refuse the click with a hint.
   Decide before next neighbour-fill iteration.

Locked design (this conversation):
- Click order = polygon order (user owns ordering).
- Validity: N≥3, simple polygon, centroid exterior to every existing
  tile. Mid-pick preview tints red while invalid.
- Cross-boundary tile = plain `EditorIrregularTile` straddling the
  boundary edge (Decision 5 covers it; no new tile kind).
- No pocket auto-detect — pocket cycle vertices are merely *exposed*
  as click targets. User picks them like any other vertex.
- Plain (no-modifier) 2-vertex chord flow unchanged — Ctrl/Cmd is
  purely the "I want N>2" modifier.
- Releasing Ctrl/Cmd does **not** commit; picks remain visually
  highlighted. **Enter** commits, **Esc** cancels.
- Symmetry-orbit propagation parked as 17.11b follow-up.
- Standard `ctrlKey || metaKey` cross-platform.

**17.11 commit chain (2026-05-07):**
- `9f505a6` — plan + cycle detection (17.11.0).
- `06011b5` — pocket + neighbour vertex exposure (17.11.1+17.11.2).
- `424dee4` — multi-pick state machine (17.11.3).
- `80fbc2c` — completeNGap + Enter to commit (17.11.5+17.11.6).
- `9406ee9` — preview polygon with validity tint (17.11.4).
- `1a64d8f` — progress notes + sign-off probes.
- `b6a2568` — fix: 17.11.7 layer-order (neighbour-vertex clicks).

**Sign-off probes for 17.11.7:**
1. Existing 17.5 chord regression — square + 4 corner triangles → no
   modifier → click 2 adjacent triangle apexes → corner gap fills as
   today (one tile, single click sequence).
2. Enclosed pocket — build a patch with an interior triangular hole
   (3 tiles forming a triangular gap inside the patch). Pocket
   vertices should appear as accent-tinted dots distinct from the
   outer-cycle dots. Ctrl/Cmd-click the 3 pocket vertices in CCW
   order → preview polygon shows accent fill → press Enter → one
   irregular tile fills the pocket. Subsequent click on an outer
   vertex without modifier should start a fresh chord pick (not
   extend the previous multi-pick).
3. Cross-boundary — square or hex patch with one or two corners
   missing → "Show neighbours" on → ghost dots at neighbour stamps'
   outer cycles render at ~0.45 opacity. Ctrl/Cmd-click 1 patch
   vertex + 2 neighbour vertices forming a corner-gap polygon →
   Enter → tile commits with vertices straddling the boundary.
   Strand-mode lattice should show one continuous fill at the
   meeting point (not three sub-pieces).
4. Self-intersection — Ctrl/Cmd-click 4 vertices in a bowtie order
   (2 patch + 2 across) → preview tints red with dashed stroke →
   Enter no-ops → Esc clears.
5. Centroid-inside-tile — Ctrl/Cmd-click 3 vertices that bracket
   tiles (rather than a gap) → preview tints red → Enter no-ops.
6. Duplicate vertex — Ctrl/Cmd-click the same vertex twice →
   preview tints red.
7. Esc cancellation — at any pick depth, Esc clears all picks
   (chord OR multi).
8. Cancel button — at picks.length ≥ 1, Cancel button shows in the
   hint area; click it → all picks cleared.
9. Undo — after a multi-vertex commit, Ctrl/Cmd+Z reverts the
   completed tile (action is in DESIGN_MODE_ACTIONS).
10. Cross-platform — on Mac, Cmd-click engages multi mode the same
    as Ctrl-click on Linux/Windows.

If 17.11.7 finds bugs, fix them as a follow-up commit before sign-off.
After sign-off, delete `project_editor_complete_n_gap.md` from memory
and remove its line from `MEMORY.md` (per memory hygiene rule).

**Parked follow-up:** 17.11b — orbit propagation for multi-vertex
Complete (apply `editor.symmetryMode` to mirror the completed polygon
across the orbit, the way 17.4 mirrors `EDITOR_PLACE_TILE_ON_EDGE`).

Earlier 2026-05-06 — Step 17.4 re-enabled + signed off.
Symmetry-axis subgroup picker (`9015ac0`) plus follow-up fix
(`7be4ef4`) so the polygon picker hides side counts whose orbit
images would fail viability (the original symptom: octagon offered
on a square origin under Full mode, click silently did nothing).
Default mode is `'none'` (legacy 17.3 behaviour); user opts into
`'full' | 'rotation' | 'vertical' | 'horizontal'` via the
`<select>` between Origin sides and Wrap boundary in the Editor
Design controls. Triangle hides "Horizontal mirror" since
equilateral triangles have no horizontal mirror axis. Idea memo
deleted on delivery; plan decision row flipped from archived to
re-enabled. Two related ideas remain captured for future work:
`project_editor_cross_boundary_complete_idea.md` and the new
`project_editor_enclosed_pocket_idea.md` (multi-vertex-gap → one
tile mechanic).

Earlier 2026-05-06 — Lab UI polish: collapsible sections
+ custom Save/Rename modal (`69e1f7b`, fix `9ddb1d5`). All four
sidebar sections (Editor / My Tessellations / Strands / Display)
now have chevron-toggle headers matching Main mode; open/closed
state persists per-section to `lab-sidebar-collapsed-sections` in
localStorage. New `src/components/TextPromptModal.tsx` replaces the
two `window.prompt` calls with an in-app dialog (Esc / backdrop /
Cancel dismiss; Enter to confirm; focus + select on open; empty
input disables confirm). The modal sits at `--bg-elevated` so it
reads opaque against the canvas (initial commit used a non-existent
`--bg` variable that fell through to transparent — fix in
`9ddb1d5`).

Earlier 2026-05-06 — sub-step **17.9** code-complete:
undo / redo (Q12). New `src/editor/history.ts` defines
`DESIGN_MODE_ACTIONS`, `HISTORY_DEPTH = 50`, and
`HISTORY_COALESCE_MS = 500`. New `src/editor/useEditorHistory.ts`
hook wraps the base dispatch — for any action in
`DESIGN_MODE_ACTIONS`, snapshots the prior `EditorConfig` to a `past`
stack (capped at 50, FIFO eviction); consecutive same-type actions
within 500ms coalesce into one entry so a slider drag is one undo
step. `LOAD_CONFIG` clears the entire stack. New action
`EDITOR_RESTORE_SNAPSHOT` (payload `EditorConfig | null`) is the
restore primitive used by undo/redo: when payload is null it drops
`editor` and zeroes `tiling.type`, otherwise it sets `editor` and
re-seeds figures (no `applyWrap` — snapshot already carries its own
boundary size). Strand-mode actions (figure tuning, lacing, curves)
explicitly bypass the stack so flipping back from Strand never
resurfaces stale figure tuning. Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z
(plus Ctrl+Y) bound globally while Lab is mounted; ignored when
focus is in an input/textarea/select so the library Save / Rename
prompts aren't hijacked. `EditorDesignControls` gained an Undo /
Redo header row above the Phase toggle, visible in both phases per
Q12 ("preserved across Design ↔ Strand flips").

Earlier: 2026-05-06 — sub-step **17.8** code-complete:
persistence validation + migration scaffold. New
`src/editor/migrations.ts` exports `migrateEditorConfig(unknown)`:
takes an unvalidated value (from JSON / localStorage), checks shape,
returns a clean `EditorConfig` or `null`. The version dispatch is the
intended hook for future `EditorConfig.version` bumps; only `1` is
valid today. New `src/state/configValidation.ts` exports
`loadPatternConfig(unknown)` + `ConfigValidationError`: validates
`tiling`, `figures`, `lacing`; rejects retired tiling types
(`layered-mandala`, `composition`); routes the optional `editor`
field through `migrateEditorConfig`. `loadJSON` now returns a
validated `PatternConfig` and rejects with a `ConfigValidationError`
on malformed input; `App.handleLoadJSON` surfaces the message via
`window.alert`. `customTessellations.listSavedTessellations` runs
each entry through `loadPatternConfig` and skips bad rows with a
warning so one corrupt entry doesn't blank the whole library.

Earlier 2026-05-06 — UI move: auto-complete checkbox now lives inside
the Mode section's Complete branch; only surfaces when Complete is
selected (`af06d66`). Wrap boundary stays above the Mode toggle since
it applies in both Place and Complete.

Earlier: 2026-05-06 — split 17.7's `match-boundary` flavour
out into a separate design-mode "Wrap boundary" toggle. Auto-complete
keeps its single checkbox (no dropdown) and always runs until-convex
on Design→Strand flip. `EditorConfig.wrapBoundary` is a new optional
flag; when on, `applyWrap` recomputes `boundarySize` to hug the patch
after every tile mutation (place / complete / delete / origin-sides /
boundary-shape / alternate / auto-complete run). Manual drag of the
boundary-size slider clears the flag, so the slider stays meaningful
when wrap is off. New reducer helper `applyWrap(state)` threads the
fit through tile-mutating cases. Type / action changes:
`AutoCompleteFlavor` removed; `SET_EDITOR_AUTO_COMPLETE_FLAVOR`
removed; `SET_EDITOR_WRAP_BOUNDARY` added. `autoCompletePatch` no
longer takes a flavor and returns `{ tiles }` only — `fitBoundarySize`
is the standalone helper for wrap. UI in `EditorDesignControls`:
"Auto-complete on entering Strand editor" + "Wrap boundary"
checkboxes; small caption under the boundary-size slider when wrap
is on ("Driven by Wrap boundary — drag to override.").

Earlier: 2026-05-05 — sub-step **17.7** code-complete:
auto-complete on flip (Decision 11). New `editor/autoComplete.ts`
exports `autoCompletePatch(editor)` and `fitBoundarySize`.
Walks the patch's outer cycle (CCW, via existing
`computeOuterBoundary`), finds the first reflex vertex (cross of
incoming × outgoing edges < 0), and dispatches `completeGap` on the
prev/next neighbours; loops up to 64 passes or until convex.
`EditorConfig` gained an optional `autoComplete?: { enabled }`
field; new reducer actions `SET_EDITOR_AUTO_COMPLETE_ENABLED` and
`EDITOR_RUN_AUTO_COMPLETE`. The latter is idempotent on already-
convex patches. `EditorDesignControls` shows an
"Auto-complete on entering Strand editor" checkbox.
`TessellationLabMode` dispatches `EDITOR_RUN_AUTO_COMPLETE` on the
Design→Strand transition when the opt-in is on. Auto-completed
tiles persist as first-class `'completed'` polygons (Decision 16)
so flipping back to Design leaves them editable / deletable.

Earlier: 2026-05-05 — sub-step **17.6** code-complete in two
parts.

**17.6a (`7056a9f`)** — canonical-signature `tileTypeId` for irregular
tiles per Q11 (Option B): regular `"<n>"`, irregular
`"<n>i:<8-char hex>"` from interior-angles + edge-length-ratios
quantised to 4 d.p., reduced to lex-min cyclic / reflective rotation,
FNV-1a hashed. New `editor/tileTypeId.ts` + `editor/tileTypes.ts`
expose `tileTypeIdFor`, `tileTypeLabel`, `editorTileTypes`,
`seedFiguresForEditor`. Reducer's editor cases all run through a
`seedFigures` helper (Q15: lazy + additive — deletes never strip
figures, so re-placing the same shape restores tuning). Strand panel
in Lab now lists one card per distinct tile type in the patch
("Triangle" / "Square" / … for regulars; "Irregular A/B/C…" for
irregulars in first-seen order).

**17.6b** — strand-editor lattice preview + Design / Strand phase
flip. New `editor/lattice.ts` returns translation-stamps covering the
viewport for square (basis (L,0)/(0,L)) and hex (basis (√3·L,0) /
(√3·L/2, 1.5L)). Triangle defers to a follow-up (needs 2-orientation
alternation); strand mode on a triangle boundary shows a single
stamp with an explanatory note. `usePattern` accepts an
`editorStrandMode` flag; when on, it generates polygons by stamping
`editorTilesToPolygons` at every lattice translation, runs PIC over
the whole stamped set, and returns no `boundaryOutline`. `Canvas`
hides the edge / vertex / picker overlays in strand mode.
`TessellationLabMode` owns a `editorPhase: 'design' | 'strand'`
flag (UI-only); `EditorDesignControls` shows a Design / Strand
editor toggle at the top, and in strand phase replaces the design
rows with a hint card.

Earlier: 2026-05-05 — sub-step **17.5** code-complete:
manual Complete operation. Single-gap version (no orbit propagation
since 17.4 is parked). New `editor/boundary.ts` walks exposed edges
into a CCW outer-boundary cycle. New `editor/complete.ts` resolves
the gap between two picked vertices by trying both arcs and keeping
the one whose chord-and-arc polygon's centroid is **outside** the
patch (handles concavities + rejects convex-side chords); then
prefers a regular-polygon fit (sides + angles within tolerance) and
falls back to an irregular `EditorIrregularTile` per Decision 10/12.
New reducer action `EDITOR_COMPLETE_GAP` (payload `{pA, pB}`). New
`EditorVertexLayer` SVG layer of clickable boundary dots; `Canvas`
swaps it in for the edge layer when `editorMode === 'complete'`.
Editor section now has a Place / Complete mode toggle + a hint
caption, with Esc / Cancel to drop a half-completed pick. Acceptance
probe: square origin + 4 placed triangles → switch to Complete, click
two adjacent triangle apexes → corner gap fills with an isosceles
(irregular) tile.

Earlier same day — boundary-size + origin-sides UX
follow-ups. Per-shape default boundary edge lengths
(`DEFAULT_BOUNDARY_SIZE_BY_SHAPE = { triangle: 460, square: 400,
hexagon: 200 }`) so all three boundaries read at a comparable visual
scale; slider max bumped 500 → 800. `SET_EDITOR_BOUNDARY_SHAPE` now
also snaps `boundarySize` to the new shape's default (consistent
with the existing tile-reset semantics). Origin-sides slider is
greyed out and labelled "Locked — clear the patch to change the
origin shape" once any tile beyond the origin has been placed, so a
stray drag can't wipe the patch.

Earlier same day: sub-step **17.4 archived** the same
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

**2026-05-06 — Step 17.4 re-enabled + signed off** (`9015ac0` +
fix `7be4ef4`). Restored `src/editor/symmetry.ts` +
`src/editor/orbit.ts` from `archive/editor-orbit-17.4/` and
parameterised `boundarySymmetries(shape, mode)` with the new
`SymmetryMode` = `'full' | 'rotation' | 'vertical' | 'horizontal'
| 'none'`. Default on `editor.symmetryMode` is absent → reads as
`'none'` (current 17.3 single-edge behaviour) so legacy patches
load unchanged. Reducer's `EDITOR_PLACE_TILE_ON_EDGE` and
`EDITOR_DELETE_TILE` route through `placeTilesOnOrbit` /
`orbitTileIds` when mode ≠ none; orbit-aware delete filters the
origin tile out defensively. Picker UI in `EditorDesignControls`
is a `<select>` between Origin sides and Wrap boundary;
"Horizontal mirror only" is hidden for triangle (no horizontal
mirror axis on an equilateral triangle).
`SET_EDITOR_SYMMETRY_MODE` is a design-mode action so undo/redo
covers it. Follow-up fix (`7be4ef4`): `viableSidesForEdge` in
`orbit.ts` runs an orbit-wide probe so the picker hides side
counts whose orbit images would fail viability — replaces the
silent-fail behaviour the user hit on octagon-into-square. Plan
doc decision row for 17.4 flipped from archived to re-enabled.
Idea memo `project_editor_symmetry_axes_toggle_idea.md` deleted
(DELIVERED).

**2026-05-06 — Steps 17.6c + 17.6d signed off.**

**17.6c — Triangle strand-mode lattice.** `editorLatticeStamps`
now handles triangle via a 2-orientation cell (source + 180°-flipped),
basis derived from boundary edge midpoints (handles
`alternateBoundary` for free). `usePattern`'s strand-mode stamping
applies stamp rotation around the patch centroid before translation,
for polygons and the optional boundary-lattice outlines.
`supportsLatticePreview` returns true for all shapes now.

**17.6d — Design-mode neighbour preview.** "Show neighbours" toggle
in Editor Design controls renders one ring of low-opacity ghost
stamps around the patch. `editorOneRingNeighbourStamps` returns 8
offsets for square, 6 for hex, 3 for triangle (the edge-shared
down-triangles flipped 180°). Two sub-toggles when on: "Show
boundaries" (ghost outlines via `boundaryOutlines`) and "Show
strands" (ghosts join the PIC input so strands flow across stamp
edges). Disabled while `wrapBoundary` is on (boundary moves mid-edit).
Standalone preview; cross-boundary Complete fill (the 17.5b idea)
stays parked but is easier to plan for now that gaps are visible.

**2026-05-06 — Main "My Patterns" library shipped + signed off.**
Reversed plan decision #10. New `state/configLibrary.ts` factory
(storage-key parameterised) backs both libraries.
`state/customTessellations.ts` became a thin wrapper using
`lab-tessellations-v1`; new `state/mainConfigs.ts` wraps
`main-configs-v1` so namespaces stay separate. UI lifted into
`components/ConfigLibraryPanel.tsx` and plugged into both Lab's
"My Tessellations" and Main's new "My Patterns" sidebar section
(between Display and Export). Panel takes a controlled `activeId`
so external resets — Lab's Clear / New / Sample, Main's Load JSON
— can wipe selection.

**17.9 signed off 2026-05-06** — undo/redo confirmed working.

**2026-05-06 — sub-step 17.10 code-complete: non-tiling patch
detection + UI tag.** New `src/editor/nonTilingDetection.ts`
exports `detectPatchTilingStatus(editor)` — shoelace-area compare
of `computeOuterBoundary` vs `editorBoundaryVertices` with a 1%
relative tolerance. Returns `{ kind: 'tiling' }` or
`{ kind: 'non-tiling', reason: 'underfills' | 'overflows' | 'empty' }`.
`TessellationLabMode` renders a small `NonTilingWarning` block
inside the strand-mode info card when the status is non-tiling
("Patch doesn't fill the boundary — stamped copies will leave
gaps." / "Patch extends past the boundary — stamped copies will
overlap."). Diagnostic only; no auto-fix per scope. This is the
last v1 sub-step — Step 17 v1 complete pending visual sign-off.

**Next action:** Step 17 v1 is feature-complete. All shipped
sub-steps (17.0–17.10, plus 17.4 re-enabled) are signed off
through 2026-05-06. Pick-up options for the next session, in
rough priority order (no commitment yet):

1. **Cross-boundary Complete fill** + **enclosed-pocket Complete
   fill** (`project_editor_cross_boundary_complete_idea.md` +
   `project_editor_enclosed_pocket_idea.md`). Captured as related
   ideas — both about resolving multi-vertex gaps as a single
   irregular tile rather than as N pieces. Co-design recommended.
2. **Step 15** k-uniform tiling generator (parked).
3. **Step 16** quasi-periodic tilings (parked).
4. **Step 18** Girih substitution (parked).
5. Other Lab UX or strand-rendering polish — open list.

17.8 sign-off probes (carried forward — confirm before 17.9 sign-off):
1. Save 3 patches across categories → reload → all persist.
2. Save → load JSON round-trips wrap/auto-complete flags.
3. Devtools-corrupt one library row → bad row skipped on reload.
4. Import unrelated JSON → friendly alert.

17.7 sign-off probes (2026-05-06) — confirmed working:
- Auto-complete checkbox alone fills concave dents on flip.
- Wrap boundary toggle on → boundary hugs patch live in Design.
- Build out tiles with wrap on → boundary follows.
- Drag boundary-size slider with wrap on → wrap clears, slider takes
  over.

After 17.7 sign-off:
1. New square patch + a few placed tiles → flip to Strand editor →
   patch should appear stamped on a square grid covering the viewport.
   Strand panel cards drive global strand tuning.
2. Hex patch with placed tiles → strand mode → hex lattice stamping.
3. Triangle patch → strand mode → single stamp with the deferred-lattice
   notice.
4. Place a tile in design mode, flip to strand, edit contact angle,
   flip back to design — the figure tuning should persist (Q15
   stickiness).
5. Build a patch with one irregular completed tile and one regular
   placed tile → strand panel should list both as separate cards
   ("Irregular A" + "Triangle" or similar).

**17.5 deferred items still in 17.6a:** none — canonical-hash + lazy
seeding shipped here. **17.6c follow-up:** triangle 2-orientation
lattice (alternating up/down stamps). Will file as `/idea` if you want
to formally park it.

Visual sign-off on 17.5 probes:
1. New square + place 4 triangles on its edges → Complete mode →
   pick two adjacent triangle apexes (across one corner) → the
   corner gap fills.
2. Repeat the click for the other 3 corners → all 4 corners filled.
3. Hex origin + place 6 triangles → Complete the corner gaps.
4. Convex chord (pick two non-adjacent vertices on a still-convex
   patch) → no fill (gap centroid is inside the patch, rejected).
5. Pick a vertex twice → cancels the pick (no fill).
6. Cancel button + Esc both reset the half-completed pick.

Strand rendering on irregular completed tiles will look provisional
until 17.6 (canonical-signature hash + per-polygon synthetic
figures-map). That's deferred and expected.

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
- [done] **Step 17 v1** — user-editable tessellation editor. 17.0–17.10 shipped + signed off. 17.4 re-enabled 2026-05-06 behind the `SymmetryMode` subgroup picker.
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
  originSides, edgeLength, autoComplete?, wrapBoundary?, tiles:
  EditorTile[] }`. `EditorTile` is a
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
