# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

This is a React + TypeScript + Vite web app that generates traditional Islamic geometric patterns using **Kaplan's Polygons in Contact (PIC) method**. The app is structured in three independent layers that mirror Taprats (Craig Kaplan's reference implementation):

```
Tiling Layer  →  Figure Layer  →  Render Layer
(polygon grid)   (PIC motifs)     (SVG output)
```

### Data flow

`PatternConfig` (state) → `usePattern` hook → geometry pipeline → SVG components

The geometry pipeline runs entirely in pure TypeScript (no React), memoized in `usePattern`:

1. `tilings/archimedean.ts` — BFS generates `Polygon[]` covering the viewport from a seed polygon, expanding neighbors according to the vertex configuration (e.g. `[4,8,8]` for the 4.8.8 tiling)
2. `pic/stellation.ts` — computes 2 contact rays per polygon edge at ±(π/2 − θ) from the edge direction
3. `pic/intersect.ts` — parametric ray-ray intersection
4. `pic/trim.ts` — clips each ray to its nearest valid interior intersection → `Segment[]`
5. SVG components render segments directly; lacing uses two-pass stroke rendering (thick background gap, then colored strand)

### Key types

- `PatternConfig` (`types/pattern.ts`) — the serialisable state (saved to JSON). Contains `tiling`, `figures` (per n-gon contact angle), and `lacing` config.
- `ViewTransform` (`hooks/usePanZoom.ts`) — pan/zoom state; **not** part of `PatternConfig`, lives in Canvas local state. Encoded entirely in SVG `viewBox`, no CSS transforms.
- `TilingDefinition` (`types/tiling.ts`) — static descriptor for each tiling type, including its vertex configuration array.

### Contact angle convention

The contact angle θ (degrees) controls how "pointy" the star is. `θ=67.5°` on a square tiling produces classic 8-pointed Islamic stars. Rays are computed as:
```
rayDir = rotate(edgeDir, ±(π/2 − θ))
```

### Adding a new tiling

Add a `TilingDefinition` entry to `tilings/index.ts` with the vertex configuration array (e.g. `[3, 4, 6, 4]`). The BFS generator in `archimedean.ts` handles the rest automatically.

### Editor (Step 17 — Tessellation Lab patch editor)

`src/editor/` is a parallel branch of the geometry pipeline that doesn't go through `TilingDefinition`. The user builds a finite **patch** inside a boundary cell and PIC runs over the patch's tiles directly.

Key bits:

