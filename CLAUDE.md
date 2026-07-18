# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Vocabulary

`CONTEXT.md` at the repo root is the canonical glossary — read it before writing user-facing text or new types. Quick mapping for vocabulary that already drifted in the code:

- **Gallery** = the saved-patterns **browser** (legacy code: "Main") — read-only since the convergence flip; presets are picked on the Lab's **Presets shelf**, not here.
- **Lab** = the **default** authoring workspace; subtitle "Exploratory Workspace".
- **Builder** _(UI label)_ = the tessellation-authoring tool inside the Lab (legacy code: "Tessellation Lab" / "Editor"). The code namespace stays `src/editor/`.
- **Patch / Cell / Boundary / Tile** = the Builder data hierarchy. A **Patch** holds one or more **Cells**; each Cell has a **Boundary** (closed perimeter) and carries the user's **Tiles**.
- **Configuration** = the named tessellation family (`"4.8.8"` etc.); same word on the preset path (drives BFS) and in the Builder (multi-cell Patch identifier).
- **Phase** = a stage of the Builder workflow; sequence: **Design → Composition → Decoration** (Decoration reserved). **Phase-switch** = the verb for moving between them. **Frame** is a persistent overlay spanning both live phases, not a Phase (Framing was demoted — see ADR-0003 amendment + CONTEXT Frame).
- **Ray** = the atomic visible line piece (legacy code: `Segment` / "line"). **Strand** = a chain of Rays across polygons. **Figure** = the per-polygon assembly of Rays; driven by a per-tile-type **Figure recipe** (`FigureConfig`).
- **Contact Ray** = the pre-trim parametric ray from `pic/stellation.ts`; code-internal only.
- **Tiling** = bare polygon coverage (no Strands). **Composition** = Tiling + Strands rendered.
- **Lacing** = reserved; returns under Decoration.
- **Complete** = Design-phase gap-fill with Tiles. "Fill" is reserved for the future Decoration colour-fill (see ADR-0002).

## Commands

```bash
npm run dev      # Start Vite dev server
npm run build    # Type-check + production build
npx tsc --noEmit # Type-check only
npx vitest run   # Run the test suite (~600 tests)
```

## Git workflow

After every edit, commit and push:

```bash
git add <changed files>
git commit -m "description"
git push
```

## Research notes

`RESEARCH-TILING-CONFIGURATIONS.md` at the repo root is the canonical home
for **all** project research notes (tilings, symmetries, construction
methods, historical references, decorative traditions, algorithm
behaviour, edge cases — anything useful to a future session). Append a
dated entry under the Working log or add a new numbered section; **do
not start parallel research docs** (`RESEARCH-*.md`, `NOTES-*.md`,
`STUDY-*.md`). State files — `TESSELLATION_REVAMP_PLAN.md`,
`SESSION_STATE.md`, `INVESTIGATION-*.md`, `BUG_DOC_*.md`,
`STEP*_PROGRESS*.md` — are separate and stay separate.

## Architecture

React + TypeScript + Vite web app that generates traditional Islamic geometric patterns using **Kaplan's Polygons in Contact (PIC) method**. The app is structured in three independent layers that mirror Taprats (Craig Kaplan's reference implementation):

```
Tiling Layer  →  Figure Layer  →  Render Layer
(polygon grid)   (PIC Figures)    (SVG output)
```

### Data flow

`PatternConfig` (state) → `usePattern` hook → geometry pipeline → SVG components

The geometry pipeline runs entirely in pure TypeScript (no React), memoized in `usePattern`:

