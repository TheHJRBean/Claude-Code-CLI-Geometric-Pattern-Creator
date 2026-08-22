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
- **Construct** = the Design-Phase tool mode (beside Place/Complete) where **Guides** are drawn (`editor/guides.ts`). **Anchor** = the umbrella term for every single pickable placement/Complete point app-wide (exposed vertices, Frame nodes, boundary-section points, neighbour vertices, Guide anchors) — never "vertex" in UI copy for a pick target (ADR-0008).

## Commands

```bash
npm run dev      # Start Vite dev server
npm run build    # Type-check + production build
npx tsc --noEmit # Type-check only
npx vitest run   # Run the test suite (~1,900 tests across 115 files)
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
   - **Vertex lines have a θ floor** (`pic/vertexStrandRange.ts`). A vertex ray leaves at α = 90° − θ either side of the interior bisector and `vertexRayEntersPolygon` suppresses any ray pointing outside the tile's own wedge, so a vertex emits only while θ **exceeds** `90° − interior/2` — exactly `180/n` on a regular n-gon (60° triangle, 45° square, 15° dodecagon). Below it the family draws *nothing at all*, which reads as "the strands disappeared". `vertexStrandRange(vertices)` returns `anyFrom` / `allFrom` (an irregular Tile has a partial band between its widest and sharpest corner); `editorTileTypes` puts it on `TileTypeInfo` and `FigureControls` states the number beside the toggle. Note the interaction with the never-go-dark guard: switching **Edge strands** off turns Vertex strands *on*, which keeps the promise in form and breaks it in fact whenever θ is under the floor.
5. SVG components render Rays directly; **Lacing** (legacy, broken) uses two-pass stroke rendering — being removed and reintroduced under the Decoration Phase

### Key types

- `PatternConfig` (`types/pattern.ts`) — the serialisable state (saved to JSON). Contains `tiling`, `figures` (Figure recipes per Tile type), `strand`, `edgeAngles`, `smoothTransitions`, `editor`, `frame`, `morph`, and a schema `version`. **Versioned (roadmap #6):** `CURRENT_PATTERN_CONFIG_VERSION` in `state/configValidation.ts` owns the dispatch — one reader per generation, mirroring `editor/migrations.ts`. Absent `version` = generation 0 (pre-2026-07-30) and gets the legacy sniffs (`lacing`→`strand`, pre-#48 morph, rosette→star); generation 1+ accepts only the current shape. Newer-than-build is refused by `loadPatternConfig` and downgraded best-effort by `readPatternConfig`. Adding a field means adding it to **`PATTERN_CONFIG_KEYS` and `readConfig`** in the same commit — the allow-list *deletes* unlisted fields, and a dev-only warning names anything dropped.
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
- `editor/patchLattice.ts` — **the one place anything asks where a Patch repeats.** `patchLatticeStamps` / `patchNeighbourStamps` own the single-cell vs multi-cell dispatch that used to be spelled out at every call site, and with it the third case: **Freeform** (`EditorPatch.freeform`), which returns the identity stamp / the empty set. Every consumer goes through it — the Composition field, the Design ghosts, `patchSelectable`'s neighbour pick targets, the stamped Guide copies, the Decoration orbit ring — so "no tiling" cannot mean different things in different places; a site keeping its own dispatch would go on stamping the Lattice the user switched off, and the symptom is a canvas that looks unchanged.
- `editor/boundaryInward.ts` — Step 17.12 boundary-inward placement. Exports `BoundarySection`, `computeBoundarySections(cell)`, `placeRegularNGonOnBoundarySection`, plus the size-→-fraction schedule (`sectionFractionForBoundarySize`, 0.30 at boundary 80 → 0.10 at boundary 800). Always-on in Design Phase + Place mode; works on the active Cell of single-cell and multi-cell Patches (per-Cell No Seed toggle gates whether the Cell starts empty for this flow). Placed Tiles are sized to the Patch's shared `edgeLength` (uniform with vertex/edge placement, user decision 2026-05-31) and the placement no longer rescales `patch.edgeLength` — the section is just the anchor point. The `sectionLength` field still drives the click-target highlight size, not the placed Tile size.
- `editor/vertexPlacement.ts` — Step 17.13 vertex-anchored placement. `ExposedVertex` + `computeExposedVertices(cell)` (Cell corners + inward-only Boundary corners), `placeRegularNGonOnVertex`, `vertexPlacementOrientations` (flush-CW / centred / flush-CCW snap rotations; emits overlapping orientations **tagged `overlaps`** for Flexible placement), `isVertexPlacementViable` (shared edge-cross probe), `viableSidesForVertex` (overlap-free) + `placeableSidesForVertex` (all angularly-fitting). Single-cell **and multi-cell** (2026-06-18): the geometry + orbit are Cell-local and Cell-scoped. Canvas aggregates `computeExposedVertices` across EVERY Cell (each tagged `hostCellId`), lifts them into Patch space via `applyCellTransform(..., patchRot)`, and the picker derives viability/preview/edge-length from the selected vertex's host Cell; `EDITOR_PLACE_TILE_ON_VERTEX` carries `hostCellId` and routes via `updateCell`. `ExposedVertex.hostCellId` + the layer's composite `vertexUid` disambiguate colliding Cell-local keys. Boundary-section (17.12) is aggregated the same way (the selection's `hostCellId` rides on the placement action).
- `editor/compositionLattice.ts` — multi-cell siblings: `compositionToPolygons` (Seed Tiles transformed by `EditorCell.center` + rotation), `compositionBoundaryOutlines` (visual Cell-Boundary outlines), `compositionLatticeStamps` (Lattice cell vectors at `patch.edgeLength`), `compositionNeighbourStamps` (= `compositionLatticeStamps` minus the centre copy; the multi-cell "Show neighbours" / Complete-mode neighbour set, full visible lattice), `compositionCellBasis`. `compositionOneRingStamps` is now unused (superseded by `compositionNeighbourStamps`). `compositionCellBasis` switches per `patch.configuration` — every shipping Configuration has its lattice basis here.
- `editor/presetConversion.ts` — Gallery↔Lab convergence (ADR-0006, ticket #4): pure `convertPresetToEditorConfig(PatternConfig) → PatternConfig | null`. Hand-authored tier-1 table (shipped multi-cell Configurations, incl. tier-2 rows as they land per #8, + boundary-matching single-cell sq/hex/tri) → existing `createDefault*` seeds, rescaled to `tiling.scale`; figures/strand/θ carried (regulars share `tileTypeId` keys), Gallery `config.frame` → `editor.frame` clip Shape Frame (Q8a), `presetId` provenance stamped (schema field on `EditorPatch`, preserved by `migrateV3`). Tier-2/3 → `null` (`isConvertiblePreset`). Fingerprint suite `presetConversion.fingerprint.test.ts` (BFS vs converted lattice: window coverage exact, per-type emission, count+Σlen density tolerances).
- `editor/presetShelf.ts` — Presets shelf pure logic (ADR-0006, ticket #5): `buildPresetShelf` (every Gallery preset → tiered entry, ordered tier 1→3; view-only badge = `!isConvertiblePreset`, so tier-2 entries shed it as conversion rows land), `buildPresetConfig` (fresh working config per click — tier-1 via `convertPresetToEditorConfig` with `presetId` provenance, view-only tiers load the legacy Gallery config), `isStructuralEditAction` + `shouldShowStructuralEditNote` (one-time note on first place/delete/Complete/boundary-resize of a converted preset; θ/figure/strand/decoration always silent), `actionResetsDirty` (unsaved-changes-guard transitions: LOAD_CONFIG / EDITOR_NEW / EDITOR_CLEAR clean, everything else dirty; library Save cleans via `ConfigLibraryPanel.onSaved`). UI: `components/PresetShelfPanel.tsx` read-only cards + TessellationLabMode wiring (dirty ref on the dispatch wrapper, `window.confirm` guard on shelf clicks, fixed non-blocking banner persisted at show time under localStorage `preset-structural-note-shown-v1`).
- `editor/guides.ts` — **Guides slices 1–3** (CONSTRUCTION_GUIDES_SPEC.md, ADR-0008, #26 lines + #27 circles + #28 Anchor engine/Complete): pure geometry for the Design-Phase **Construct** mode (third Tool beside Place/Complete; `EditorMode` union lives in `types/appMode.ts`). `EditorGuide = EditorGuideLine | EditorGuideCircle` lives on `EditorPatch.guides` (optional additive, validated in `migrations.ts`; `EditorGuidePatch` = union-friendly popup/drag patch, re-pinned per-kind by the reducer's `mergeGuide`). The Construct toolbar picks the `GuideTool` (`'line' | 'circle' | 'divided-circle'`, Lab-level state). **Lines**: `guideLineSpan` (extend none/start/end/both, Liang–Barsky clip), `snapAngle` (`ANGLE_STEP_PRESETS`, Shift = freehand), typed-angle correction. Its references come from **`angleReferencesAt(p, snapPolygons)`**: the Tile edges meeting at the start point, or — when none does — the edges of the *smallest* polygon containing it (so a Guide from a Tile centre is still measured against that Tile, not the Cell-Boundary around it), each contributing its direction **and its perpendicular**. 90°-off-an-edge is the most-wanted construction angle and is NOT free from the edge direction alone — 36°/72° don't divide 90. Every reference is gridded from both ends, since `ref + π` is only already on the grid when the step divides 180°. **Circles** (`createGuideCircle`): centre + `radius` scalar + `phase` (drawn-radius angle, so a division can aim at a snapped vertex); a **divided** circle carries `divisions` n → `guideCircleDivisionPoints` emits **2n** rim Anchors (`DEFAULT_CIRCLE_DIVISIONS` = 6); `guideCircleTickPoints` are **arc-spaced** (count = round(circumference/spacing)); the radius handle drags = resize + rotate. `guideIntersections` dispatches line×line / line×circle / circle×circle (all respect line `extend`). `collectSnapPoints` (tile vertices + edge midpoints + Boundary corners + Guide anchors/intersections, which include every **Tile centre** via `tileCentreAnchors` — Cell Tiles `stamp: true`, world-space frame/`guideTiles` `stamp: false`); `guideAnchorPoints` branches per kind. **Edge snap:** `collectSnapEdges` (every Tile + Cell-Boundary edge, world Tiles included) + `snapToEdge` (perpendicular foot clamped to the segment, carrying the edge angle so continuation/perpendicular angle refs come free). **`resolveDrawPoint`** owns the whole precedence — drawing and all three handle drags go through it, so they cannot drift. A discrete point **always** beats an edge (every vertex, midpoint and centre lies *on* an edge at distance 0, so ranking by distance alone would make them unreachable); between the angle ray and the edge it takes whichever moves the cursor **less**. That middle rule is load-bearing in both directions: edge-first swallowed the angle snap near any Tile (a line aimed 3° off perpendicular got dragged onto whatever edge its far end drifted near), and angle-first would make an edge unhittable, because an angle snap always returns something. The snap marker draws a tangent bar for `'tile-edge'`: the bare ring would claim a fixed point. **Tile centres escape the `guideAnchorsVisible` gate** via `tileCentreGuideAnchors` — every other Anchor is a Guide's own point or a crossing, so it may only be picked while its Guide is on screen, but a centre belongs to the Tile: Place and Complete offer it in a Patch with no Guides at all (the reducers re-derive from the full `collectGuideAnchors`, which always contains it, so nothing downstream changes). UI: `EditorGuideLayer` (passive outside Construct; interactive strokes/rings + endpoint/centre/radius drag handles + line-or-circle draft preview in-mode; empty-canvas clicks are detected by wrapped svg pan handlers in `Canvas` — an in-layer capture rect would lose the pointerup to `usePanZoom`'s pointer capture; **`canSelectAt` gates the hit strokes**: a stroke click selects only when no draft is in progress AND the position resolves to no snap point, otherwise the handler declines to `stopPropagation` and the pointerdown reaches the svg so the click draws. Placement beats re-selection — a radial fan otherwise stalls after two lines, because the hub they share is buried under their own 12 px hit strokes. Evaluated from the pointerdown's own position, not the hover state, so a click with no preceding move decides identically) + `GuidePopupOverlay` (shared stamp / ticks / delete, wrapping a per-kind block: line = extend + typed angle; circle = radius + size presets ×√2 / = edge + n-division). Reducer: `EDITOR_ADD_GUIDE` / `EDITOR_UPDATE_GUIDE` (history-coalesces per `guideId`) / `EDITOR_DELETE_GUIDE`, all Design-mode undoable. Composition hides Guides behind a "Show guides" toggle (CompositionPanel); exports strip them via the editorOverlay `data-export="exclude"` wrapper. **Slice 3 (#28) — Anchor engine + Complete-on-Anchors:** `collectGuideAnchors(patch, patchRot)` is the single Anchor source (self anchors + Guide×Guide + Guide×Tile-edge/`guideEdgeIntersections`/Cell-Boundary crossings), each `GuideAnchor` carrying `guideId` + a `stamp` flag (intersection = AND of both Guides; dedupe downgrades a coincident stamping point to world-space). Anchors join the Complete pick set (`Canvas.guideAnchorVertices` → `EditorVertexLayer` `guide-anchor`/`guide-anchor-stamp` variants, colour = stamp state) + `validateMultiPick`; the reducer's `multiPickCompleteAcrossPatch` treats Anchors as pickable + grounding so **free-standing Anchor-only Completes** are allowed (spec Decision 4). Storage: a **non-stamping** Anchor pick → world-space `patch.guideTiles` (frame-completion model — render once, never repeat under the Lattice; `guideCompleteWorldSpace`); a **stamping** Anchor → ordinary Cell Tile. `guideTiles` migrate (`migrateV3`), seed Figures additively, render in the Design + Composition PIC paths (and drop the periodic fast-path). **Slice 3 cont. (#33) — Place-on-Anchors:** Guide Anchors also join the Design-Phase **Place** vertex picker as synthetic full-2π `ExposedVertex`es (`ExposedVertex.guideAnchor` marker, Patch-world `p`, no host Cell; Canvas builds them in `cellLocalVertices`, dropping any coincident with a real vertex). A **world probe Cell** — the shared `worldProbeCell(patch, patchRot)` + `worldTileVertexArrays` in `patchSelectable.ts` (identity transform, sym `none`, all world Tiles incl. frame + guide completions as irregular), used by EVERY world-space path (frame completion, `guideCompleteWorldSpace`, `placeTileOnGuideAnchor`, `validateMultiPick`, Canvas) — lets `placeRegularNGonOnVertex` + `isVertexPlacementViable` run unchanged; Canvas threads an `effectiveVertexCell`/`effectiveEdgeLength` (= probe Cell + the active Cell's `cellPlacementEdgeLength`, NOT raw `patch.edgeLength`) through the viability / orientations / preview / world-pos / commit paths (preview skips the Cell transform since the Tile is already world-space). Reducer `EDITOR_PLACE_TILE_ON_ANCHOR` (`placeTileOnGuideAnchor`) mirrors `guideCompleteWorldSpace`: re-derives the Anchor's stamp (fails closed on stale) → non-stamping ⇒ `patch.guideTiles` single, stamping ⇒ active-Cell Tile(s) with the Cell's **symmetry orbit propagated all-or-nothing** (orbit in Cell-local frame via `transformVertexRotation` exported from `orbit.ts`, each image overlap-probed in world frame, world→Cell-local convert per image); sizing = `cellPlacementEdgeLength`; overlap rides `force`. Synthetic Anchor vertices come from the shared `makeAnchorVertex(p)` factory (`vertexPlacement.ts`, truthful full-2π sector); Canvas injects them only when `onPlaceTileOnAnchor` is wired and drops Anchors coincident with a real vertex on the `vertexKeyOf` 1e-4 rounded-key grid (matches `dedupeAnchors`). Anchor dots colour by stamp in `EditorVertexPlacementLayer` (blue = world-space, violet = repeats). Stamped-Tile host-Cell resolution (geometric containment vs activeCell) is ticket #34; Anchor orbit-collision badging folds into #29.
- `editor/promoteGuideTiles.ts` — the escape hatch off the world-space bucket. The world-space/Cell fork is settled at Complete time by a Guide flag that **defaults OFF**, and flipping a Guide's Stamp afterwards cannot reach Tiles already minted — so a scaffold-first session (the workflow spec Decision 4 exists to enable) silently produces a Patch whose new Tiles never repeat. `promoteGuideTiles(patch, patchRot)` re-homes every `patch.guideTiles` entry into the Cell containing it and clears the bucket; the Cell transform is rigid, so a regular Tile keeps its `edgeLength` and an irregular one its winding, and **the Tile does not move** (the property the tests pin — a promotion that also shifted the Tile would be worse than the bug). Host is `resolveHostCell` on the Tile's **centroid**, not the Anchor that made it: an Anchor is a corner and can sit on a Boundary two Cells share. Ids are re-minted `promoted-*` because the source ids are unique only within `guideTiles`. Action `EDITOR_PROMOTE_GUIDE_TILES` (undoable — it rewrites every world Tile at once, so it must be one step); UI is the shared `WorldSpaceTilesNotice` (`labShared.tsx`) + a **Repeat under Lattice** button, shown whenever such Tiles exist, including after the Guides that made them are gone. It renders in **both** live Phases deliberately: the symptom ("my Tiles are missing from the neighbouring patches") is what **Composition** shows, and a fix reachable only from Design is a fix the user never finds — the Design copy explains the Guide Stamp flag, the Composition copy states the consequence in lattice terms.
- `editor/guideOrbit.ts` — **Guides slice 4** (#29, spec Decision 8): symmetry-orbit drawing + linked Guide groups. Drawing a Guide inside a Cell with an active **Symmetry** picker lays down its whole orbit — same lever as tile placement, no separate control. Guides are Patch-world but `Sym` is Cell-local, so every transform round-trips `inverseCellTransform` → `applySym` → `applyCellTransform` (`transformGuide`: lines carry both endpoints so parametric `manualAnchors` stay valid; circles carry centre **and** `guideCircleRadiusPoint` so `phase` falls out, and a reflection negates the circle's CCW `manualAnchors`). `guideHostCell` resolves by **strict containment** of the anchor click (line `start` / circle `center`) via `cellContainingPoint` — deliberately NOT `resolveHostCell`, whose nearest-Cell fallback would make "Guides drawn outside any Cell are always singles" unreachable. `expandGuideOrbit` dedupes coincident images (a Guide on a mirror axis) and returns an unlinked single when nothing propagates: no host Cell, `symmetryMode` `'none'`, or a **divided** circle (self-symmetric via its n-division). Membership rides on each Guide as `GuideGroupRef` = group id + `cellId` + a **snapshot** of `mode` + this member's `symIndex` — the snapshot is what stops a later picker change from silently adding/destroying members; `symIndex` is what keeps ids stable across edits (React keys, the open popup, the undo coalesce key). `regenerateGuideGroup` treats the edited member as authoritative: pull back through `inverseSym(own)` to the group's base frame, push out through each sibling's own element — settings copy verbatim, geometry reshapes the orbit symmetrically instead of collapsing onto the dragged member; fails closed (returns the input) when the host Cell is gone. Reducer: `EDITOR_ADD_GUIDE` expands, `EDITOR_UPDATE_GUIDE` regenerates, `EDITOR_DELETE_GUIDE` removes `guideGroupIds` — one action each, so undo treats a group operation as one step. `group` is typed out of `EditorGuidePatch` and stripped at runtime by `mergeGuide` (membership changes only by drawing or deleting). UI: `EditorGuideLayer` lights every member when one is selected (handles stay on the clicked one), `GuidePopupOverlay` badges "⇄ linked ×n" + "Delete all n", `DesignPanel`'s Construct help says what Symmetry will do.
- `editor/guideStamps.ts` — **Guides slice 5** (#30, spec Decisions 2 + 9): **stamping under the Lattice**. A `LatticeStamp` acts directly on Patch-world coords, so — unlike `guideOrbit.ts` — there is no Cell frame to round-trip and a circle's CCW `manualAnchors` need no correction (a stamp is a rigid motion, never a reflection). `stampGuide` moves a line's endpoints / a circle's centre **and** radius point (so a rotating stamp turns `phase`); `stampingGuides` + `stampedGuideCopies` build the ghost set; `ghostStampsOnly` drops the identity copy (the Design neighbour set already excludes the centre, the **Composition Lattice set does not**, and the live Patch draws that one at full strength). `neighbourGuideAnchors` derives from a Patch narrowed to the **stamping** Guides — so a crossing with a non-stamping Guide, which exists only on the live Patch, is never reproduced on a neighbour — and drops Tile-centre Anchors (they belong to the Tiles, not a Guide) via the new `collectGuideAnchors(..., { includeTileCentres: false })` option. `isNeighbourGuideAnchor` is the membership test the validator + reducer share. Pick semantics mirror neighbour *vertices* exactly: a neighbour Anchor is **pickable but not grounding**, so `validateMultiPick` / `multiPickCompleteAcrossPatch` still refuse an Anchor-only neighbour polygon; those anchors are always `stamp: true`, so a Complete there mints an ordinary repeating Cell Tile. Render: `EditorGuideLayer` draws the copies first inside `#editor-guide-stamps`, faded + `pointerEvents: none`, with no hit stroke, drag handles or dashed extend span (a `both`-extended Guide across a wide lattice would otherwise wash the canvas out); Canvas feeds neighbour stamps in Design (under "Show neighbours") and the full Lattice in Composition. Overlay toggles (all session state, none persisted): Design **Show guides** (Construct mode overrides it) + nested **Show anchors**, a **Show guides** under the neighbours group, and Composition's existing toggle now covering the stamped copies + its own **Show anchors**. The three default-ON toggles are reported by their **OFF** state in bug capture (`describeLabOverlays`). Export exclusion is structural — the whole layer sits inside `PatternSVG`'s `data-export="exclude"` wrapper.
- `editor/nonTilingDetection.ts` — 17.10 Patch-vs-Cell-Boundary area compare for the Composition-Phase warning tag.
- `editor/migrations.ts` — load-time validation; switches on `r.version` (1 = legacy single-cell; 2 = legacy single-cell or multi-cell with `BoundaryComposition`; 3 = current, always `cells[]`). `ANY_CELL_SHAPES` (multi-cell) admits octagon + dodecagon; `SINGLE_CELL_SHAPES` doesn't. `CONFIGURATION_IDS` is the allow-list — extend when adding a new multi-cell Configuration.
- `editor/history.ts` + `editor/useEditorHistory.ts` — undo/redo with `DESIGN_MODE_ACTIONS` allowlist, depth 50, 500 ms coalesce keyed on `historyCoalesceKey` (action type + payload `cellId`/`hostCellId`/`guideId`/decoration `key`, so same-control edits on different Cells — or paints on different Void groups — stay separate undo steps). `SET_BUILDER_CONFIGURATION` is in the set. **Decoration (2026-08-04):** every paint action is on the allowlist (fills, strand colours, Stamps, all three gradients, `COMBINE_VOIDS` / `SEPARATE_VOIDS`, `CLEAR_DECORATION`), and a snapshot is a **pair** — `HistorySnapshot = { editor, decoration }` — because decoration has two homes (`decoration/store.ts`): a Patch's rides inside `EditorConfig`, a legacy substrate's sits at `config.decoration`. `restoreSnapshotActions` owns how one goes back and **omits** `EDITOR_RESTORE_SNAPSHOT` when there is no Patch on either side (that action with a `null` payload *clears the Lab*, which used to blank a painted preset on the first Ctrl+Z); the paired `RESTORE_DECORATION_SNAPSHOT` writes the legacy home only and is inert while a Patch is loaded. UI: the sidebar's Undo/Redo row (`labShared.tsx::HistoryButtonRow`) is shared by both substrates and carries a third **Clear paint** button in the Decoration Phase (`CLEAR_DECORATION`, confirm-guarded, disabled via `hasDecoration`) — deliberately NOT labelled "Clear", which in Design wipes the whole Patch.
- `usePattern` accepts `editorStrandMode`, `showBoundaryLattice`, `editorNeighbourPreview`, `editorNeighbourBoundaries`, `editorNeighbourStrands`. Branches once on `patch.cells.length > 1` for the Builder branch — multi-cell uses `compositionToPolygons` + `compositionLatticeStamps` + `compositionBoundaryOutlines`. Surfaces `seedOutlineCount` (first N entries of `boundaryOutlines` are seed Cells, rest are ghosts) and `ghostPolygonIds` (Set used by `StrandLayer` to split each Strand into seed/ghost runs and fade the ghost portion).

