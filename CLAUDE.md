# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Vocabulary

`CONTEXT.md` at the repo root is the canonical glossary — read it before writing user-facing text or new types. Quick mapping for vocabulary that already drifted in the code:

- **Gallery** = the default workspace (legacy code: "Main").
- **Lab** = the exploratory workspace; subtitle "Exploratory Workspace".
- **Builder** _(UI label)_ = the tessellation-authoring tool inside the Lab (legacy code: "Tessellation Lab" / "Editor"). The code namespace stays `src/editor/`.
- **Patch / Cell / Boundary / Tile** = the Builder data hierarchy. A **Patch** holds one or more **Cells**; each Cell has a **Boundary** (closed perimeter) and carries the user's **Tiles**.
- **Configuration** = the named tessellation family (`"4.8.8"` etc.); same word in Gallery (drives BFS) and Builder (multi-cell Patch identifier).
- **Phase** = a stage of the Builder workflow; sequence: **Design → Composition → Framing → Decoration** (last two reserved). **Phase-switch** = the verb for moving between them.
- **Ray** = the atomic visible line piece (legacy code: `Segment` / "line"). **Strand** = a chain of Rays across polygons. **Figure** = the per-polygon assembly of Rays; driven by a per-tile-type **Figure recipe** (`FigureConfig`).
- **Contact Ray** = the pre-trim parametric ray from `pic/stellation.ts`; code-internal only.
- **Tiling** = bare polygon coverage (no Strands). **Composition** = Tiling + Strands rendered.
- **Lacing** = reserved; returns under Decoration.
- **Complete** = Design-phase gap-fill with Tiles. "Fill" is reserved for the future Decoration colour-fill (see ADR-0002).

## Commands

```bash
npm run dev      # Start Vite dev server
npm run build    # Type-check + production build
npx tsc --noEmit # Type-check only (no tests framework yet)
```

## Git workflow

After every edit, commit and push:

```bash
git add <changed files>
git commit -m "description"
git push
```

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
2. `pic/stellation.ts` — computes 2 **Contact Rays** per polygon edge at ±(π/2 − θ) from the edge direction
3. `pic/intersect.ts` — parametric ray-ray intersection
4. `pic/trim.ts` — clips each Contact Ray to its nearest valid interior intersection → `Segment[]` (Ray in vocabulary; code rename pending)
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