- `types/editor.ts` — `EditorPatch` (per-patch shape) + `EditorConfig extends EditorPatch & { version: 2, composition? }` + `EditorTile` (tagged union of regular and irregular). Lives on `PatternConfig.editor` (optional). The patch is signalled by `tiling.type === 'editor'`. v2 adds `BoundaryComposition` + `BoundaryTile` for multi-tile boundary configurations (4.8.8).
- `editor/active.ts` — adapter layer (`activePatch` / `allPatches` / `withActivePatch`) used by the reducer + Canvas to route between the wrapper `EditorConfig` and the per-patch `EditorPatch`. Composition-aware: routes to `composition.tiles[active].patch` when set.
- `editor/createDefault.ts` — patch defaults; per-shape `DEFAULT_BOUNDARY_SIZE_BY_SHAPE` + `BOUNDARY_SIZE_MAX_BY_SHAPE`. `createDefault488EditorConfig` + `createDefault488Composition` seed a 4.8.8 cell (octagon at origin + square at offset, both with origin tiles sized to fill the boundary outline).
- `editor/buildEditorPolygons.ts` — `editorTilesToPolygons` + `editorBoundaryVertices`. `BOUNDARY_SIDES` / `BOUNDARY_ROTATION` exported (octagon entry exists; never assignable as top-level boundaryShape — only inside a `BoundaryTile.shape`).
- `editor/exposedEdges.ts`, `editor/boundary.ts` — outer-boundary geometry consumed by Place / Complete UIs. Take `EditorPatch` after the Phase 1 adapter refactor.
- `editor/placement.ts` — `placeRegularNGonOnEdge` + Decision 7 / 14a single-edge viability + `viableSidesForEdge` (single-edge picker filter).
- `editor/symmetry.ts` — `boundarySymmetries(shape, mode)` returns the picked subgroup of the boundary's dihedral group (`SymmetryMode` = `'full' | 'rotation' | 'vertical' | 'horizontal' | 'none'`). D8 supported for octagon.
- `editor/orbit.ts` — `orbitEdges` / `placeTilesOnOrbit` / `orbitTileIds` / `placePolygonsOnOrbit` for symmetry-aware placement, delete, and multi-vertex Complete; also exports an orbit-aware `viableSidesForEdge`.
- `editor/complete.ts` + `editor/completeN.ts` — gap polygon resolution + `tryRegularFit` + irregular fallback + multi-vertex `completeNGap` validator.
- `editor/tileTypeId.ts` — Q11 canonical-signature `tileTypeId`: `"<n>"` for regulars, `"<n>i:<8-char hex>"` for irregulars.
- `editor/tileTypes.ts` — `editorTileTypes` for the strand panel + Q15 lazy + additive `seedFiguresForEditor`. Reducer routes editor mutations through `seedFigures` (which walks `allPatches` for compositions).
- `editor/lattice.ts` — single-shape `editorLatticeStamps` for the 17.6 strand-editor lattice preview (square + hex + triangle via 2-orientation cell). `editorOneRingNeighbourStamps` for the 17.6d Design-mode "Show neighbours" preview.
- `editor/boundaryInward.ts` — Step 17.12 (in flight; **sub-step A only** so far). Boundary-section geometry for the boundary-inward authoring mode. Exports `BoundarySection`, `computeBoundarySections(patch)`, `placeRegularNGonOnBoundarySection`, plus the size-→-fraction schedule (`sectionFractionForBoundarySize`, 0.30 at boundary 80 → 0.10 at boundary 800). `EditorPatch.boundaryInward?: boolean` gates the new UI. **No reducer or UI wiring yet** — sub-steps B and C pending.
- `editor/compositionLattice.ts` — composition-mode siblings: `compositionToPolygons` (origin tiles transformed by `BoundaryTile.center` + rotation), `compositionBoundaryOutlines` (visual outlines), `compositionLatticeStamps` (cell vectors at `composition.edgeLength`), `compositionCellBasis`.
- `editor/nonTilingDetection.ts` — 17.10 patch-vs-boundary area compare for the strand-mode warning tag.
- `editor/migrations.ts` — load-time validation; switches on `r.version` (1 = legacy single-shape; 2 = single-shape OR composition with `BoundaryComposition` shape check). Octagon allowed inside `BoundaryTile.shape` only.
- `editor/history.ts` + `editor/useEditorHistory.ts` — undo/redo with `DESIGN_MODE_ACTIONS` allowlist, depth 50, 500 ms coalesce. `SET_EDITOR_BOUNDARY_CONFIGURATION` is in the set; `SET_ACTIVE_BOUNDARY_TILE` is intentionally NOT (pure pane swap).
- `usePattern` accepts `editorStrandMode`, `showBoundaryLattice`, `editorNeighbourPreview`, `editorNeighbourBoundaries`, `editorNeighbourStrands`. Branches once on `composition` for the editor branch — composition uses `compositionToPolygons` + `compositionLatticeStamps` + `compositionBoundaryOutlines`. Neighbour preview is single-shape only.

Authoritative design context lives in `TESSELLATION_REVAMP_PLAN.md` (Step 17 section) and `SESSION_STATE.md` (resume anchor). 4.8.8 boundary configurations are LIVE on branch `feat/art-deco-egypt-theme-revamp`. Step 17.12 (boundary-inward authoring) is in flight on the same branch — sub-step A only; see SESSION_STATE for the sub-step plan and the locked design decisions.

### Planned stages (see plan file)

`TESSELLATION_REVAMP_PLAN.md` is the live plan. Phase 0 (decisions / terminology / Option-B restructure), Steps 1–11 (Lab scaffold + tessellations + strand controls), Step 14 (Lab library), and Step 17 v1 (17.0–17.10 + 17.4 re-enabled) are done + signed off. Steps 4–8 / 12–13 were archived under `archive/tessellation-lab/`. Steps 15, 16, 18 (k-uniform / quasi-periodic / Girih substitution) are parked. Captured ideas for future Editor work: cross-boundary Complete fill + enclosed-pocket Complete fill (related multi-vertex-gap mechanic).

## Commit Status Tag

After each commit, mention the short commit hash and message in your chat response (e.g. `a1b2c3d: Fix header layout`). This is for the developer's awareness in the conversation — do NOT render it in the application UI.