**Flexible placement (2026-06-01).** Design-Phase Place mode no longer hard-scopes the picker. All three flows (edge / boundary-section / vertex) show **every** `PICKER_SIDES` size; clean sizes commit directly, sizes that would overlap an existing Tile (or, under symmetry, an orbit sibling) are badged ⚠ and route through `OverlapConfirmModal` — a **local popover** (anchored at the picker, Complete-mode Art-Deco styling) whose "Accept" commits with `force: true`. The three placement actions + reducer + all three orbit placers (`placeTilesOnOrbit` / `placeTilesOnVertexOrbit` / `placeTilesOnBoundarySectionOrbit`) take a `force` flag that skips the overlap gate but keeps structural resolution. Overlap detection is the shared edge-cross `overlapsExisting` (`tileOverlap.ts`) across all flows, so symmetry orbit-mate collisions are caught accurately. The `viableSidesFor*` exports are now the **clean** set (used to decide which sizes badge), not a filter. Mirrors the multi-vertex Complete `force` pattern.

**Freeform (CONTEXT: Freeform).** A Patch-level flag that turns the Patch from a repeat unit into a one-off drawing. It switches off the **Lattice** (above) and the **Boundary** as an authoring surface together — the outline isn't drawn (`usePattern` returns no `boundaryOutlines`, and refuses `showBoundaryLattice`, which is session state that survives the flip), boundary sections and corners leave the pickers, and `computeExposedVertices(cell, { ignoreBoundary })` stops clipping a corner's open sector to the Boundary's inward wedge. That last one is the half that is easy to miss: withdrawing the *dots* still leaves the picker refusing placements at corners on the invisible outline, for a reason nothing on screen explains — so the Canvas, the reducer's `EDITOR_PLACE_TILE_ON_VERTEX` validator and `placeTilesOnVertexOrbit` all take the same option, or the canvas offers a placement the reducer then drops.