1. `tilings/archimedean.ts` — BFS generates `Polygon[]` covering the viewport from a seed polygon, expanding neighbors according to the **Configuration** (e.g. `[4,8,8]` for the 4.8.8 tiling)
2. `pic/stellation.ts` — computes 2 **Contact Rays** per polygon edge at ±(π/2 − θ) from the edge direction. Per-edge-θ variants (`computeContactRaysPerEdge` / `computeVertexRaysPerVertex`) serve the **Morph** (Step 20): with an active `config.morph`, `runPIC` evaluates θ per edge midpoint (and per vertex for vertex lines) through the world-space morph field (`pic/morph.ts` — gradient-stop blend, clamped band; stops = explicit Boundaries + an implicit stop at position 0 holding the live start recipe, so the base sliders drive the Origin side and one Boundary already gradients; a stop's effective values = start `figures` overridden by its partial overlay). A shared edge has one midpoint so both polygons agree on its θ — Strands stay straight through contact points by construction. Morphed configs are ineligible for the Lever-A `<use>` fast-path (`periodicFastPathEligible`), so PIC always runs over world-space polygons. Probe suite: `pic/morphProbe.test.ts` (also documents two *inherited* uniform-θ artifact classes the morph merely exposes: centroid-V mixed-regime kinks in branch-transition bands, and vertex-ray leaks at α > interior half-angle).
3. `pic/intersect.ts` — parametric ray-ray intersection
4. `pic/index.ts::runPIC` — per-polygon emission to `Segment[]`. Pair-A at each vertex (`pairAtVertex`) is the primary path: two adjacent edges' rays meet at the natural vertex star tip and `emitStarArms` emits two segments per pair. Selection priority in `pairAtVertex`: `aInside` → `aAsym` → `bInside` → `aValid` → `bValid` → `bAsym` → null. `aAsym` is checked **before** `bInside` so polygons with mixed inside/asymmetric vertices (e.g. Tetrakis right-triangle at θ ≥ 46°) don't fall through to pair-B at the asymmetric vertices and double-emit a shared ray with a neighbouring pair-A vertex. Branches in `emitStarArms`:
   - **Pair-A inside polygon**: normal emission, both rays marked emitted.
   - **Asymmetric (one t negative)** in auto-length mode: edge-slide using the forward (positive-t) ray — forward ray clipped to polygon boundary, then slide along the boundary to the back ray's origin (which is the partner edge's midpoint). Both rays marked emitted so the per-ray fallback doesn't redundantly draw a tiny Kaplan-trim crossing for the back ray. Fixed-length mode falls through to normal emission at user-specified length.
   - **Both t positive, tip outside polygon** (irregular convex tiles at low θ): edge-slide — longer ray clipped to boundary, slide along the exit edge to the suppressed ray's origin. Both rays marked emitted.
   - **Per-ray fallback** after the pair pass: any ray not emitted (e.g. pair-B fallback case where only some rays were touched) terminates at its nearest valid crossing with any other-edge ray (`findOrphanRayEndpoint`, the original Kaplan trim). Drops emissions shorter than `inradius * 0.25` to suppress short-stub artifacts.
   - `pic/trim.ts` is legacy and no longer in the production path.
5. SVG components render Rays directly; **Lacing** (legacy, broken) uses two-pass stroke rendering — being removed and reintroduced under the Decoration Phase

### Key types

- `PatternConfig` (`types/pattern.ts`) — the serialisable state (saved to JSON). Contains `tiling`, `figures` (Figure recipes per Tile type), and `lacing` config.
- `ViewTransform` (`hooks/usePanZoom.ts`) — pan/zoom state; **not** part of `PatternConfig`, lives in Canvas local state. Encoded entirely in SVG `viewBox`, no CSS transforms.
- `TilingDefinition` (`types/tiling.ts`) — static descriptor for each tiling type, including its Configuration array (vertex configuration in literature).

### Contact angle convention

The contact angle θ (degrees) controls how "pointy" the **Figure**'s star is. `θ=67.5°` on a square tiling produces classic 8-pointed Islamic stars. Rays are computed as:
```
rayDir = rotate(edgeDir, ±(π/2 − θ))
```

### Adding a new tiling

Add a `TilingDefinition` entry to `tilings/index.ts` with the Configuration array (e.g. `[3, 4, 6, 4]`). The BFS generator in `archimedean.ts` handles the rest automatically.

### Builder (Step 17 — `src/editor/`)

`src/editor/` is the **Builder** — a parallel branch of the geometry pipeline that doesn't go through `TilingDefinition`. The user authors a finite **Patch** (one or more **Cells**, each with its **Tiles**) and PIC runs over the resulting polygons directly. The Builder is the current occupant of the **Lab** (which is conceptually broader, see CONTEXT.md).

Key bits:

- `types/editor.ts` — `EditorPatch` (per-Patch shape, always `cells: EditorCell[]`) + `EditorConfig extends EditorPatch & { version: 3 }` + `EditorTile` (tagged union of regular and irregular). Lives on `PatternConfig.editor` (optional). The Builder route is signalled by `tiling.type === 'editor'`. `CellShape = 'triangle' | 'square' | 'hexagon' | 'octagon' | 'dodecagon'` — octagon and dodecagon only appear inside multi-cell Configurations. `ConfigurationId = '4.8.8' | '3.12.12' | '4.6.12' | '3.6.3.6' | '3.4.6.4' | '3.3.3.4.4' | '3.3.4.3.4' | '3.3.3.3.6'`. v1 + v2 legacy shapes still load via `editor/migrations.ts`.
- `editor/active.ts` — adapter layer (`activeCell` / `allCells` / `withCellById` / `cellPlacementEdgeLength`) used by the reducer to route per-Cell mutations. **No user-facing active-Cell selector (2026-06-18):** the Design panel exposes EVERY Cell at once (a control group per Cell; all Cells' edge/section/vertex overlays live simultaneously), and each mutation carries an explicit target — `cellId` on the per-Cell property actions (reducer `updateCell`, which fails closed on a stale id), `hostCellId` on all three placement actions (vertex / edge / boundary-section, 2026-07-09). `activeCellId` survives only as an INTERNAL "representative Cell" pointer (set by `updateCell`) that `applyWrap`, the n-ring Frame, and `patchSelectable` still read — it is no longer chosen by the user, and the former `SET_ACTIVE_CELL` action + select auto-switch are deleted. `cellPlacementEdgeLength(cell, patchEdgeLength, siblingCells?)` reads an empty No-Seed Cell's scale off the sibling Cells' Tiles before falling back to the lattice constant.
- `editor/createDefault.ts` — Patch defaults; per-shape `DEFAULT_BOUNDARY_SIZE_BY_SHAPE` + `BOUNDARY_SIZE_MAX_BY_SHAPE`. `createDefaultEditorConfig` seeds a single-cell Patch. Multi-cell seeds: `createDefault488EditorConfig` (octagon + square), `createDefault31212EditorConfig` (dodecagon + 2 triangles), `createDefault4612EditorConfig` (dodecagon + 2 hexagons + 3 squares), `createDefault3636EditorConfig` (hexagon + 2 triangles, Kagome), `createDefault3464EditorConfig` (hexagon + 3 squares + 2 triangles), `createDefault33344EditorConfig` (square + 2 triangles, elongated triangular — oblique lattice `u=(L,0)`, `v=(L/2, L(2+√3)/2)`), `createDefault33434EditorConfig` (2 squares + 4 triangles, snub square — square lattice tilted 15°, `u=(L(2+√3)/2, L/2)`, `v=rot90(u)`), `createDefault33336EditorConfig` (1 hexagon + 8 triangles, snub hexagonal — CHIRAL, one enantiomorph seeded; hex lattice `u=(√3L, 2L)`, `v=rot60(u)`, `|u|=L√7`; 6 edge triangles + 2 pocket triangles). Each multi-cell Cell is "boundary-matching" — Seed Tile rotation/size equals the Cell-Boundary's so Strands emerge cleanly from edges.
- `editor/buildEditorPolygons.ts` — `editorTilesToPolygons` + `editorBoundaryVertices`. `BOUNDARY_SIDES` / `BOUNDARY_ROTATION` exported. Octagon + dodecagon entries exist but are never assignable as a top-level single-cell shape — only inside a Cell of a multi-cell Configuration.
- `editor/exposedEdges.ts`, `editor/boundary.ts` — Cell-Boundary geometry consumed by Place / Complete UIs. Take `EditorCell`.
- `editor/placement.ts` — `placeRegularNGonOnEdge` + Decision 7 / 14a single-edge viability + `viableSidesForEdge` (the **clean / overlap-free** set, no longer a hard filter — see Flexible placement below). `isPlacementViable` uses the shared edge-cross `overlapsExisting` (`tileOverlap.ts`) probe so overlap detection matches the boundary-section + vertex flows.
- `editor/symmetry.ts` — `boundarySymmetries(shape, mode)` returns the picked subgroup of the Cell-Boundary's dihedral group (`SymmetryMode` = `'full' | 'rotation' | 'vertical' | 'horizontal' | 'none'`). D8 supported for octagon.
- `editor/orbit.ts` — `orbitEdges` / `placeTilesOnOrbit` / `orbitTileIds` / `placePolygonsOnOrbit` for symmetry-aware placement, delete, and multi-vertex Complete; also exports an orbit-aware `viableSidesForEdge` plus `placeTilesOnVertexOrbit` for 17.13 vertex placement.
- `editor/complete.ts` + `editor/completeN.ts` — gap polygon resolution + `tryRegularFit` + irregular fallback + multi-vertex `completeNGap` validator. This is the Design-Phase **Complete** operation (ADR-0002).
- `editor/tileTypeId.ts` — Q11 canonical-signature `tileTypeId`: `"<n>"` for regulars, `"<n>i:<8-char hex>"` for irregulars.
- `editor/tileTypes.ts` — `editorTileTypes` for the Composition-Phase panel + Q15 lazy + additive `seedFiguresForEditor` + `DEFAULT_EDITOR_FIGURE` (the per-tile-type default a fresh Tile type seeds with, also the target for `RESET_FIGURES`). Reducer routes Builder mutations through `seedFigures` (which walks `allCells`).
- `editor/lattice.ts` — single-cell `editorLatticeStamps` for the 17.6 Composition-Phase **Lattice** preview (square + hex + triangle via 2-orientation cell). `editorNeighbourStamps` (= `editorLatticeStamps` minus the identity/centre copy) drives the 17.6d Design-Phase "Show neighbours" preview **and** the Complete-mode clickable neighbour vertices — the **full visible lattice**, not a fixed ring (user decision 2026-05-31: drop the one-ring restriction for flexibility + reliance on alert messages). `editorOneRingNeighbourStamps` survives only on the now-dead `placePolygonsOnOrbit` chain. Octagon + dodecagon shapes return null — those only tile inside a multi-cell Configuration.
- `editor/boundaryInward.ts` — Step 17.12 boundary-inward placement. Exports `BoundarySection`, `computeBoundarySections(cell)`, `placeRegularNGonOnBoundarySection`, plus the size-→-fraction schedule (`sectionFractionForBoundarySize`, 0.30 at boundary 80 → 0.10 at boundary 800). Always-on in Design Phase + Place mode; works on the active Cell of single-cell and multi-cell Patches (per-Cell No Seed toggle gates whether the Cell starts empty for this flow). Placed Tiles are sized to the Patch's shared `edgeLength` (uniform with vertex/edge placement, user decision 2026-05-31) and the placement no longer rescales `patch.edgeLength` — the section is just the anchor point. The `sectionLength` field still drives the click-target highlight size, not the placed Tile size.
- `editor/vertexPlacement.ts` — Step 17.13 vertex-anchored placement. `ExposedVertex` + `computeExposedVertices(cell)` (Cell corners + inward-only Boundary corners), `placeRegularNGonOnVertex`, `vertexPlacementOrientations` (flush-CW / centred / flush-CCW snap rotations; emits overlapping orientations **tagged `overlaps`** for Flexible placement), `isVertexPlacementViable` (shared edge-cross probe), `viableSidesForVertex` (overlap-free) + `placeableSidesForVertex` (all angularly-fitting). Single-cell **and multi-cell** (2026-06-18): the geometry + orbit are Cell-local and Cell-scoped. Canvas aggregates `computeExposedVertices` across EVERY Cell (each tagged `hostCellId`), lifts them into Patch space via `applyCellTransform(..., patchRot)`, and the picker derives viability/preview/edge-length from the selected vertex's host Cell; `EDITOR_PLACE_TILE_ON_VERTEX` carries `hostCellId` and routes via `updateCell`. `ExposedVertex.hostCellId` + the layer's composite `vertexUid` disambiguate colliding Cell-local keys. Boundary-section (17.12) is aggregated the same way (the selection's `hostCellId` rides on the placement action).
- `editor/compositionLattice.ts` — multi-cell siblings: `compositionToPolygons` (Seed Tiles transformed by `EditorCell.center` + rotation), `compositionBoundaryOutlines` (visual Cell-Boundary outlines), `compositionLatticeStamps` (Lattice cell vectors at `patch.edgeLength`), `compositionNeighbourStamps` (= `compositionLatticeStamps` minus the centre copy; the multi-cell "Show neighbours" / Complete-mode neighbour set, full visible lattice), `compositionCellBasis`. `compositionOneRingStamps` is now unused (superseded by `compositionNeighbourStamps`). `compositionCellBasis` switches per `patch.configuration` — every shipping Configuration has its lattice basis here.
- `editor/presetConversion.ts` — Gallery↔Lab convergence (ADR-0006, ticket #4): pure `convertPresetToEditorConfig(PatternConfig) → PatternConfig | null`. Hand-authored tier-1 table (shipped multi-cell Configurations, incl. tier-2 rows as they land per #8, + boundary-matching single-cell sq/hex/tri) → existing `createDefault*` seeds, rescaled to `tiling.scale`; figures/strand/θ carried (regulars share `tileTypeId` keys), Gallery `config.frame` → `editor.frame` clip Shape Frame (Q8a), `presetId` provenance stamped (schema field on `EditorPatch`, preserved by `migrateV3`). Tier-2/3 → `null` (`isConvertiblePreset`). Fingerprint suite `presetConversion.fingerprint.test.ts` (BFS vs converted lattice: window coverage exact, per-type emission, count+Σlen density tolerances).
- `editor/presetShelf.ts` — Presets shelf pure logic (ADR-0006, ticket #5): `buildPresetShelf` (every Gallery preset → tiered entry, ordered tier 1→3; view-only badge = `!isConvertiblePreset`, so tier-2 entries shed it as conversion rows land), `buildPresetConfig` (fresh working config per click — tier-1 via `convertPresetToEditorConfig` with `presetId` provenance, view-only tiers load the legacy Gallery config), `isStructuralEditAction` + `shouldShowStructuralEditNote` (one-time note on first place/delete/Complete/boundary-resize of a converted preset; θ/figure/strand/decoration always silent), `actionResetsDirty` (unsaved-changes-guard transitions: LOAD_CONFIG / EDITOR_NEW / EDITOR_CLEAR clean, everything else dirty; library Save cleans via `ConfigLibraryPanel.onSaved`). UI: `components/PresetShelfPanel.tsx` read-only cards + TessellationLabMode wiring (dirty ref on the dispatch wrapper, `window.confirm` guard on shelf clicks, fixed non-blocking banner persisted at show time under localStorage `preset-structural-note-shown-v1`).
- `editor/guides.ts` — **Guides slices 1–3** (CONSTRUCTION_GUIDES_SPEC.md, ADR-0008, #26 lines + #27 circles + #28 Anchor engine/Complete): pure geometry for the Design-Phase **Construct** mode (third Tool beside Place/Complete; `EditorMode` union lives in `types/appMode.ts`). `EditorGuide = EditorGuideLine | EditorGuideCircle` lives on `EditorPatch.guides` (optional additive, validated in `migrations.ts`; `EditorGuidePatch` = union-friendly popup/drag patch, re-pinned per-kind by the reducer's `mergeGuide`). The Construct toolbar picks the `GuideTool` (`'line' | 'circle' | 'divided-circle'`, Lab-level state). **Lines**: `guideLineSpan` (extend none/start/end/both, Liang–Barsky clip), `snapAngle` (`ANGLE_STEP_PRESETS`, references horizontal + start-edge direction; Shift = freehand), typed-angle correction. **Circles** (`createGuideCircle`): centre + `radius` scalar + `phase` (drawn-radius angle, so a division can aim at a snapped vertex); a **divided** circle carries `divisions` n → `guideCircleDivisionPoints` emits **2n** rim Anchors (`DEFAULT_CIRCLE_DIVISIONS` = 6); `guideCircleTickPoints` are **arc-spaced** (count = round(circumference/spacing)); the radius handle drags = resize + rotate. `guideIntersections` dispatches line×line / line×circle / circle×circle (all respect line `extend`). `collectSnapPoints` (tile vertices + edge midpoints + Boundary corners + Guide anchors/intersections); `guideAnchorPoints` branches per kind. UI: `EditorGuideLayer` (passive outside Construct; interactive strokes/rings + endpoint/centre/radius drag handles + line-or-circle draft preview in-mode; empty-canvas clicks are detected by wrapped svg pan handlers in `Canvas` — an in-layer capture rect would lose the pointerup to `usePanZoom`'s pointer capture) + `GuidePopupOverlay` (shared stamp / ticks / delete, wrapping a per-kind block: line = extend + typed angle; circle = radius + size presets ×√2 / = edge + n-division). Reducer: `EDITOR_ADD_GUIDE` / `EDITOR_UPDATE_GUIDE` (history-coalesces per `guideId`) / `EDITOR_DELETE_GUIDE`, all Design-mode undoable. Composition hides Guides behind a "Show guides" toggle (CompositionPanel); exports strip them via the editorOverlay `data-export="exclude"` wrapper. **Slice 3 (#28) — Anchor engine + Complete-on-Anchors:** `collectGuideAnchors(patch, patchRot)` is the single Anchor source (self anchors + Guide×Guide + Guide×Tile-edge/`guideEdgeIntersections`/Cell-Boundary crossings), each `GuideAnchor` carrying `guideId` + a `stamp` flag (intersection = AND of both Guides; dedupe downgrades a coincident stamping point to world-space). Anchors join the Complete pick set (`Canvas.guideAnchorVertices` → `EditorVertexLayer` `guide-anchor`/`guide-anchor-stamp` variants, colour = stamp state) + `validateMultiPick`; the reducer's `multiPickCompleteAcrossPatch` treats Anchors as pickable + grounding so **free-standing Anchor-only Completes** are allowed (spec Decision 4). Storage: a **non-stamping** Anchor pick → world-space `patch.guideTiles` (frame-completion model — render once, never repeat under the Lattice; `guideCompleteWorldSpace`); a **stamping** Anchor → ordinary Cell Tile. `guideTiles` migrate (`migrateV3`), seed Figures additively, render in the Design + Composition PIC paths (and drop the periodic fast-path). **Slice 3 cont. (#33) — Place-on-Anchors:** Guide Anchors also join the Design-Phase **Place** vertex picker as synthetic full-2π `ExposedVertex`es (`ExposedVertex.guideAnchor` marker, Patch-world `p`, no host Cell; Canvas builds them in `cellLocalVertices`, dropping any coincident with a real vertex). A **world probe Cell** — the shared `worldProbeCell(patch, patchRot)` + `worldTileVertexArrays` in `patchSelectable.ts` (identity transform, sym `none`, all world Tiles incl. frame + guide completions as irregular), used by EVERY world-space path (frame completion, `guideCompleteWorldSpace`, `placeTileOnGuideAnchor`, `validateMultiPick`, Canvas) — lets `placeRegularNGonOnVertex` + `isVertexPlacementViable` run unchanged; Canvas threads an `effectiveVertexCell`/`effectiveEdgeLength` (= probe Cell + the active Cell's `cellPlacementEdgeLength`, NOT raw `patch.edgeLength`) through the viability / orientations / preview / world-pos / commit paths (preview skips the Cell transform since the Tile is already world-space). Reducer `EDITOR_PLACE_TILE_ON_ANCHOR` (`placeTileOnGuideAnchor`) mirrors `guideCompleteWorldSpace`: re-derives the Anchor's stamp (fails closed on stale) → non-stamping ⇒ `patch.guideTiles` single, stamping ⇒ active-Cell Tile(s) with the Cell's **symmetry orbit propagated all-or-nothing** (orbit in Cell-local frame via `transformVertexRotation` exported from `orbit.ts`, each image overlap-probed in world frame, world→Cell-local convert per image); sizing = `cellPlacementEdgeLength`; overlap rides `force`. Synthetic Anchor vertices come from the shared `makeAnchorVertex(p)` factory (`vertexPlacement.ts`, truthful full-2π sector); Canvas injects them only when `onPlaceTileOnAnchor` is wired and drops Anchors coincident with a real vertex on the `vertexKeyOf` 1e-4 rounded-key grid (matches `dedupeAnchors`). Anchor dots colour by stamp in `EditorVertexPlacementLayer` (blue = world-space, violet = repeats). Stamped-Tile host-Cell resolution (geometric containment vs activeCell) is ticket #34; Anchor orbit-collision badging folds into #29.
- `editor/nonTilingDetection.ts` — 17.10 Patch-vs-Cell-Boundary area compare for the Composition-Phase warning tag.
- `editor/migrations.ts` — load-time validation; switches on `r.version` (1 = legacy single-cell; 2 = legacy single-cell or multi-cell with `BoundaryComposition`; 3 = current, always `cells[]`). `ANY_CELL_SHAPES` (multi-cell) admits octagon + dodecagon; `SINGLE_CELL_SHAPES` doesn't. `CONFIGURATION_IDS` is the allow-list — extend when adding a new multi-cell Configuration.
- `editor/history.ts` + `editor/useEditorHistory.ts` — undo/redo with `DESIGN_MODE_ACTIONS` allowlist, depth 50, 500 ms coalesce keyed on `historyCoalesceKey` (action type + payload `cellId`/`hostCellId`, so same-control edits on different Cells stay separate undo steps). `SET_BUILDER_CONFIGURATION` is in the set.
- `usePattern` accepts `editorStrandMode`, `showBoundaryLattice`, `editorNeighbourPreview`, `editorNeighbourBoundaries`, `editorNeighbourStrands`. Branches once on `patch.cells.length > 1` for the Builder branch — multi-cell uses `compositionToPolygons` + `compositionLatticeStamps` + `compositionBoundaryOutlines`. Surfaces `seedOutlineCount` (first N entries of `boundaryOutlines` are seed Cells, rest are ghosts) and `ghostPolygonIds` (Set used by `StrandLayer` to split each Strand into seed/ghost runs and fade the ghost portion).

**Flexible placement (2026-06-01).** Design-Phase Place mode no longer hard-scopes the picker. All three flows (edge / boundary-section / vertex) show **every** `PICKER_SIDES` size; clean sizes commit directly, sizes that would overlap an existing Tile (or, under symmetry, an orbit sibling) are badged ⚠ and route through `OverlapConfirmModal` — a **local popover** (anchored at the picker, Complete-mode Art-Deco styling) whose "Accept" commits with `force: true`. The three placement actions + reducer + all three orbit placers (`placeTilesOnOrbit` / `placeTilesOnVertexOrbit` / `placeTilesOnBoundarySectionOrbit`) take a `force` flag that skips the overlap gate but keeps structural resolution. Overlap detection is the shared edge-cross `overlapsExisting` (`tileOverlap.ts`) across all flows, so symmetry orbit-mate collisions are caught accurately. The `viableSidesFor*` exports are now the **clean** set (used to decide which sizes badge), not a filter. Mirrors the multi-vertex Complete `force` pattern. Canonical memo: `memory/project_flexible_placement_idea.md`.

Authoritative design context lives in `TESSELLATION_REVAMP_PLAN.md` (Step 17 section) and `SESSION_STATE.md` (resume anchor). Eight multi-cell Configurations ship (4.8.8, 3.12.12, 4.6.12, 3.6.3.6, 3.4.6.4, 3.3.3.4.4 via ticket #11, 3.3.4.3.4 snub square via ticket #14, and 3.3.3.3.6 snub hexagonal via ticket #16 — tier 2 is now empty, every Archimedean preset converts). Step 17.12 boundary-inward (single-shape v1) and Step 17.13 vertex placement are delivered.

### Planned stages (see plan file)

`TESSELLATION_REVAMP_PLAN.md` is the live plan. Phase 0 (decisions / terminology / Option-B restructure), Steps 1–11 (Lab scaffold + tilings + Composition-Phase controls), Step 14 (Lab library), and Step 17 v1 (17.0–17.10 + 17.4 re-enabled) are done + signed off. Steps 4–8 / 12–13 were archived under `archive/tessellation-lab/`. Steps 15, 16, 18 (k-uniform / quasi-periodic / Girih substitution) are parked. Captured ideas for future Builder work: cross-Cell Complete + enclosed-pocket Complete (related multi-vertex-gap mechanic).

## Commit Status Tag

After each commit, mention the short commit hash and message in your chat response (e.g. `a1b2c3d: Fix header layout`). This is for the developer's awareness in the conversation — do NOT render it in the application UI.

## Agent skills

### Issue tracker

Issues live in this repo's GitHub Issues, operated via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: `CONTEXT.md` glossary + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
