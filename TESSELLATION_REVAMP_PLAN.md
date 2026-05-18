# Tessellation Revamp — Action Plan (v4)

**Branch:** `feat/art-deco-egypt-theme-revamp`
**Owner:** TheHJRBean
**Started:** 2026-04-25  ·  **Re-scoped:** 2026-04-26 (terminology) ·  **Restructured:** 2026-04-26 (Option B) ·  **Pivoted:** 2026-05-03 (mandala + composition scrapped) ·  **Renewed:** 2026-05-03 (v4 — Step 17 promoted to first-class plan content from grill-me decisions) ·  **Sub-step 17.0 resolved:** 2026-05-03 (Q9–Q15 grilled — see Resolved deferred questions below)

**Status anchor:** see `SESSION_STATE.md` for current progress.

> **2026-05-03 v4 renewal.** The previous iteration's mandala / composition
> work has been archived (see Working log + `archive/tessellation-lab/`).
> Step 17 (user-editable tessellation editor) is the active focus and
> has been fully grilled — its design is now first-class plan content,
> with a derived sub-step breakdown. Conservative-default registers
> (E-1..E-9, MQ/CG/FS/MS/CS/ID/LX) tied to the archived features have
> been removed; the remaining open questions for Step 17 are listed
> as deferred grill items (Q9–Q15).

---

## Terminology

> **Superseded 2026-05-16.** The canonical glossary moved to `CONTEXT.md` after a full vocabulary-alignment session. The old "Terminology (locked)" table that lived here used **Tessellation** for what is now **Tiling**, **Boundary** for what is now **Cell** (the polygon — `Boundary` is now reserved for the closed perimeter of a Cell), and **Repeat** for one stamping of the Patch via the **Lattice**. Use the new terms going forward. Key locked decisions are captured in `docs/adr/0001` (Patch always has Cells), `docs/adr/0002` (Complete, not Fill), and `docs/adr/0003` (Phase sequence).

For reference, the legacy → new mapping for this doc's vocabulary:

| Legacy in this plan | New (CONTEXT.md) |
|--|--|
| Tessellation (the polygon layer) | **Tiling** |
| Boundary (the lattice cell) | **Cell** (the cell's perimeter is the **Boundary**) |
| Patch | **Patch** (now always holds Cells; single-cell patches included) |
| Repeat (one stamping) | one stamp via the **Lattice** |
| Strand editor / strand-editor mode | **Composition** Phase |
| Design mode | **Design** Phase |
| Main mode | **Gallery** |
| Tessellation Lab | **Builder** (inside the **Lab**) |
| Origin tile | **Seed Tile** |
| Line (in strand controls) | **Ray** |

Internal code identifiers (e.g. `EditorPatch`, `BoundaryTile`, `lineLength`, `originSides`) still use legacy names; structural renames are queued behind the migration in ADR-0001.

---

## Approach (current)

**Conservative-first.** Reliability over features.

**Lab-resident workflow.** Custom tessellations live and are edited in
the Lab. Archimedean and rosette-patch tessellations remain Main's
domain (they already work there). The Lab absorbs anything novel.
**There is no "promote to Main" bridge** — the structural mismatch
between Main's per-tile-type strand model and the Lab's emerging needs
makes that bridge expensive and bug-prone.

**Editor as the active surface.** Phases A + B + C have shipped (or
been archived). All remaining work is the user-editable tessellation
editor (Step 17). The Lab UI shell has an "Editor" section placeholder
where it docks.

---

## Architectural decisions (still in force)

These decisions survived the 2026-05-03 pivot and remain authoritative.
Numbers are not contiguous with the original v3 list — only the
still-relevant ones are kept.

1. **Tessellation Lab is a separate mode** so it doesn't disturb Main.
   Lab UI: header, Editor section (Step 17), Tessellation picker,
   "My Tessellations" library, Strands panel, Display section.
2. **State isolation.** Lab uses its own `PatternConfig` instance lifted
   to `App.tsx`; Main state is preserved across mode toggles.
3. **Tessellation-first rendering in Lab.** Lab canvas always renders
   the polygon tessellation. Strand overlay is opt-in via the
   "Show strands" toggle (off by default).
4. **Lab-resident custom tessellations.** Specialised renderers per
   category live exclusively in Lab. **No Main-mode bridge.**
5. ~~**Library is Lab-only**, persisted to `lab-tessellations-v1`~~
   **REVERSED 2026-05-06.** Both modes have an in-app library; Lab uses
   `lab-tessellations-v1` and Main uses `main-configs-v1` (separate
   namespaces). Implementation lives in `state/configLibrary.ts`
   (factory keyed by storage key). Existing JSON `saveJSON` /
   `loadJSON` remains the canonical share format for cross-machine
   transfer.
6. **`TilingCategory` = `'archimedean' | 'rosette-patch'`** in the
   live tree post-pivot. Step 17 will introduce a third category
   (`'editor'` or similar — name TBD at 17.1).

---

## Completed work (compressed)

| Step  | Title                                                  | Status     | Notes |
|-------|--------------------------------------------------------|------------|-------|
| 1     | Tessellation Lab scaffold                              | ✅ done    | Lab toggle, independent `PatternConfig`. |
| 2     | Port existing tessellations into Lab                   | ✅ done    | All 16 tessellations grouped by fold. |
| 3     | Hexadecagonal-rosette tessellation (16-fold)           | ✅ done    | New 16-fold entry; awaiting visual sign-off in browser. |
| 4–8   | Preset catalogue, mandala engine + presets, composition + presets | 🗄 archived 2026-05-03 | See `archive/tessellation-lab/`. |
| 9     | Lab polish (persistence, outline weight, fill on hover) | ✅ done   | `lab-state-v1` localStorage. |
| 10    | Lift `FigureControls` into a shared component          | ✅ done    | Pre-req for Step 11. |
| 11    | Strand controls in Lab for archimedean / rosette-patch | ✅ done    | Trimmed Lab variant. |
| 12–13 | Mandala + composition strand renderers                 | 🗄 archived 2026-05-03 | Trivial-match composition pairs verified before archive. |
| 14    | Lab-local library (Save / Rename / Delete / Duplicate) | 🟡 code-complete | `state/customTessellations.ts`, `lab-tessellations-v1`. |

**Reusable bits in `archive/tessellation-lab/`** (lift back as needed):
- Regular polygon vertex generator (`regularPolygonVertices(n, radius, phi)`).
- Per-polygon synthetic figures-map pattern (unblocks PIC over non-uniform
  tile sets — required for Step 17's irregular Complete-fills).
- Even-odd `clipPath` viewport-minus-polygon technique.

---

## ⭐ Step 17 — User-editable tessellation editor (PRIMARY FOCUS)

**Status (2026-05-07):** Step 17 v1 signed off (17.0–17.10, plus
17.4 re-enabled 2026-05-06). **Step 17 v2 sub-step 17.11**
(multi-vertex Complete — cross-boundary + enclosed pocket) shipped
+ signed off the same day. The merged tracking memo
`project_editor_complete_n_gap.md` deleted on delivery.
Open follow-ups: chord-mode click-on-neighbour silently no-ops
(needs auto-promote-to-multi or modifier-required UX); the
PatternSVG layer-order fix that unblocks neighbour Ctrl/Cmd-clicks
landed in the same chunk and is awaiting browser confirmation.
The `archive/editor-orbit-17.4/` directory remains as historical
reference; `src/editor/symmetry.ts` and `src/editor/orbit.ts` are
the live versions.

### Vision (refined from 2026-05-03 grill)

The user picks a **boundary shape** (the wallpaper lattice cell) and
an **origin polygon** placed at its centre. They build a **patch**
outward by highlighting a tile and adding regular polygons to its
edges. Placements propagate symmetrically under the boundary's rotation
/ reflection group. A vertex-driven **Complete** operation closes
concavities. When the user is done designing, a toolbar toggle flips
into **strand editor mode**, which stamps the patch on the boundary's
translation lattice across the viewport and exposes strand controls.

### Locked design decisions

Captured during the live `/grill-me` session on 2026-05-03. Q-numbers
reference the in-session question order. **These are authoritative for
the implementation phase.**

#### Geometric model

| #  | Decision                                                                                                                                        | Source |
|----|-------------------------------------------------------------------------------------------------------------------------------------------------|--------|
| 1  | **Repeat = wallpaper-style stamp** of a finite patch on a translation lattice.                                                                  | Q1     |
| 4  | **Boundary shape ∈ {triangle, square, hexagon}** in v1 (parallelograms TBD).                                                                    | Q4     |
| 5  | **Boundary = lattice cell, no clipping.** Tiles can poke outside; neighbouring stamps may visually overlap.                                     | Q3     |
| 6  | **Origin polygon auto-placed at boundary centre.**                                                                                              | Q5a    |
| 14 | **All user-placed tiles are regular n-gons; new tile's edge length = the originating tile's edge length** (= one global edge length per patch). | Q7     |

#### Tileability

| # | Decision                                                                                                                                            | Source |
|---|-----------------------------------------------------------------------------------------------------------------------------------------------------|--------|
| 2 | **Tileability is not enforced.** Non-tiling patches → preview shows a single floating unit + UI tag explaining why. "Fill gaps" tool parked.        | Q2     |
| 3 | **Stamp spacing = boundary size**, user-controlled.                                                                                                 | Q2     |

#### Construction model

| #   | Decision                                                                                                                                                                                                              | Source        |
|-----|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|---------------|
| 7   | **Viable polygon = any regular n-gon** with edge-length matching the chosen edge AND not geometrically overlapping any existing tile. Equivalent to "vertex angle sum ≤ 360° at every shared vertex".                 | Q5b           |
| 8   | **Placements propagate under the boundary's symmetry orbit.** Click an edge → polygon goes on that edge AND all rotation/reflection equivalents.                                                                      | Q5c           |
| 14a | **Placement is forbidden on exposed edges whose length ≠ origin's edge length.** Such non-conforming edges (introduced by irregular Complete-fills) only participate via coincidental adjacency or further Complete.  | Q7 follow-up  |

#### Complete operation

| #  | Decision                                                                                                                                                                                                                                                                                                                                | Source |
|----|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------|
| 9  | **Vertex-pair-driven.** User selects an adjacent pair of outer vertices; Complete fills the gap with a polygon that fits exactly. Propagates to all orbit-equivalent vertex pairs.                                                                                                                                                      | Q6     |
| 10 | **Prefers a regular polygon that fits the gap exactly; falls back to an irregular polygon** (bowtie, kite, etc.) shaped to the gap geometry if no regular fits. Irregular tiles only ever come from Complete. *Implication:* PIC must handle non-regular polygons — pull the per-polygon synthetic figures-map pattern from the archive. | Q6a    |
| 11 | **Manual button by default**, with an opt-in *auto-complete-all* on entering the strand editor. Two flavours: (i) **auto-until-convex** — iterate until outline has no concavities; (ii) **auto-match-boundary** — iterate until outline matches boundary polygon, **resizing the boundary** if needed.                                  | Q6b/c  |
| 12 | **Completed tiles are first-class polygons** — same data model as user-placed tiles; their exposed edges are usable for further building. Complete is essentially a vertex-driven shortcut for placing a tile.                                                                                                                          | Q6d    |

#### Workflow

| #  | Decision                                                                                                                                                  | Source |
|----|-----------------------------------------------------------------------------------------------------------------------------------------------------------|--------|
| 15 | **Mode flip = single toolbar toggle** (Design / Strand editor) in the editor header.                                                                      | Q8a    |
| 16 | **Free flip both directions; auto-completed tiles persist on flip-back** as editable. Re-entering strand editor re-runs auto-complete on new concavities. | Q8b    |
| 17 | **Strand editor mode shows the infinite lattice** filling the viewport (re-uses Main's pan/zoom). Strand controls apply globally across the lattice.      | Q8c    |

### Parked (saved as `/idea` memory files)

Each entry in `MEMORY.md`'s `## Ideas / Future` section. Implementation
is explicitly out of scope for v1 — the editor v1 ships with these as
follow-ups.

- **Editor — custom (non-tiling) boundary shapes** (`project_editor_custom_boundary_idea.md`)
- **Editor — per-edge polygon placement** (`project_editor_per_edge_placement_idea.md`)
- **Editor — nested authoring layers** (`project_editor_nested_layers_idea.md`)
- Tile sharing / boundary bisection across stamps (note in this plan,
  not yet a separate `/idea` file — capture before implementation).
- "Fill gaps" tool for non-tiling patches (note in this plan).

### Resolved deferred questions (2026-05-03 grill, sub-step 17.0)

Q9–Q15 grilled in a follow-up `/grill-me` session on 2026-05-03.
Resolutions are authoritative for the implementation phase.

| #   | Topic                          | Resolution                                                                                                                                                                                                                                                                                                                              |
|-----|--------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Q14 | v1 acceptance bar              | **Cut C** — plan's working-draft bar (boundary + origin + single-edge placement + orbit propagation + Complete + strand flip + lattice preview + persistence). Sub-steps 17.1–17.6 + 17.8. Reliability prioritized over scope cuts; each sub-step lands behind a green build with a manual visual check.                              |
| Q13 | Persistence shape              | **Option C** — `editor?: EditorConfig` on `PatternConfig`; `EditorConfig` carries inner `version: 1`. `SavedTessellation.sourceCategory` extends to `'archimedean' \| 'rosette-patch' \| 'editor'`. `lab-tessellations-v1` outer version unchanged. `saveJSON` / `loadJSON` round-trips for free.                                       |
| Q9  | Boundary-resize behaviour      | **Option B** — slider rescales only the lattice cell; existing tiles untouched. Shrinking past patch extent allowed (consistent with Decision 5's no-clip stance — stamps just overlap more in lattice preview).                                                                                                                       |
| Q10 | Viable-polygon picker UX       | **A2 + B1** — every exposed edge is always live in Design mode (hover highlights, click selects); floating popover at clicked edge midpoint with icon buttons. Picker n-range: {3, 4, 5, 6, 7, 8, 9, 10, 12}. Filter: viable only. Empty-state message when nothing fits. Non-conforming edges (length ≠ origin's) rendered dashed and inert with tooltip. |
| Q11 | PIC tile-type identity         | **Option B (full canonical signature)** — regular: `tileTypeId = "<n>"`. Irregular: `"<n>i:<8-char hash>"` derived from `[interior_angles[], edge_length_ratios[]]` quantized to 4 d.p., cyclically rotated and reflected to lex-min, hashed. Display labels: "Triangle" / "Square" / … / "n-gon" for regular; "Irregular A/B/C…" first-seen order for irregular. Per-polygon synthetic figures-map helper from `archive/tessellation-lab/` lifted at 17.5. |
| Q15 | Strand-state retention         | `config.figures` is **sticky and additive across flips**. New tile types lazily seeded with default `FigureConfig` (`star`, contactAngle 60°, autoLineLength true). Orphaned figures retained on tile removal — re-placing the same shape restores the user's tuning.                                                                  |
| Q12 | Undo / redo                    | **Snapshot-based** on `EditorConfig`. Depth cap 50. Scope: design-mode mutations only (strand-mode tuning is not on the stack). Preserved across design ↔ strand flips. Cleared on session end / library load (not on Save). Keyboard: `Ctrl/Cmd+Z` and `Ctrl/Cmd+Shift+Z`; header buttons reflect stack state.                          |

### Sub-step breakdown

Drafted from the locked decisions and refined by the 17.0 grill (see
"Resolved deferred questions"). Each sub-step ends with `npm run build`
green and a manual visual check. Deferred-Q references are now
cross-references to the resolutions table.

| Sub-step | Title                                            | Size | Decisions | Resolved Q's |
|----------|--------------------------------------------------|------|-----------|--------------|
| **17.0** | Pre-implementation grill for Q9–Q15.             | S    | n/a       | ✅ all       |
| **17.1** | `EditorConfig` data model + read-only render.    | S–M  | 1, 4, 6, 14 | ✅ Q13       |
| **17.2** | Boundary picker + size slider + origin picker (Design mode shell). ✅ shipped `f9d6197`. | M | 4, 5, 6 | ✅ Q9 |
| **17.3** | Click-to-highlight + viable-polygon picker (single edge, no propagation yet). ✅ shipped `ccc7da0`. | M | 7, 14, 14a | ✅ Q10 |
| **17.4** | Orbit-symmetric propagation on placement. ✅ **re-enabled 2026-05-06** behind a `SymmetryMode` subgroup picker (none / full / rotation / vertical / horizontal). Default `'none'` keeps 17.3 single-edge behaviour for legacy patches. | M | 8 | — |
| **17.5** | Complete operation — manual vertex-pair selection. ✅ code-complete (canonical tile-type hash deferred to 17.5b / 17.6). | M | 9, 10, 12 | Q11 |
| **17.6** | Strand editor mode + lattice preview + strand controls. ✅ a + b code-complete (triangle-lattice 2-orientation alternation deferred to 17.6c). | M | 15, 16, 17 | Q11, Q15 |
| **17.7** | Auto-complete-on-flip (until-convex). Boundary fitting split out as a separate **Wrap boundary** design-mode toggle. ✅ shipped. | M | 11 | — |
| **17.8** | Persistence validation + migration scaffold for `EditorConfig`. ✅ code-complete. | S–M | 5 | Q13 |
| **17.9** | Undo / redo. ✅ code-complete.                   | S–M  | —         | Q12          |
| **17.10**| Non-tiling patch detection + UI tag.             | S    | 2         | —            |
| **17.11**| Multi-vertex Complete (cross-boundary + enclosed pocket). ✅ shipped 2026-05-07; user signed off on enclosed-pocket + chord-regression + UI guidance. Open follow-ups: chord-mode + neighbour-vertex picks silently no-op (auto-promote-to-multi or explicit modifier-required UX TBD); neighbour-click selection awaits browser confirmation that the layer-order fix landed. | M | 9, 10, 12 | — |
| **17.11b**| Orbit propagation for multi-vertex Complete. ✅ shipped + signed off 2026-05-07. | S | 8 | — |
| **17.12**| Boundary-inward authoring mode (single-shape v1). 🚧 In flight — A shipped 2026-05-11 (`8c935a2`); B shipped 2026-05-18; C (UI) pending. | M | 14, 14a | — |

**Sub-step detail.**

- **17.0 — Pre-implementation grill.** ✅ Resolved 2026-05-03. See
  "Resolved deferred questions" table above.

- **17.1 — Data model + read-only render.** ✅ Shipped 2026-05-03
  (`e199aee`). `EditorConfig` (`version: 1`, boundaryShape, boundarySize,
  originSides, edgeLength, tiles[]) lives in `src/types/editor.ts`.
  `tiles[]` is a single tagged-union array (`EditorRegularTile` |
  `EditorIrregularTile`) with an `origin: 'origin' | 'placed' |
  'completed'` discriminator (Decision 12 keeps completed tiles
  first-class). `editor?: EditorConfig` hung off `PatternConfig`
  (Q13 Option C). Helpers: `regularPolygonVertices` (edge-length
  parameterised per Decision 14), `editorTilesToPolygons` +
  `tileTypeIdFor` (`"<n>"` for regulars; provisional placeholder for
  irregulars until 17.5). `usePattern` editor branch dispatches when
  `tiling.type === 'editor'` and skips viewport quantisation since the
  patch is finite. `SavedSourceCategory` extended to include `'editor'`.
  Lab Editor section gains Show sample patch / Clear buttons that
  `LOAD_CONFIG` a hand-built fixture (square + 4 triangles flush to
  each edge). Visually signed off.

  Follow-up `94f651c` removed the standard tessellation Type dropdown,
  Scale slider, Reset button, and Info panel from the Lab — the Lab is
  now editor-only.

- **17.2 — Design mode shell.** ✅ Shipped 2026-05-04 (`f9d6197`).
  Three controls in the Editor section: 3 boundary-shape buttons
  (Triangle / Square / Hexagon), boundary-size slider 80–500,
  origin-sides slider 3–12. Q9 resolved as Option B — boundary
  size only rescales the outline, tile sizes are untouched.
  Origin polygon auto-places at the patch centre (rotation 0,
  default edgeLength 100) per Decision 6. New reducer actions
  (`EDITOR_NEW`, `EDITOR_CLEAR`, `SET_EDITOR_BOUNDARY_SHAPE`,
  `SET_EDITOR_BOUNDARY_SIZE`, `SET_EDITOR_ORIGIN_SIDES`); knob
  handlers no-op when no patch is active. Boundary outline
  surfaces from `usePattern` via `PatternData.boundaryOutline`
  and renders as a non-interactive dashed accent polygon under
  tiles in `PatternSVG`. Helpers: `createDefaultEditorConfig`,
  `createOriginTile`, `editorBoundaryVertices`, `BOUNDARY_SIDES`.
  Awaiting visual sign-off.

- **17.3 — Tile selection + viable-polygon picker (single edge).**
  ✅ Shipped 2026-05-04 (`ccc7da0`). Per-tile edge highlighting was
  refined to Q10's authoritative form: every exposed edge is always
  live, hover highlights, click selects. New helpers in
  `src/editor/`: `computeExposedEdges` (loose-eps endpoint match for
  unshared edges; carries `conforming` flag for Decision 14a),
  `placeRegularNGonOnEdge` (new tile's vertex 0 = source's p2, vertex
  1 = source's p1 — CCW reverse, by construction), `isPlacementViable`
  (Decision 7: interior-angle sum at the two shared endpoints ≤ 2π;
  short-circuits on non-conforming edges), `viableSidesForEdge`
  filtering `PICKER_SIDES = {3, 4, 5, 6, 7, 8, 9, 10, 12}`. UI:
  `EditorEdgeLayer` lives inside `PatternSVG`'s rotation `<g>` via a
  new `editorOverlay?: ReactNode` slot — invisible thick hit-area per
  edge, pointer-down stops propagation so pan doesn't fire;
  non-conforming edges render dashed and inert. `EditorPickerOverlay`
  is a screen-space HTML popover anchored at the world midpoint via
  a new `worldToScreen` helper in `Canvas` that respects pan, zoom
  and rotation. Picker shows 9 n-gon icon buttons (disabled when not
  viable) plus an empty-state message; closes on Escape. New reducer
  action `EDITOR_PLACE_TILE_ON_EDGE` re-validates and appends a
  placed tile. Awaiting visual sign-off.

- **17.4 — Orbit propagation.** 🗄 **Archived 2026-05-05** —
  implementation built (`e30fdb9`) and then parked the same day. The
  user tried full-D_n orbit propagation in the browser, didn't like
  how it felt, and wasn't yet sure what alternative they wanted. Code
  preserved verbatim under `archive/editor-orbit-17.4/` (`symmetry.ts`,
  `orbit.ts`, restoration notes in `README.md`). Reducer reverted to
  17.3's single-edge behaviour. Re-enabling propagation should be
  bundled with the symmetry-axis subgroup picker captured in
  `project_editor_symmetry_axes_toggle_idea.md` — propagation
  shouldn't ship as full-D_n-by-default again.

- **17.5 — Complete operation (manual).** ✅ Code-complete 2026-05-05.
  Single-gap version since 17.4's orbit propagation is archived; the
  user picks two outer-boundary vertices and one gap fills per pick
  rather than the orbit-equivalent set. New `editor/boundary.ts`
  walks `computeExposedEdges` into a CCW vertex cycle.
  `editor/complete.ts` chooses between the two arcs (CCW / CW) by
  picking the one whose chord-and-arc polygon's centroid is *outside*
  every existing tile — handles concavities and rejects convex-side
  chords. `tryRegularFit` accepts the gap as a regular n-gon iff all
  sides match within `max(EDITOR_EPS·100, edge·1e-4)` and all interior
  angles match within `1e-4` rad; otherwise falls back to an irregular
  tile (Decision 10) stored as `EditorIrregularTile` (Decision 12).
  Reducer action `EDITOR_COMPLETE_GAP` payload `{pA, pB}` (Vec2-based
  so a vertex can be identified by position alone). UI: new
  `EditorVertexLayer` of clickable boundary dots, swapped in by
  `Canvas` when `editorMode === 'complete'`; `EditorDesignControls`
  gained a Place / Complete toggle + hint caption + Cancel / Esc.
  **Deferred:** the canonical-signature `<n>i:<8-char hash>` for
  irregular `tileTypeId` (currently the provisional placeholder from
  17.1) — to be lifted from `archive/tessellation-lab/` at 17.5b /
  17.6 alongside the per-polygon synthetic figures-map needed for PIC
  to draw nice strands on irregular tiles.

- **17.6 — Strand editor mode + lattice preview.** Toolbar toggle in
  editor header (Decision 15). Strand editor renders the patch tiled
  across viewport on the boundary's lattice (Decision 17). Free flip
  back (Decision 16). Re-use the existing Lab strand panel (from
  Step 11). Resolve Q11 and Q15 first. Acceptance: build a patch, flip
  to strand editor, see it tiled with strands. Flip back, edit, flip
  again, strands re-render correctly.

- **17.7 — Auto-complete on flip + Wrap boundary.** ✅ Shipped
  2026-05-05; flavour split refactored 2026-05-06.
  Optional `autoComplete?: { enabled }` on `EditorConfig`
  (back-compat: absent = disabled). New `editor/autoComplete.ts` with
  `autoCompletePatch(editor)` + `fitBoundarySize(editor)`.
  Auto-complete loops on the patch's CCW outer cycle, finds the first
  reflex vertex (cross of incoming × outgoing edges < 0) and
  dispatches `completeGap(prev, next)`; capped at 64 passes for
  termination. New reducer actions `SET_EDITOR_AUTO_COMPLETE_ENABLED`,
  `EDITOR_RUN_AUTO_COMPLETE` (latter is idempotent on already-convex
  patches). `EditorDesignControls` exposes a single checkbox.
  `TessellationLabMode` dispatches `EDITOR_RUN_AUTO_COMPLETE` on the
  Design→Strand transition when the opt-in is on. Auto-completed tiles
  are first-class `'completed'` polygons (Decision 16) and remain
  editable on flip-back.

  **Wrap boundary** (the former `match-boundary` flavour) is now its
  own design-mode mode: `EditorConfig.wrapBoundary` flag + new action
  `SET_EDITOR_WRAP_BOUNDARY`. When on, a reducer-level `applyWrap`
  helper recomputes `boundarySize = fitBoundarySize(editor)` after
  every tile-mutating case (place / complete / delete / origin-sides /
  boundary-shape / alternate / auto-complete run). Manual drag of the
  boundary-size slider clears the flag so the slider remains
  meaningful when wrap is off. UI: a second checkbox below
  auto-complete; small caption under the boundary-size slider when
  wrap is engaged ("Driven by Wrap boundary — drag to override.").

- **17.8 — Persistence.** ✅ Code-complete 2026-05-06.
  `EditorConfig` already round-tripped through localStorage / JSON for
  free (since `config` is JSON-serialised wholesale), so 17.8's actual
  scope was **load-time validation + migration scaffold**. New
  `src/editor/migrations.ts` exports `migrateEditorConfig(unknown)` —
  the version dispatch hook for future `EditorConfig.version` bumps.
  Validates shape, returns `null` on bad input. New
  `src/state/configValidation.ts` exports `loadPatternConfig` +
  `ConfigValidationError`: validates `tiling`/`figures`/`lacing`,
  rejects retired tiling types, routes the optional `editor` field
  through `migrateEditorConfig`. `loadJSON` validates on import;
  `customTessellations.listSavedTessellations` skips bad rows with a
  console warning so a single corrupt entry doesn't blank the
  library. `App.handleLoadJSON` surfaces validation errors via
  `window.alert` rather than silently logging.

- **17.9 — Undo / redo.** ✅ Code-complete 2026-05-06. Snapshot-based
  on `EditorConfig` (Q12). New `src/editor/history.ts` exposes
  `DESIGN_MODE_ACTIONS`, `HISTORY_DEPTH = 50`, and
  `HISTORY_COALESCE_MS = 500`. New `src/editor/useEditorHistory`
  hook wraps the base dispatch — design-mode actions push the prior
  `EditorConfig` to a `past` stack (capped, FIFO eviction), and
  consecutive same-type actions within 500ms coalesce into one entry
  so a slider drag is a single undo step. `LOAD_CONFIG` clears the
  stack. New action `EDITOR_RESTORE_SNAPSHOT` (payload
  `EditorConfig | null`) is the restore primitive. Strand-mode
  actions (figure tuning, lacing, curves) bypass the stack. Cmd/Ctrl
  +Z and Cmd/Ctrl+Shift+Z (plus Ctrl+Y) bound globally while Lab is
  mounted; ignored when focus is in an input/textarea/select so
  library prompts aren't hijacked. Undo / Redo header row added to
  `EditorDesignControls` above the Phase toggle.

- **17.10 — Non-tiling patch detection + UI tag.** When the patch
  outline doesn't match the boundary polygon at strand-editor entry
  time, detect this and either show a single floating preview + UI tag
  (Decision 2) or drop into auto-complete (Decision 11) — the user
  opt-in determines which. Acceptance: build a patch that geometrically
  can't tile, flip to strand editor, see floating preview + tag.

- **17.11 — Multi-vertex Complete (cross-boundary + enclosed pocket).**
  ✅ Shipped + signed off 2026-05-07. First sub-step of Step 17 v2.

  **Sign-off (2026-05-07).** User confirmed multi-vertex completions
  work, click-order semantics produce the expected polygon, and the
  preview + hint UI guide cleanly. Two follow-up items recorded
  (not blocking sign-off):
  1. **Neighbour-vertex selection (Ctrl/Cmd-click).** PatternSVG
     painted `editorOverlay` below `StrandLayer`, so strand strokes
     (default `pointerEvents='auto'`) intercepted clicks at neighbour
     coordinates before the vertex hit-area could fire. Patch /
     boundary / pocket dots survived because tile-fill interiors don't
     catch clicks. Fix landed in `b6a2568` — moved `editorOverlay` to
     the topmost child of the rotation `<g>`. Awaiting browser
     confirmation.
  2. **Chord-mode click-on-neighbour silently no-ops.** Without a
     modifier, the second click on a neighbour vertex dispatches
     `EDITOR_COMPLETE_GAP` whose `completeGap` can't find the
     neighbour point on either patch / boundary cycle, so it returns
     null and the picks reset with no tile created. Two reasonable
     paths forward (deferred, captured here for revisit):
     - Auto-promote chord → multi when the second click lands on a
       neighbour vertex (requires the click handler to know the
       variant; smallest API change).
     - Reject chord-mode neighbour clicks with a hint that
       Ctrl/Cmd-click is required for cross-boundary picks.

  **Goal.** Generalise Complete from strict 2-vertex chord (17.5) to an
  N-vertex polygon pick so the user can fill (a) interior pockets that
  the chord-arc cycle can't see, and (b) gaps that span the boundary
  edge into one-ring neighbour stamps. Both cases unify under "click N
  vertices in order, commit one irregular tile."

  **Locked design (this conversation, 2026-05-07).** Resolves the
  open questions captured in the parked
  `project_editor_cross_boundary_complete_idea.md` and
  `project_editor_enclosed_pocket_idea.md` memos:

  | # | Question | Resolution |
  |---|----------|-----------|
  | a | Polygon ordering | Click order verbatim. User owns ordering; no auto-cycle-walk. |
  | b | Validity | N ≥ 3, simple polygon (no self-intersection), centroid exterior to every existing tile. Mid-pick preview tinted red while invalid. |
  | c | Cross-boundary tile representation | Plain `EditorIrregularTile` whose vertices straddle the boundary edge. Decision 5 (tiles can poke outside) covers it — no new tile kind. |
  | d | Pocket auto-detect | None. Pocket-cycle vertices are merely **exposed** as click targets in Complete mode. User picks them like any other vertex. |
  | e | Plain 2-vertex flow | Unchanged. Ctrl/Cmd is purely the "I want N>2" modifier; existing chord behaviour is preserved when no modifier is held. |
  | f | Commit gesture | Ctrl/Cmd + click(s) accumulate vertices. Releasing the modifier is **not** a commit — picks remain visually highlighted. **Enter** commits, **Esc** cancels. |
  | g | Symmetry orbit propagation | Out of scope for 17.11; tracked as 17.11b follow-up. Initial implementation is single-instance only. |
  | h | Cross-platform modifier | Standard `ctrlKey || metaKey`. |

  **Sub-step breakdown.**

  - **17.11.0 — Cycle detection.** Generalise `computeOuterBoundary` so
    it returns *all* closed cycles drawn from `computeExposedEdges` —
    the outer cycle (existing) plus zero-or-more inner pocket cycles.
    New helper `computeAllCycles(editor): { outer: BoundaryVertex[];
    pockets: BoundaryVertex[][] }` in `editor/boundary.ts` (or new
    `editor/cycles.ts` if cleaner). Outer = the cycle whose signed area
    is largest *and* CCW; pockets = the remaining cycles, oriented CW
    (since they bound interior holes). No UI change — just the data
    layer.

  - **17.11.1 — Neighbour vertex exposure.** When the
    `editorNeighbourPreview` toggle is on **and** Complete mode is
    active, surface the outer-cycle vertices of one-ring neighbour
    stamps (`editorOneRingNeighbourStamps`) as selectable points.
    Each neighbour vertex is a transformed copy of a real patch vertex
    (rotation + translation per stamp); we tag it with a synthetic
    `tileId === 'neighbour-{stampIdx}'` and a sequential `vertexIndex`
    so it round-trips through the same `BoundaryVertex` pipeline as
    patch / boundary / pocket vertices. Click resolves to the
    transformed world `Vec2`.

  - **17.11.2 — Vertex layer variants.** Extend `EditorVertexLayer`
    with two new variant tags: `'pocket'` (interior cycle vertex) and
    `'neighbour'` (one-ring stamp vertex). Distinct visuals — pocket
    dots use a filled accent ring (subtly inset to read as "inside");
    neighbour dots match the existing ghost-stamp opacity (≈ 0.4) so
    they read as "the same vertex, on the next stamp over." Hover
    tooltips clarify ("Pocket vertex" / "Neighbour-stamp vertex").

  - **17.11.3 — Multi-pick state machine.** Replace the current
    `firstVertexPick: Vec2 | null` state in `TessellationLabMode` with:

    ```ts
    type CompletePickState =
      | { mode: 'idle' }
      | { mode: 'chord'; first: Vec2 }       // ← unchanged 17.5 flow
      | { mode: 'multi'; picks: Vec2[] }     // ← new
    ```

    Plain click while `mode === 'idle'`: → `chord`. Plain click while
    `mode === 'chord'`: dispatch the existing `EDITOR_COMPLETE_GAP`
    (regression-safe). Ctrl/Cmd-click from any mode: → `multi` with
    accumulated picks. While `mode === 'multi'`: any click (with or
    without modifier) appends to `picks`. Mode switch is visible in
    the design controls' hint caption.

  - **17.11.4 — Validation + preview.** New `validateNGapPolygon(picks,
    editor): 'valid' | 'too-few' | 'self-intersecting' | 'inside-tile'`.
    Render an in-progress preview polygon (SVG `<polygon>` with thin
    stroke) connecting `picks` in click order; fill is `var(--accent)`
    at 0.18 opacity when valid, `var(--danger)` at 0.18 when invalid.
    The preview lives inside `EditorVertexLayer` so it shares the
    rotation `<g>`.

  - **17.11.5 — completeNGap.** New `editor/completeN.ts` exports
    `completeNGap(editor, picks, newId): EditorTile | null`. Uses
    `picks` directly as the polygon (no chord-arc resolution),
    `ensureCCW`, `tryRegularFit` (already exported from
    `complete.ts` — reuse), else `EditorIrregularTile`. New reducer
    action `EDITOR_COMPLETE_N_GAP` payload `{ picks: Vec2[] }`. Action
    is a `DESIGN_MODE_ACTIONS` member so it's covered by undo/redo.
    `seedFigures` + `applyWrap` like the existing 17.5 path.

  - **17.11.6 — Commit/cancel gestures.** Document-level keydown listener
    in `TessellationLabMode` while the editor mode is `'complete'` and
    state is `'multi'`: `Enter` → dispatch + clear; `Escape` → clear.
    Ctrl/Cmd `keyup` is a visual no-op (state stays `'multi'` until
    Enter/Esc per Decision f). Suppress when focus is in an
    `<input>`/`<textarea>`/`<select>` so library prompts aren't hijacked
    (mirrors the 17.9 undo/redo guard).

  - **17.11.7 — Build + visual sign-off probes.** `npm run build` green
    + manual probes:
    1. Square + 4 corner triangles → 2-vertex chord still fills one corner
       (17.5 regression).
    2. Square + 4 corner triangles + an interior tile creating a triangular
       pocket → Ctrl-click 3 pocket vertices, Enter → one tile fills the
       pocket.
    3. Hex patch → "Show neighbours" on → Ctrl-click 1 patch vertex + 2
       neighbour vertices forming a corner gap → Enter → single
       cross-boundary tile renders the same gap on every stamp.
    4. Self-intersecting pick (Ctrl-click 4 vertices in bowtie order) →
       preview tints red, Enter is a no-op.
    5. Esc with picks present → all picks cleared, no tile committed.
    6. Undo immediately after commit → tile removed, picks not restored.

  **Out of scope (parked).**
  - "Mirror vertices" mechanic from the original parked memo — superseded
    by the simpler "expose neighbour vertices when Show neighbours is on"
    approach.

- **17.11b — Orbit propagation for multi-vertex Complete.**
  ✅ Shipped + signed off 2026-05-07 (`73f5f81`).

  **Goal.** `EDITOR_COMPLETE_N_GAP` propagates across the boundary's
  symmetry subgroup (`editor.symmetryMode`) the same way
  `EDITOR_PLACE_TILE_ON_EDGE` does at 17.4. With `symmetryMode='full'`
  on a square boundary, one Ctrl-click sequence at one corner fills
  all four corner gaps in a single user gesture instead of forcing
  the user to repeat the same pick on every orbit copy.

  **Locked design (mirrors 17.4 conventions).**

  | # | Question | Resolution |
  |---|----------|-----------|
  | a | Failure mode | All-or-nothing on validation — if any surviving orbit image fails `validateNGapPolygon` against the cumulative state, abort the whole operation. Symmetry must never partially break. |
  | b | Asymmetric patches | Each transformed pick must coincide (within `EDITOR_EPS`) with a real selectable vertex (patch outer cycle / boundary corner / pocket / neighbour). Orbit images that don't satisfy this are silently dropped (not counted as failures). Mirrors 17.4's `orbitEdges`. |
  | c | Dedup | Orbit images producing tiles with coincident centroids collapse to one tile — handles picks on a symmetry axis whose orbit image equals themselves. |
  | d | `symmetryMode='none'` | Trivially preserved: `boundarySymmetries(shape, 'none')` returns `[IDENTITY]`, so the loop runs once and the result equals 17.11's single-instance behaviour. |

  **Implementation.**
  - New `placePolygonsOnOrbit(editor, picks, idPrefix)` in
    `editor/orbit.ts` — parallels `placeTilesOnOrbit`. Loops the
    chosen subgroup; for each element, transforms the pick list,
    gates by vertex-coincidence, builds the tile via `completeNGap`
    against the cumulative working state.
  - Reducer `EDITOR_COMPLETE_N_GAP` routes through the new helper
    instead of the bare `completeNGap`. Same `applyWrap +
    seedFigures` envelope.
  - No UI change. Picker preview still validates the seed only —
    the orbit visualisation is implicit (user sees N tiles appear
    at once on commit).

  **Acceptance probes.**
  1. `symmetryMode='none'` — single-instance behaviour from 17.11
     unchanged (regression).
  2. Square + `'full'` (D4) + Ctrl-pick a corner gap → all 4 corners
     fill on Enter.
  3. Hex + `'full'` (D6) + Ctrl-pick a corner gap → all 6 corners
     fill on Enter.
  4. Square + `'full'` + asymmetric patch (e.g. 1 placed triangle
     breaks D4) + Ctrl-pick on the asymmetric side → only the seed
     places; the 3 orbit images that would land in empty space are
     silently dropped via the vertex-coincidence gate.
  5. Cross-boundary case — square + `'full'` + Ctrl-pick spanning
     the boundary edge → 4 corner-meet tiles, one per stamp corner.

- **17.12 — Boundary-inward authoring mode.** 🚧 In flight on
  `feat/art-deco-egypt-theme-revamp`. Sub-step A shipped 2026-05-11
  (`8c935a2`); B + C pending. Tracking memo
  `project_editor_boundary_inward_mode_idea.md`.

  **Goal.** Alternative authoring flow where the user builds the patch
  from the **boundary inward** instead of the centre out: click a
  highlighted section of the boundary edge → a regular n-gon places
  flush against that section with edge length equal to the section
  length. That first boundary-anchored tile then dictates the patch's
  edge length, and the existing Place / Complete flow takes over.

  **Locked design (this conversation, 2026-05-11):**

  | # | Question                          | Resolution |
  |---|-----------------------------------|-----------|
  | a | Origin tile interaction           | **Keep both.** Origin tile + its exposed edges stay clickable. Boundary-section highlights are *additional* click targets, not a replacement. |
  | b | Composition scope                 | **Single-shape only in v1** (triangle / square / hexagon). Composition (4.8.8) deferred to a later arc. |
  | c | Section schedule                  | Linear: fraction = 0.30 at boundarySize ≤ 80 → 0.10 at boundarySize ≥ 800; clamped outside. Section count = `round(1 / fraction)`, so each boundary edge divides evenly. |
  | d | First-tile shape                  | Reuse the existing picker shape list (`PICKER_SIDES = [3,4,5,6,7,8,9,10,12]`). Regular only (Decision 14). |
  | e | Symmetry orbit                    | Route through the existing `placeTilesOnOrbit` helper so `symmetryMode` behaves consistently with edge placement. `'none'` produces single-section behaviour by default. |
  | f | `patch.edgeLength` conflict       | First boundary-section placement **resets `patch.edgeLength`** to the section length. The pre-existing origin tile's exposed edges become non-conforming (Decision 14a) and inert in the picker — same gating that already covers irregular-Complete edges. |

  **Sub-step breakdown.**
  - **17.12a — Foundation.** ✅ Shipped 2026-05-11 (`8c935a2`). New
    `src/editor/boundaryInward.ts` with `BoundarySection`,
    `computeBoundarySections`, `placeRegularNGonOnBoundarySection`, plus
    the size-→-fraction schedule. `EditorPatch.boundaryInward?: boolean`
    field added; migration plumbing updated. No reducer / UI yet.
  - **17.12b — Reducer + first-tile placement.** ✅ Shipped 2026-05-18.
    New action `EDITOR_PLACE_TILE_ON_BOUNDARY_SECTION` payload
    `{ edgeIndex, sectionIndex, sides }` plus enabling toggle
    `SET_EDITOR_BOUNDARY_INWARD`. Validates viability against existing
    Tiles via `isBoundarySectionPlacementViable` (strong-overlap probe —
    candidate-vs-existing centre containment + `overlapsExisting`;
    angle-sum skipped since section endpoints don't coincide with
    existing-Tile vertices in any realistic case). Routes through the
    new `placeTilesOnBoundarySectionOrbit` (mirrors
    `placeTilesOnOrbit`'s all-or-nothing semantics with centroid dedup
    for fixed-axis sections) when `symmetryMode !== 'none'`. Resets
    `patch.edgeLength` to the section length (decision f), then
    `seedFigures` + `applyWrap`. Single-cell only in v1 — refuses if
    `cells.length > 1` (decision b). Both actions in
    `DESIGN_MODE_ACTIONS` for undo/redo. No UI yet — dispatched from
    17.12c.
  - **17.12c — UI.** New `EditorBoundaryInwardLayer` SVG layer renders
    section highlights as click targets when `patch.boundaryInward` is
    on and the editor mode is `'place'`. Checkbox "Boundary-inward
    placement" in `EditorDesignControls`. Click a section → reuses the
    existing `EditorPickerOverlay` at the section midpoint → dispatch.
    Standard exposed-edge highlights remain visible in parallel (per
    decision a — additive).

  **Out of scope for 17.12 (parked):**
  - Composition (4.8.8) support — see decision b.
  - Sub-100 cell-edge composition support — separate arc.
  - The vertex-placement idea
    (`project_editor_vertex_placement_idea.md`, captured 2026-05-11)
    is a sibling rather than a 17.12 sub-step; it adds corner-anchored
    placement with a two-page picker and composes with boundary-inward
    once both ship.

### Reusable bits already on hand

From `archive/tessellation-lab/`:
- Regular polygon vertex generator (`regularPolygonVertices`).
- Per-polygon synthetic figures-map pattern — required by Decision 10
  for irregular Complete-fills. **Pull this back into the live tree at
  17.5 or 17.6.**

From the live tree:
- `runPIC` accepts any `Polygon[]` — no engine work needed for regular
  tiles. Irregular tiles need the synthetic figures-map wrapper above.
- `usePattern` already routes polygons → `runPIC`; the editor path
  drops in next to archimedean / rosette-patch.
- `PatternSVG` renders any polygons + segments — no rendering changes
  needed for v1.
- `state/customTessellations.ts` (Step 14) — storage primitives with
  list / save / rename / delete / duplicate over a versioned localStorage
  key. Will be parameterised for editor entries at 17.8.

---

## Future / parked steps

- **Step 15 (parked) — k-uniform tessellation generator.** Generalise
  `tilings/archimedean.ts` BFS to handle multiple vertex orbits.
- **Step 16 (parked) — Quasi-periodic generators.** Penrose P3, Ammann–
  Beenker, Stampfli/Socolar. New `category: 'quasiperiodic'`.
- **Step 18 (parked) — Girih substitution tile set.** Lu & Steinhardt
  2007 fivefold system. Combines with Step 16 for Darb-i-Imam-style
  patterns.

---

## Working log

- **2026-04-25** — Plan v1 drafted from grill-me interview, under wrong
  terminology assumption.
- **2026-04-26 (am)** — Terminology corrected (tessellation = polygons,
  strand = PIC line). Plan rewritten as v2.
- **2026-04-26 (pm)** — Critical review surfaced 17 issues. v2 of the
  plan promoted custom tessellations into Main, which proved
  structurally awkward. User picked Option B: keep custom tessellations
  in Lab end-to-end with specialised strand renderers per category.
  Plan rewritten as v3:
  - Old Step 11.5 (Promote to Main) deleted.
  - Old Step 16 (Port Lab to Main) deleted.
  - New Phase B in Lab: lift `FigureControls` (Step 10), enable strand
    controls in Lab for known-good categories (Step 11), specialised
    mandala renderer (Step 12), specialised composition renderer with
    strand-match (Step 13).
  - New Phase C: Lab-local library (Step 14, replaces v2 Step 11.5's
    persistence work but with no Main-mode bridge).
  - Open questions consolidated into a single registry, deferred to the
    step that actually needs them rather than pre-resolved.
  - Conservative defaults applied (strict divisor kept, two-slider
    composition scale, minimal frame UI, allow-list gated on
    verification, library Lab-only).
- **2026-04-27** — Steps 3, 4, and 5 shipped (`a43b787`, `3b209e2`,
  `304100a`). Post-Step-5 polish (`46dd7c5`) lifted Lab state to App,
  fixed title overlap, and centred the canvas on world origin to fix
  the mandala layout. Steps 1–5 visually signed off by user; Step 6
  awaiting green light.
- **2026-05-02** — Step 6 shipped. Four mandala presets added
  (`Octagonal 8+4`, `Hexagonal 12+6+3`, `Sultan Hassan 16+8+4`,
  `Decagonal 10+5`). Preset dropdown grouped via `<optgroup>` into
  "Tessellations" and "Mandalas". MQ-1 evaluation: strict divisor
  was sufficient for the three multi-layer targets; Octagonal's
  nominal `2` ring is below the polygon engine's n≥3 floor (not a
  divisor issue), so the preset shrank to `8+4` per plan guidance.
- **2026-05-02** — Step 7 shipped. New composition category +
  `tilings/composition.ts` engine + `<clipPath>`-based per-region
  rendering in `PatternSVG`. CG-1 resolved as (a) two scale sliders;
  FS-1 resolved as (a) on/off + colour.
- **2026-05-02** — Step 8 shipped. Four composition presets added
  (`16-in-4.8.8`, `12-in-Hexagonal`, `16-in-Square`, `10-in-Hexagonal`).
- **2026-05-02** — Step 12 shipped. New `tilings/mandalaStrand.ts`
  exports `runMandalaPIC` with a per-polygon synthetic figures map so
  each layer uses its own contact angle independent of the global
  figures map. MS-1 resolved as (a) per-layer only.
- **2026-05-02** — Step 11 shipped. Lab gains a "Strands" section with
  a trimmed per-tile-type panel. LX-1 resolved as (a) trimmed Lab
  variant. ID-1 resolved as identical render where surface overlaps.
- **2026-05-02** — Step 10 shipped. `FigureControls` extracted from
  `Sidebar.tsx` into `components/strands/FigureControls.tsx`.
- **2026-05-02** — Step 9 shipped. `state/labDefaults.ts` exports
  `loadLabState`/`saveLabState` against `lab-state-v1` localStorage
  key. Lab Display section gains an Outline weight slider and a
  "Fill tile on hover" toggle. Phase A complete.
- **2026-05-02** — Step 13 follow-up shipped. `VERIFIED_COMPOSITION_PAIRS`
  populated with five trivial-match pairs. New helpers
  `effectiveCompositionBoundary()` and `isTrivialMatchPair()` centralise
  the dispatch decision. CS-1 partially resolved — trivial path
  exercised end-to-end; non-trivial pairs remain unverified.
- **2026-05-03** — Pivot. User scrapped the mandala and composition
  features. Steps 4–8, 12, and 13 marked ARCHIVED. Source modules
  moved to `archive/tessellation-lab/` with a README listing reusable
  helpers. `MandalaConfig` and `CompositionConfig` types removed;
  `TilingCategory` narrowed to `'archimedean' | 'rosette-patch'`;
  `loadLabState` and `customTessellations.ts` gained migrations that
  silently skip retired tiling types. `TessellationLabMode` rewritten
  with an "Editor" placeholder section. `npm run build` green. Step 17
  (user-editable tessellations) promoted to primary focus.
- **2026-05-03** — Step 17 grilled. Decisions 1–17 locked (Q1–Q8
  resolved); Q9–Q15 deferred to sub-step 17.0. Three new `/idea` memory
  files captured (custom boundaries, per-edge placement, nested authoring
  layers). Seven memory files tied to the archived iteration removed
  (mandala variants, composition variants, free-arrangement,
  forgiving-overlap). Plan rewritten as v4: archived-step bodies
  collapsed into the compressed completed-work table; conservative
  default registers (E-1..E-9, MQ/CG/FS/MS/CS/ID/LX) retired; Step 17
  grill decisions and sub-step breakdown promoted to first-class plan
  content.
- **2026-05-03** — Sub-step 17.0 resolved. Q9–Q15 grilled in a
  follow-up `/grill-me` session in the order Q14 → Q13 → Q9 → Q10 →
  Q11 → Q15 → Q12. Resolutions captured in the "Resolved deferred
  questions" table above and reflected in the sub-step breakdown.
  Notable choices: v1 = Cut C (full working-draft bar, reliability over
  scope cuts); persistence = `editor?: EditorConfig` with inner
  `version: 1` on `PatternConfig`; tile-type identity = full canonical
  signature for irregular tiles; figures map sticky/additive across
  flips; undo = snapshot, depth 50, design-only.
- **2026-05-03** — Sub-step 17.1 shipped (`e199aee`). New types in
  `src/types/editor.ts` (`EditorConfig`, `EditorRegularTile`,
  `EditorIrregularTile`, single tagged-union `tiles[]` with `origin`
  discriminator). New helpers in `src/editor/` (`regularPolygon.ts`,
  `buildEditorPolygons.ts`, `sampleConfig.ts`). `editor?` field added
  to `PatternConfig`; `usePattern` editor branch added; `SavedSource
  Category` extended to `'editor'`. Lab Editor section gains Show
  sample patch / Clear buttons that load a fixture (square + 4
  triangles flush to each edge). Geometry hand-verified; visual
  sign-off received.
- **2026-05-03** — Follow-up `94f651c` removed the standard tessellation
  Type dropdown, Scale slider, Reset button, and Info panel from the
  Lab sidebar. The Lab is now editor-only — Archimedean and rosette-
  patch tessellations remain in Main mode (consistent with the plan's
  "Approach" section). Unused `SYMMETRY_GROUPS` import and
  `resetTessellationDefaults` helper dropped.
- **2026-05-04** — Sub-step 17.2 shipped (`f9d6197`). Design-mode
  shell added: `EDITOR_NEW` / `EDITOR_CLEAR` plus per-knob actions
  (`SET_EDITOR_BOUNDARY_SHAPE`, `SET_EDITOR_BOUNDARY_SIZE`,
  `SET_EDITOR_ORIGIN_SIDES`); new `createDefaultEditorConfig` /
  `createOriginTile` helpers (Decision 6 auto-placement, rotation 0,
  edgeLength 100); `editorBoundaryVertices` returns the boundary
  outline; `usePattern.PatternData.boundaryOutline` carries it
  through; `PatternSVG` renders a non-interactive dashed accent
  polygon under tiles. Editor section in `TessellationLabMode`
  swaps to design controls (3 shape buttons + boundary-size slider
  + origin-sides slider + Clear) when a patch is active; otherwise
  shows New patch / Show sample patch. Q9 resolved as Option B —
  boundary size only rescales the outline. Follow-up `0aff7fb`:
  shape / origin-sides changes reset `tiles` to `[origin]`.
- **2026-05-04** — Sub-step 17.3 shipped (`ccc7da0`). Single-edge
  tile placement added. New geometry helpers `computeExposedEdges`,
  `placeRegularNGonOnEdge`, `isPlacementViable` (Decision 7 angle-
  sum at shared endpoints, short-circuit on non-conforming edges
  per Decision 14a), `viableSidesForEdge` filtering
  `PICKER_SIDES = {3,4,5,6,7,8,9,10,12}`. UI: `EditorEdgeLayer`
  inside `PatternSVG`'s rotation `<g>` via new `editorOverlay`
  slot; `EditorPickerOverlay` HTML popover positioned via new
  `worldToScreen` helper. New reducer action
  `EDITOR_PLACE_TILE_ON_EDGE`. Awaiting visual sign-off.
- **2026-05-06** — 17.7 refactor: split the `match-boundary` flavour
  out into a separate **Wrap boundary** design-mode toggle. Auto-
  complete keeps a single checkbox (no flavour dropdown) and always
  runs until-convex on Design→Strand flip. New
  `EditorConfig.wrapBoundary` field + `SET_EDITOR_WRAP_BOUNDARY`
  action; `applyWrap` helper recomputes `boundarySize` after every
  tile mutation when the flag is on. Manual boundary-size drag clears
  the flag. `AutoCompleteFlavor` and `SET_EDITOR_AUTO_COMPLETE_FLAVOR`
  retired; `autoCompletePatch` no longer takes a flavor.
- **2026-05-06** — UI move (`af06d66`): auto-complete checkbox lives
  inside the Mode section's Complete branch (only surfaces when
  Complete is selected). Wrap boundary stays above the Mode toggle
  since it applies in both modes.
- **2026-05-06** — Sub-step 17.8 code-complete. Persistence
  validation + migration scaffold added: `src/editor/migrations.ts`
  (`migrateEditorConfig` — version dispatch hook for future schema
  bumps), `src/state/configValidation.ts` (`loadPatternConfig` +
  `ConfigValidationError`). Wired into `loadJSON` (file import) and
  `customTessellations.listSavedTessellations` (localStorage). Bad
  library rows skip with a warning rather than blanking the whole
  library. `loadJSON` errors surface via `window.alert` in
  `App.handleLoadJSON`. Cross-boundary-Complete idea
  (`project_editor_cross_boundary_complete_idea.md`) parked as 17.5b
  the same day.
- **2026-05-06** — Sub-step 17.9 code-complete. Undo / redo on
  `EditorConfig` (Q12). New `src/editor/history.ts` (constants +
  action allowlist) + `src/editor/useEditorHistory` (dispatch
  wrapper). Slider-drag coalescing collapses fast same-type actions
  into one history entry. `LOAD_CONFIG` clears the stack;
  `EDITOR_RESTORE_SNAPSHOT` restores; strand-mode tuning bypasses
  the stack. Keyboard: Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z (also
  Ctrl+Y), guarded against text-input focus. Undo/Redo buttons in
  the editor design header.
- **2026-05-06** — Lab UI polish (`69e1f7b`, fix `9ddb1d5`). Sidebar
  sections (Editor / My Tessellations / Strands / Display) gained
  chevron-toggle collapse matching Main mode; state persisted to
  `lab-sidebar-collapsed-sections`. New `TextPromptModal` component
  replaced `window.prompt` for Save / Rename — Esc / backdrop /
  Cancel dismiss, Enter to confirm, focus + select on open. Initial
  modal commit used a non-existent `--bg` variable that fell through
  to transparent; `9ddb1d5` fixed by switching the dialog to
  `--bg-elevated` and the input to `--bg-input`.