- `types/editor.ts` — `EditorPatch` (per-Patch shape) + `EditorConfig extends EditorPatch & { version: 2, composition? }` + `EditorTile` (tagged union of regular and irregular). Lives on `PatternConfig.editor` (optional). The Builder route is signalled by `tiling.type === 'editor'`. v2 added `BoundaryComposition` + `BoundaryTile` for multi-cell **Configurations** (4.8.8). **Rename pending (see ADR-0001):** `BoundaryTile` → Cell; every Patch always carries Cells (single-cell Patches included).
- `editor/active.ts` — adapter layer (`activePatch` / `allPatches` / `withActivePatch`) used by the reducer + Canvas to route between the wrapper `EditorConfig` and the per-Patch `EditorPatch`. Multi-cell-aware: routes to `composition.tiles[active].patch` when set.
- `editor/createDefault.ts` — Patch defaults; per-shape `DEFAULT_BOUNDARY_SIZE_BY_SHAPE` + `BOUNDARY_SIZE_MAX_BY_SHAPE`. `createDefault488EditorConfig` + `createDefault488Composition` seed a 4.8.8 Patch (octagon Cell at origin + square Cell at offset, both with Seed Tiles sized to fill the Boundary).
- `editor/buildEditorPolygons.ts` — `editorTilesToPolygons` + `editorBoundaryVertices`. `BOUNDARY_SIDES` / `BOUNDARY_ROTATION` exported (octagon entry exists; never assignable as a top-level single-cell `boundaryShape` — only inside a `BoundaryTile.shape` i.e. multi-cell Configurations).
- `editor/exposedEdges.ts`, `editor/boundary.ts` — Cell-Boundary geometry consumed by Place / Complete UIs. Take `EditorPatch` after the Phase 1 adapter refactor.
- `editor/placement.ts` — `placeRegularNGonOnEdge` + Decision 7 / 14a single-edge viability + `viableSidesForEdge` (single-edge picker filter).
- `editor/symmetry.ts` — `boundarySymmetries(shape, mode)` returns the picked subgroup of the Cell-Boundary's dihedral group (`SymmetryMode` = `'full' | 'rotation' | 'vertical' | 'horizontal' | 'none'`). D8 supported for octagon.
- `editor/orbit.ts` — `orbitEdges` / `placeTilesOnOrbit` / `orbitTileIds` / `placePolygonsOnOrbit` for symmetry-aware placement, delete, and multi-vertex Complete; also exports an orbit-aware `viableSidesForEdge`.
- `editor/complete.ts` + `editor/completeN.ts` — gap polygon resolution + `tryRegularFit` + irregular fallback + multi-vertex `completeNGap` validator. This is the Design-Phase **Complete** operation (ADR-0002).
- `editor/tileTypeId.ts` — Q11 canonical-signature `tileTypeId`: `"<n>"` for regulars, `"<n>i:<8-char hex>"` for irregulars.
- `editor/tileTypes.ts` — `editorTileTypes` for the Composition-Phase panel + Q15 lazy + additive `seedFiguresForEditor`. Reducer routes Builder mutations through `seedFigures` (which walks `allPatches` for multi-cell Patches).
- `editor/lattice.ts` — single-cell `editorLatticeStamps` for the 17.6 Composition-Phase **Lattice** preview (square + hex + triangle via 2-orientation cell). `editorOneRingNeighbourStamps` for the 17.6d Design-Phase "Show neighbours" preview.
- `editor/boundaryInward.ts` — Step 17.12 (in flight; **sub-step A only** so far). Boundary-section geometry for the boundary-inward authoring mode. Exports `BoundarySection`, `computeBoundarySections(patch)`, `placeRegularNGonOnBoundarySection`, plus the size-→-fraction schedule (`sectionFractionForBoundarySize`, 0.30 at boundary 80 → 0.10 at boundary 800). `EditorPatch.boundaryInward?: boolean` gates the new UI. **No reducer or UI wiring yet** — sub-steps B and C pending.
- `editor/compositionLattice.ts` — multi-cell siblings: `compositionToPolygons` (Seed Tiles transformed by `BoundaryTile.center` + rotation), `compositionBoundaryOutlines` (visual Cell-Boundary outlines), `compositionLatticeStamps` (Lattice cell vectors at `composition.edgeLength`), `compositionCellBasis`.
- `editor/nonTilingDetection.ts` — 17.10 Patch-vs-Cell-Boundary area compare for the Composition-Phase warning tag.
- `editor/migrations.ts` — load-time validation; switches on `r.version` (1 = legacy single-cell; 2 = single-cell OR multi-cell with `BoundaryComposition` shape check). Octagon allowed inside `BoundaryTile.shape` only.
- `editor/history.ts` + `editor/useEditorHistory.ts` — undo/redo with `DESIGN_MODE_ACTIONS` allowlist, depth 50, 500 ms coalesce. `SET_EDITOR_BOUNDARY_CONFIGURATION` is in the set; `SET_ACTIVE_BOUNDARY_TILE` is intentionally NOT (pure pane swap).
- `usePattern` accepts `editorStrandMode`, `showBoundaryLattice`, `editorNeighbourPreview`, `editorNeighbourBoundaries`, `editorNeighbourStrands`. Branches once on `composition` for the Builder branch — multi-cell uses `compositionToPolygons` + `compositionLatticeStamps` + `compositionBoundaryOutlines`. Neighbour preview is single-cell only.

Authoritative design context lives in `TESSELLATION_REVAMP_PLAN.md` (Step 17 section) and `SESSION_STATE.md` (resume anchor). 4.8.8 multi-cell Configurations are LIVE on branch `feat/art-deco-egypt-theme-revamp`. Step 17.12 (boundary-inward authoring) is in flight on the same branch — sub-step A only; see SESSION_STATE for the sub-step plan and the locked design decisions.

### Planned stages (see plan file)

`TESSELLATION_REVAMP_PLAN.md` is the live plan. Phase 0 (decisions / terminology / Option-B restructure), Steps 1–11 (Lab scaffold + tilings + Composition-Phase controls), Step 14 (Lab library), and Step 17 v1 (17.0–17.10 + 17.4 re-enabled) are done + signed off. Steps 4–8 / 12–13 were archived under `archive/tessellation-lab/`. Steps 15, 16, 18 (k-uniform / quasi-periodic / Girih substitution) are parked. Captured ideas for future Builder work: cross-Cell Complete + enclosed-pocket Complete (related multi-vertex-gap mechanic).

## Commit Status Tag

After each commit, mention the short commit hash and message in your chat response (e.g. `a1b2c3d: Fix header layout`). This is for the developer's awareness in the conversation — do NOT render it in the application UI.