Nothing is rewritten either way: the Boundary geometry stays and still frames the symmetry orbit, resolves Cell containment and feeds the Decoration `cell` rung, so toggling back restores the tiled Patch exactly (which is why the flag is undoable in one step, and why `applyWrap` *suspends* rather than clears). It also **disqualifies the periodic fast path** — `decorationReps` measures its extraction off the nearest neighbouring stamp, which under Freeform is infinitely far away, so every Void fill would resolve to nothing — and it makes an n-Ring **Frame** unavailable (`nRingFrameSupported`) and inert if one was already set. Tests: `editor/freeform.test.ts`.

Authoritative design context lives in `TESSELLATION_REVAMP_PLAN.md` (Step 17 section) and `SESSION_STATE.md` (resume anchor). Eight multi-cell Configurations ship (4.8.8, 3.12.12, 4.6.12, 3.6.3.6, 3.4.6.4, 3.3.3.4.4 via ticket #11, 3.3.4.3.4 snub square via ticket #14, and 3.3.3.3.6 snub hexagonal via ticket #16 — tier 2 is now empty, every Archimedean preset converts). Step 17.12 boundary-inward (single-shape v1) and Step 17.13 vertex placement are delivered.

### Apply to all Tiles (`state/figureBroadcast.ts`)

The Strands panel's **Apply to all Tiles** toggle links every Tile type's Figure
recipe: one edit lands on all of them. It is a **dispatch-layer fan-out**, not a
reducer feature — `broadcastFigureAction(action, enabled, tileTypeIds, figures)`
expands one Figure action into one per Tile type (source first) and the Lab's
`dispatch` wrapper replays them, so the reducer keeps its one-Tile-type contract
and its per-Tile guards (never-go-dark, curve seeding) all still run. Every path
that edits a Figure obeys it, including on-canvas control-point dragging.

- The toggle is **session state, never `PatternConfig`** — an editing mode, not
  pattern data (and so not subject to the `PATTERN_CONFIG_KEYS` two-site rule).
- Targets are the **live Tile types**, not `Object.keys(figures)`: a loaded
  config's figures map can carry stale keys, and broadcasting would revive them.
- `UPDATE_FIGURE_SET` / `REMOVE_FIGURE_SET` reach another Tile type only when its
  set of that id has the same `kind` — ids are per-Figure and collide across
  independently-authored Tiles, and Figure actions have **no undo** (they aren't
  on `DESIGN_MODE_ACTIONS`). `SET_MORPH_ORIGIN_ANGLE` carries a `tileTypeId` and
  is deliberately excluded: it edits a Morph stop's overlay, not the recipe.

### Decoration — Combine (`decoration/voidMerge.ts`)

**Combine** fuses adjacent **Voids** into one shape for the whole Decoration Phase (CONTEXT: Combine). Voids are re-derived from the ray field every frame, so a Combine cannot be an edit of a Void — it is a **record that re-finds its own members**, the same way a `ColourRecord` re-finds the shapes it paints.

- `DecorationConfig.voidMerges?: VoidMergeRecord[]` — each record is an **anchor** named at a Reach rung (`scope` + `key` + `signature`) plus the other members' centroids **in the anchor's canonical pose** (`stamps.ts`). That frame is what makes the `congruent` rung work: a stored offset is a statement about a neighbour's position *relative to the anchor's own shape*, so it carries onto rotated and mirrored instances with no lattice or symmetry bookkeeping. `canonicalPoses` (new, `canonicalPose` = its first element) exposes every tied pose — a **symmetric** anchor needs all of them, since only one aims the offsets at the real neighbours.
- **`canonicalPose`'s tie-break sorts by handedness BEFORE world angle.** A
  self-mirror-symmetric outline ties on both handednesses and their traversals
  start at different vertices, so an angle-first sort picked the mirrored pose
  wherever it happened to point nearer +x — measured on 3.6.3.6, 104 congruent
  Voids all posed at angle 0 with 52 mirrored. The outline is identical under
  that flip; a gradient or stamp posed through it is not, so one Matching-rung
  gradient ran backwards on half the field. A chiral shape reaches its minimal
  token from one direction only, so its genuinely-mirrored placements still
  pose reflected. Pinned by `decoration/gradientPoseProbe.test.ts` over real
  fields.
- `polyUnion.ts::unionOutlines` — union of faces from one arrangement by edge cancellation (they meet edge-to-edge and never properly overlap, so no intersection arithmetic). Re-splits every edge at member vertices first, because `extractVoids` simplifies each face independently and a T-junction kept on one side of a shared edge otherwise defeats pair cancellation. Returns outers + holes + the cancelled **seams**. Its vertex grid is sized off the **mean edge length**, never `tol` — the latter made it quadratic in the pattern's world scale (5.5 s for 78 two-triangle groups on 3.6.3.6); guarded by a scale-invariance ratio test.
- `applyVoidMerges(keyed, merges, stampTranslations, cellFrames)` runs **after** `keyVoids` and re-keys only the composites: keying is the expensive half (`cellOrbitKey`) and must stay memoised on the field, while merges change on a click. Records apply in array order and a Void joins at most one group. A composite is an ordinary `VoidRegion` with a bigger outline (+ `holes` / `seams` / `mergedCount` / `mergedFrom`), so `colourVoids`, `resolveVoidStamps`, `buildVoidTargeting` and the paint overlay are all untouched — and a composite is congruent to another composite of the same shape, so `congruent` paint spreads across combined groups unchanged.
- **A Combine disqualifies the periodic fast path** (`periodicFastPathEligible`): a combined group can straddle the fundamental domain and the `<use>` fragment cannot express a shape that leaves it. `voidMerges` must therefore be an explicit dep of the `stampedField` and `decorationReps` memos — without it `fastPath` stays stale-true and nothing on the canvas changes (same trap the two gradient `enabled` flags hit).
- `rendering/StrandSeamMask.tsx` — **the internal Rays are masked out of the strand layer**, not painted over. Painting over was the first attempt and was wrong in an instructive way: the cover could only be drawn in the group's own paint, so an *unpainted* combined group kept its dividing line and a combine only took visible effect once you also filled it. Masking acts on rendered output, so curves, weave breaks, dashed/double/triple styles and per-strand colours all mask identically — cutting the seam intervals out of the `Segment` field instead would have had to reproduce every one of those AND would have re-chained the strands, moving the identities strand colours are keyed on. The band is clipped to the group's union outline (so it can never reach a Strand outside the group, however wide) and each quad overhangs its seam by a half-width (so interior junctions close, and the outer overhang clips away). Seam groups come from `usePattern`'s `voidSeams`, derived from the keyed field and **deliberately independent of `voidFills`**. World-space branch only (see fast-path note).
- UI: a `combine` **Paint target** whose canvas clicks *pick* Voids into a set rather than committing (a combine means nothing until two are picked); `CombineSection` in `DecorationPanel` commits at the active Reach, or Separates a picked composite via its `mergedFrom` provenance. Combine never counts as `keyedBySignatureAlone` even at Matching — the record stores centroids, and a bound-cut face's centroid is a function of where the bound fell.

### Decoration — Junction ornaments (`decoration/junctionOrnaments.ts`)

A dot / star / twinkle on the **Junctions** — the crossings of the Strand
arrangement (CONTEXT: Junction, Junction ornament). The third paint target
after areas and lines.

- **Where the crossings are is `strand/junctions.ts`**, extracted from
  `computeWeave` so the weave and the ornaments enumerate the same set from the
  same two sources (shared chain points + transversal mid-edge intersections).
  `strandJunctions` adds the incident directions, the degree, a
  rotation/reflection-invariant `signature` (the Matching key) and
  `junctionAngle` (bisector of the widest gap between the incident lines —
  order-independent, so it can't flip with the enumeration).
- **Records re-find their junctions**, like every other decoration record.
  Rungs: congruent `'*'` (All) / congruent `<sig>` (Matching) / `patch` (Repeat)
  / `instance` (Single). **No `cell` (Twins) rung** — that key hashes a
  target's *outline* within the Cell orbit and a junction is a point; a
  `cell`-scoped record from a hand-edited save is ignored, not matched loosely.
- **Ornaments disqualify the periodic fast path**, and so does a live Junctions
  paint target: a crossing on the seam between two copies of the fundamental
  domain is only a chain endpoint inside either one. `periodicFastPathEligible`
  takes `junctionPaintActive` so the render branch and the reps memo read one
  predicate — and both memos list it as an explicit dep
  ([[feedback_predicate_inputs_are_memo_deps]]).
- **A twinkle is not a figure stamped on the junction** — it is the crossing's
  corners rounded off, built FROM the line work (`flarePathD`): in each wedge
  between two adjacent arms, a fillet from a point `reach` along one arm's edge,
  tangent-curved past the corner, out along the next. A thread through a
  crossing continues both ways, so two threads give **four** arms and four
  corners. Consequences: it carries the junction's `arms` on the placement, it
  is never rotated (its frame is the junction's own), and it can't share a
  `<defs>` path. Its second control is **Depth** (stored in `innerRatio`, which
  the star reads as its waist): 1 puts both tangent handles on the corner so
  the curve dips to the tip of the crossing, 0 leaves them at the ends so the
  fillet is a flat chord with no dip.
- **The reach is capped per arm at `StrandJunction.armSpans`.** An arm is a
  unit direction, so on its own it describes a ray with no end: wind the reach
  up and the fillet's straight side sails past the point where the thread
  turned, hanging over empty ground (at reach 200 on 4.8.8 the twinkles flooded
  the whole field). `armSpans` is how far the chain actually runs that way —
  walking THROUGH collinear chain points, since a crossing a thread runs
  straight through is not a bend and capping there would stop short of line
  work that is really there. The two sides of a wedge cap independently, which
  is why `a` and `b` can sit at different distances and why the corner is
  measured from both arms (`t` and `tv`) rather than once.
  - **The backward walk starts on the PREVIOUS edge.** At a chain point the
    arm pointing back along the thread runs down the edge the thread came in
    on; basing it on the edge at `floor(s)` measures nothing (`t` = 0) and
    then compares the previous edge against the wrong reference direction. It
    returned **zero for every backward arm of every chain-point crossing** —
    half the arms on a real field — and a zero span was read as "no end
    known", so those arms silently drew *uncapped*. Measured on 4.6.12 at
    reach 200: extent 200 before, 96.6 after.
  - A missing span therefore means **the minimum**, never "unbounded". That
    substitution is what turned a geometry bug into an invisible one.
  - **The span is a centre-line length; a fillet's side is an OFFSET line.** On
    the inside of a bend the two segments' offsets meet `half·tan(turn/2)`
    *before* the vertex, so a side run to the full span crosses the line work
    and is then cut off square — the visible bump where a long twinkle
    finishes. `StrandJunction.armTurns` carries the signed turn ending each
    run and `insetForTurn` shortens the side the thread bends **toward**; the
    side it bends away from is left alone, because there the Strand's own join
    carries its edge past the vertex and stopping at it is already flush.
    Measured on 4.6.12 at reach 200: the median fillet end sat 0.586 off the
    Strand's edge (29% of the stroke width), now 0.
  - Synthetic fixtures could not catch it: `buildStrands` merges collinear
    runs, so a field built from straight threads yields only *mid-edge*
    crossings, where `t` > 0 and the backward walk is never taken. The guard
    is a real 4.6.12 Patch (`every arm of a real multi-cell field reports a
    real run`) plus a bent-chain-point fixture
    ([[feedback_symmetric_fixtures_hide_asymmetry]]).
- **A twinkle measures itself in world units** (`reach`, `twinkleReach`), not in
  Strand widths like a dot or a star — a separate field and a separate slider,
  because they are separate quantities. Strand width is a drawing weight chosen
  once, so "4 × strand width" on a large Tile is a nub in an empty field, and
  the ceiling of ten of them was the complaint; what the user aims at is a
  distance into the Tile. `size` survives as the fallback for records saved
  before the switch, so they draw at the length they were drawn at.
- **The solid twinkle carries a 1 px `non-scaling-stroke` in its own fill
  colour.** Its straight sides lie *exactly* on the Strand's edges — that is
  what makes it look built from the line work — and two separately-rasterised
  shapes sharing an edge each cover about half of the boundary pixels,
  compositing to a pale hairline right where the ornament is meant to read as
  one swelling with the Strand. Measured: 159/280 samples on the seam were off
  the fill colour, 38/280 after (the residual is the union's own outer fringe —
  1.5 px inside the line work there was never a gap, before or after). It is a
  *device*-pixel stroke deliberately: a world-unit overlap is either too small
  to cover the seam zoomed out or a visible bleed zoomed in.
- **`arms`, never `±dirs` — and this is the whole of `StrandJunction.arms`.**
  `StrandVisit.dir` is the *chord* through a crossing, which is what the weave
  wants (how transversal two threads are). A thread only leaves antiparallel
  where the field is **symmetric** there: on Cairo pentagonal it kinks 15° at
  its contact points, and reconstructing arms as `±dir` put every fillet ~8°
  off the strands it claimed to be rounding — crossing over the line work and
  spiking into open space. `collectStrandVisits` now records both real arms per
  visit, and `junctionSignature` / `junctionAngle` read them too: folding a
  pass onto one undirected *line* throws away exactly the asymmetry that
  distinguishes two junctions. The signature **halves its arm-gap ring when the
  ring repeats every half turn** — which is precisely what a straight junction
  does — so every key on a straight field is byte-identical to the pre-arms
  one and saved `Matching` records still resolve. Only the half turn: a
  right-angle ring is `[90,90,90,90]`, and reducing to its *minimal* period
  would key it as something the old code never emitted.
  Pinned by `src/strand/junctionArms.test.ts` over real straight and bent PIC
  fields — a unit fixture is symmetric unless you make it otherwise, which is
  why every shipped test passed while half the tilings drew it wrong.
- `rendering/StrandJunctionLayer.tsx` — one `<defs>` path per distinct style,
  `<use>` per junction (dot / star); one `<path>` per junction for a twinkle. Above the Strands (a hollow ornament must show its
  inside) and INSIDE the exported tree. A hollow ornament is the same outline
  stroked, with the radius reduced by half the stroke width so toggling hollow
  doesn't visibly grow it.
- **Match the Strand colour** (`matchStrandColour`) resolves the SAME ladder
  that paints the Strands — `decoration/strandColour.ts`, extracted from
  `StrandLayer` so the two cannot drift (an ornament resolving it slightly
  differently would sit on the line work in *almost* its colour). One colour
  per junction: the threads can be painted differently and a wedge is bounded
  by two arms that may belong to two of them, so the first thread in
  enumeration order wins. `'none'` — the hidden-Strand sentinel — **removes**
  the ornament rather than drawing it in nothing. **`usePattern` must supply a
  resolver even when no `strandColours` record exists** — the common case, and
  the Strands are still a colour there (the global one). Passing nothing left
  every matching ornament falling back to its *own* colour, so the option
  looked inert until you had painted a Strand.
- **`layer: 'over' | 'under'`** splits the placements into two layers either
  side of the strand `<g>` (`splitJunctionLayers`); the under layer sits
  outside the Combine seam mask, which exists to erase Rays, not ornaments.
- **Arriving at the Junctions target adopts the ornaments already placed.**
  The records are pattern data; the *selection* they are bound to is session
  state. So a reload — or opening a saved pattern — leaves ornaments on the
  canvas with nothing bound, and every panel control then edits a draft that
  only matters on the next canvas click: the reported symptom was "the twinkle
  doesn't respond to the UI", with no error and every slider moving freely.
  `TessellationLabMode` adopts the **last** record (they are appended in paint
  order) and loads its style, so the sliders show what is actually drawn.
  `junctionDetachedRef` is what keeps **New ornament** meaningful — without it
  the adoption re-binds the group the user just asked to be free of — and the
  panel now *says* when the controls are unbound rather than looking inert.
- **Canvas click vs panel edit** is the `toggle` flag: a click carries it (an
  identical re-click clears the ornament), a panel edit never does, because the
  draft syncs live onto the group last painted and a slider dragged back
  through its old value would otherwise delete the record it is editing.
- **v1 is solid Strands only** (`junctionOrnamentsSupported`) — one predicate
  shared by the renderer and the panel, so the control and what it produces
  can't disagree. Verify: `scripts/verify/junctionOrnaments.mjs`.

### Divided strokes (`rendering/strandStyle.ts`)

One vocabulary for the **Strand** and the **Frame border** — both resolve
through `strandStyleAttrs`, so a style reads identically in the pattern and
around it. `LINE_COUNT_MAX` (20) and `STROKE_WIDTH_MIN/MAX/STEP` (0.5–120)
live here and both sliders read them; they were written out inline once and
drifted to 1–20 and 0.5–120, which read as the Strand supporting fewer
divisions when the ceiling that actually bit was the width one.

- **Bands.** `n` lines and `n − 1` gaps, interleaved from the outside in. The
  ink is ONE masked stroke; `maskBands` alternate cut / restore so the gaps are
  cut out of it rather than painted over (an overdraw would cover the Void
  fills the stroke straddles). Even-index bands are the gap rings
  (`gapRingWidths`), odd-index plus the full width are the line rings
  (`lineRingWidths`).
- **Both bands take colours at three grains** (`GapFillMode`, shared): All /
  Matching (a band and its mirror) / Individual (per band, asymmetric). UI is
  one component, `components/ui/StrokeFillControls.tsx`, pointed at either band
  — the ring pairing, grain switch and seed-on-switch rules are identical and
  two components would have drifted.
- **An unfilled band means opposite things on the two sides, and that is the
  design.** An unfilled **gap** is cut out, so a *mixed* set needs the reveal
  mask `gapFillMaskBands` builds. An unfilled **line** is still ink and falls
  back to the stroke's own resolved paint — no mask, but every ring must be
  drawn even when unfilled, because the ring widths are outer extents and
  skipping one leaves it wearing its outer neighbour's colour.
- **`'individual'` cannot be a mask at all.** A stroke is centred on its path,
  so any band cut at `+x` is cut at `−x`; asymmetry needs a path down one side.
  The Frame border offsets its closed outline (`offsetPolygonOutward`); a
  Strand offsets its open chain (`strand/offsetCurvedStrand.ts` — mitred and
  miter-clamped the same way, since chains hairpin at a star tip; control
  points ride the same normals, exact for the straight edges that dominate).
  `StrandLayer`'s piece builder is therefore a **function of the chain array**
  so it can re-run over offset copies: every split it makes is by edge index
  (ghost host, per-edge Decoration stroke, weave cut), which an offset
  preserves, so a band breaks where the ink it sits inside breaks.
- **A Strand has no outward side.** Which band is "first" comes from the order
  its Rays chained, so the same colours land on opposite sides of neighbouring
  Strands. The control says so in its hint rather than being withheld, and the
  per-band labels read "first"/"last" there against
  "outermost"/"innermost" on the border.
- **Link stroke design** (`state/strokeLink.ts`) keeps the two strokes matching,
  edited from either end — a dispatch-layer fan-out like
  `state/figureBroadcast.ts`, session state, never `PatternConfig`. Copies
  `STROKE_DESIGN_KEYS` only: **not** width (a border runs an order of magnitude
  wider) and **not** the base colour (the Decoration phase owns the Strand's).
  Two traps: a Frame action carries the whole `FrameConfig` and fires per drag
  frame, so the border→Strand direction **diffs the design first** or every
  drag rewrites the Strand style; and the mirrored action must be the
  substrate's own (`SET_FRAME` for a Patch, `SET_GALLERY_FRAME` for a legacy
  substrate) or it writes a Frame nothing reads. The toggle renders at both
  ends, since "vice versa" is only discoverable from the side you are editing.
- Persistence for every field above goes through **`readLineStyleFields`**,
  which both load paths already share (`state/configValidation.ts` and
  `editor/migrations.ts`) — add a stroke field there and both substrates read it.
- Verify: `scripts/verify/strokeBandFills.mjs`, `borderLineFills.mjs`,
  `strokeLink.mjs`, `lineDivisions.mjs`, `gapFillsAndBorder.mjs`.

### Generator (`src/generator/`)

The third top-level workspace beside Gallery and Lab (`AppMode` in
`types/appMode.ts`; ADR-0007). It samples patterns for the user to rate, and
learns from the ratings.

- `randomPattern.ts` — the v1 sampler: seeded RNG → a complete, renderable
  `PatternConfig` over the shipped Gallery tilings. Only the *look* is
  randomised; colour/background are frozen and Frame is absent so a rating
  measures geometry taste. **Determinism contract:** `(seed, GENERATOR_VERSION)`
  always reproduces the same config, so **any** change to `SAMPLER_TUNING` or
  the sampling logic MUST bump `GENERATOR_VERSION` (currently 2).
- `datasetStore.ts` — its **own** IndexedDB database (`geometric-atlas-generator`),
  separate from the thumbnail and bug-report stores: this is durable taste data,
  not a disposable cache. Fails soft on every path. Its version is bumped for
  rating-*shape* changes, independently of the sampler version.
- `features.ts` / `preprocess.ts` / `tasteModel.ts` — in-browser ridge regression
  over ~30 extracted features, retrained from IndexedDB every time the Generator
  opens (no persisted weights — the closed-form solve is instant at this size).
  Scores are centred **per era** so the user's hardening grading doesn't poison
  old rows; the headline CV metric pools **random-sourced rows only**, because
  guided rows are best-of-K by an earlier model and would flatter it.
- `guidedPattern.ts` — best-of-K over the random sampler, scored by the taste
  model with a UCB exploration term. Guided is a source *option* beside Random,
  never a replacement: every candidate is a legitimate sample whose seed
  reproduces it. Exploration lives here, not in the sampler — widening
  `SAMPLER_TUNING` would change the rated universe instead of the model's
  curiosity.

### Export (`src/export/`)

SVG / PNG / JSON output for both substrates.

- `exportSVG.ts` — serialises the live canvas. **CSS custom properties must be
  inlined** (`inlineCssVariables` / `substituteCssVariables`): a cloned
  standalone SVG loses the document cascade, so `stroke="var(--accent)"` would
  export colourless. The substitution scans with a paren-depth counter — a regex
  can't find a `var()`'s own closing paren when the fallback is itself a
  function.
- Anything that must not appear in an export is wrapped in
  `data-export="exclude"` inside `PatternSVG` (editor overlays, Guides layer).
  Exclusion is **structural**, not a per-feature flag.
- `exportActions.ts` — the export menu model (`ExportMenuItem`: action / submenu
  / toggle), incl. PNG resolutions, transparent background and Max-fill.
- `stampAssets.ts` — Void **Stamp** asset I/O: the shape-canvas export is
  EXACTLY the Void's canonical bounding box with no padding, so a design made on
  it cover-fits back pixel-true on re-import.

### Bug capture (`src/bugreport/`)

In-app bug reporting. The top bar's bug button (or **Ctrl/Cmd+Shift+B**) opens
a panel: the user writes a note, everything else is captured automatically at
the moment the panel opens.

- `bugreport/types.ts` — `BugReport` (note + `BugEnvironment` + `BugScreenContext` + verbatim `PatternConfig` + `ConfigSummary` + PNG data URL + `ConsoleEntry[]`). Reports **embed** a config copy rather than living on one, so `PATTERN_CONFIG_KEYS` is not in play.
- `bugreport/context.tsx` — the provider. Screens **contribute** their own facts via `useBugScreenContext({ screen, facts, config })` instead of prop-drilling out of 1000-line workspaces; contributors live in a ref keyed by `useId`, so registering costs no re-renders. The snapshot is taken **on open, not on save**. Screenshots come from the existing `rasterizeSvgToDataUrl` against `PATTERN_CANVAS_SELECTOR` (`svg[data-pattern-canvas]`, set in `PatternSVG`) — the *pattern canvas*, not the whole page, which would need a DOM-rasteriser dependency.
- `bugreport/summary.ts` — pure `summarisePatternConfig`: substrate (`patch` / `legacy` / `empty`), Cells, Tiles, Guides, Frame, Morph, decoration counts, Figure recipes. Fully defensive — a report is filed *because* something is wrong, so it must not throw and lose the note. Reads decoration through `patternDecoration` (never the raw fields).
- `bugreport/consoleLog.ts` — 50-entry ring buffer of console errors/warnings + `window` errors + unhandled rejections; `installConsoleCapture()` runs in `main.tsx` and always forwards to the original methods.
- `bugreport/store.ts` — its **own** IndexedDB database (`geometric-atlas-bugs`), deliberately not the thumbnail store's: adding an object store there means a version bump, which would break `thumbnailStore`'s `open(name, 1)`. Two object stores so the list view doesn't read megabytes of screenshots.
- `bugreport/report.ts` / `actions.ts` — `bugReportMarkdown` (the triage paste format) + JSON bundle / `.md` / `.png` / clipboard.
- `components/BugReportPanel.tsx` — the panel. **z-index 300** (above `.top-bar`'s 150 and the export submenu's 201) and `minHeight: 0` on its scroll area; both were real clipping bugs.
- Screen contributors: `TessellationLabMode` (Phase / Tool / Guide tool / picks / selection / paint target + Reach / overlays), `GeneratorMode` (seed + generator version + source + era + model state), `GalleryBrowser` (count / sort / open entry). Lab helpers are pure in `components/lab/labBugFacts.ts` — including the `'strand'` → **Composition** vocabulary mapping.

### Planned stages (see plan file)

`TESSELLATION_REVAMP_PLAN.md` is the live plan. Phase 0 (decisions / terminology / Option-B restructure), Steps 1–11 (Lab scaffold + tilings + Composition-Phase controls), Step 14 (Lab library), and Step 17 v1 (17.0–17.10 + 17.4 re-enabled) are done + signed off. Steps 4–8 / 12–13 were archived under `archive/tessellation-lab/`. Steps 15, 16, 18 (k-uniform / quasi-periodic / Girih substitution) are parked. Captured ideas for future Builder work: cross-Cell Complete + enclosed-pocket Complete (related multi-vertex-gap mechanic).

## Commit Status Tag

After each commit, mention the short commit hash and message in your chat response (e.g. `a1b2c3d: Fix header layout`). This is for the developer's awareness in the conversation — do NOT render it in the application UI.

## Agent skills

### Issue tracker

Issues live in this repo's GitHub Issues, operated via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: `CONTEXT.md` glossary + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
