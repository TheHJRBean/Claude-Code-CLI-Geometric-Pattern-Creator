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

## Terminology (locked)

- **Tessellation** — the underlying polygon tiling. Pure geometry, no decoration.
- **Strand** — a line in the decorative pattern produced by Kaplan's
  Polygons-in-Contact (PIC) algorithm running over a tessellation.
  Strands are an optional overlay on top of a tessellation.
- **Patch** *(Step 17)* — the finite arrangement of polygons the user
  builds inside a boundary in the editor. Becomes the wallpaper
  fundamental domain at preview / strand-editor time.
- **Boundary** *(Step 17)* — the lattice cell of the wallpaper repeat.
  In v1, restricted to {triangle, square, hexagon}.
- **Repeat** *(Step 17)* — one stamping of the patch on the lattice in
  strand-editor mode.

Internal code identifiers may still use older words (`TILINGS`,
`lineLength`, etc.); those are deferred refactors and not user-visible.

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
5. **Library is Lab-only**, persisted to `lab-tessellations-v1`
   localStorage. Existing JSON `saveJSON` / `loadJSON` remains the
   canonical share format.
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

**Status (2026-05-05):** 17.0–17.4 code-complete. 17.1 landed the
data model + read-only render (`e199aee`); follow-up `94f651c` made
the Lab editor-only. 17.2 added the Design-mode shell (`f9d6197`);
follow-up `0aff7fb` resets placed tiles when shape / origin sides
change. 17.3 added single-edge tile placement (`ccc7da0`). 17.4 adds
orbit-symmetric propagation under the boundary's dihedral group
(D3/D4/D6) — `editor/symmetry.ts` + `editor/orbit.ts`; placement is
**all-or-nothing** so symmetry never partially breaks; delete is
orbit-aware (siblings come with). New `/idea`
(`project_editor_symmetry_axes_toggle_idea.md`) captures a future
subgroup picker (full / rotation-only / single-axis / none). 17.4
awaits visual sign-off; **17.5 (Complete operation — manual) is the
next active sub-step.**

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
| **17.4** | Orbit-symmetric propagation on placement. ✅ code-complete (awaiting visual sign-off). | M | 8 | — |
| **17.5** | Complete operation — manual vertex-pair selection + canonical tile-type hash. | M–L | 9, 10, 12 | Q11 |
| **17.6** | Strand editor mode + lattice preview + strand controls. | M | 15, 16, 17 | Q15        |
| **17.7** | Auto-complete-on-flip (until-convex + match-boundary flavours). | M | 11 | — |
| **17.8** | Persistence integration (`lab-tessellations-v1` + JSON file). | S–M | 5 | Q13 |
| **17.9** | Undo / redo.                                     | S–M  | —         | Q12          |
| **17.10**| Non-tiling patch detection + UI tag.             | S    | 2         | —            |

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

- **17.4 — Orbit propagation.** ✅ Code-complete 2026-05-05.
  `editor/symmetry.ts` exposes `boundarySymmetries(shape)` returning
  the dihedral group D_n about the boundary centre (D3/D4/D6 for
  triangle/square/hexagon). `editor/orbit.ts` resolves orbit edges by
  applying every group element to the picked edge's endpoints and
  matching against `computeExposedEdges`; asymmetric setups (e.g.
  triangle origin in a square boundary) silently drop orbit images
  that don't land on a real edge. `placeTilesOnOrbit` validates each
  image against a *cumulative* working state (so two orbit-equivalent
  placements that would touch the same future vertex don't both
  individually pass and then overlap each other) and is
  **all-or-nothing** — any failed image refuses the whole placement.
  Per user direction (2026-05-05) this took the most conservative
  option of the four open questions. `EDITOR_DELETE_TILE` now removes
  every orbit sibling of the chosen tile (origin tile remains
  protected). New `/idea` filed for a follow-up symmetry-axis
  subgroup picker (`project_editor_symmetry_axes_toggle_idea.md`),
  superseding the older strict-symmetry-checkbox idea.
  Acceptance probes (visual): square + square origin + triangle pick
  → triangles on all 4 edges; hex + hex origin + square pick → squares
  on all 6; asymmetric origin-in-boundary degrades gracefully; delete
  removes the orbit; conflicting picks refused outright.

- **17.5 — Complete operation (manual).** Click two adjacent outer
  vertices (with explicit "select adjacent pair" UI affordance — TBD).
  Highlight the pair and orbit equivalents. Compute the gap polygon.
  Try regular polygon fit; if not, build an irregular polygon (bowtie,
  kite, etc.) per Decision 10. Add to data model as first-class tiles
  per Decision 12. Acceptance: square + 4 triangles → select two
  triangle tips → Complete fills the 4 corner gaps with new triangles.

- **17.6 — Strand editor mode + lattice preview.** Toolbar toggle in
  editor header (Decision 15). Strand editor renders the patch tiled
  across viewport on the boundary's lattice (Decision 17). Free flip
  back (Decision 16). Re-use the existing Lab strand panel (from
  Step 11). Resolve Q11 and Q15 first. Acceptance: build a patch, flip
  to strand editor, see it tiled with strands. Flip back, edit, flip
  again, strands re-render correctly.

- **17.7 — Auto-complete on flip (opt-in).** Checkbox in Design mode:
  "Auto-complete on entering Strand editor". Two flavour radios:
  *Until convex* / *Match boundary*. Match-boundary may auto-resize
  the boundary. Auto-completed tiles persist as first-class on
  flip-back per Decision 16. Acceptance: opt in, build incomplete
  patch, flip → patch auto-completes, flip back → completed tiles are
  editable.

- **17.8 — Persistence.** Wire `EditorConfig` into both
  `lab-tessellations-v1` localStorage and the existing `saveJSON` /
  `loadJSON` file format. Schema-versioned. Acceptance: save 3 patches
  across categories, reload browser, all three persist. Export to
  JSON, import on another browser, patch round-trips.

- **17.9 — Undo / redo.** Resolve Q12 first. Default plan: snapshot-
  based undo on `EditorConfig`. Acceptance: place 5 tiles, undo 3,
  redo 2, state matches.

- **17.10 — Non-tiling patch detection + UI tag.** When the patch
  outline doesn't match the boundary polygon at strand-editor entry
  time, detect this and either show a single floating preview + UI tag
  (Decision 2) or drop into auto-complete (Decision 11) — the user
  opt-in determines which. Acceptance: build a patch that geometrically
  can't tile, flip to strand editor, see floating preview + tag.

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
