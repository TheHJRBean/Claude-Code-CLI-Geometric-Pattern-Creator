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

- `types/editor.ts` — `EditorConfig` + `EditorTile` (tagged union of regular and irregular). Lives on `PatternConfig.editor` (optional). The patch is signalled by `tiling.type === 'editor'`.
- `editor/createDefault.ts` — patch defaults; per-shape `DEFAULT_BOUNDARY_SIZE_BY_SHAPE` + `BOUNDARY_SIZE_MAX_BY_SHAPE`.
- `editor/buildEditorPolygons.ts` — `editorTilesToPolygons` + `editorBoundaryVertices`.
- `editor/exposedEdges.ts`, `editor/boundary.ts` — outer-boundary geometry consumed by Place / Complete UIs.
- `editor/placement.ts` — `placeRegularNGonOnEdge` + Decision 7 / 14a viability.
- `editor/complete.ts` — gap polygon resolution (centroid-outside-patch test) + `tryRegularFit` + irregular fallback.
- `editor/tileTypeId.ts` — Q11 canonical-signature `tileTypeId`: `"<n>"` for regulars, `"<n>i:<8-char hex>"` for irregulars.
- `editor/tileTypes.ts` — `editorTileTypes` for the strand panel + Q15 lazy + additive `seedFiguresForEditor`. Reducer routes editor mutations through `seedFigures`.
- `editor/lattice.ts` — `editorLatticeStamps` for the 17.6 strand-editor lattice preview (square + hex; triangle deferred).
- `usePattern` accepts `editorStrandMode`; when on, it stamps `editorTilesToPolygons` across the viewport on the boundary lattice.

Authoritative design context lives in `TESSELLATION_REVAMP_PLAN.md` (Step 17 section) and `SESSION_STATE.md` (resume anchor). Step 17.4 (orbit-symmetric placement) was implemented and archived under `archive/editor-orbit-17.4/`; if re-enabled, ship bundled with a symmetry-axis subgroup picker (see the corresponding `/idea` memory).

### Planned stages (see plan file)

`TESSELLATION_REVAMP_PLAN.md` is the live plan. Phase 0 (decisions / terminology / Option-B restructure), Steps 1–11 (Lab scaffold + tessellations + strand controls), Step 14 (Lab library), and Step 17.0–17.6 (editor, save for the parked 17.4) are done. Steps 4–8 / 12–13 were archived under `archive/tessellation-lab/`. Steps 15, 16, 18 (k-uniform / quasi-periodic / Girih substitution) are parked.

## Commit Status Tag

After each commit, mention the short commit hash and message in your chat response (e.g. `a1b2c3d: Fix header layout`). This is for the developer's awareness in the conversation — do NOT render it in the application UI.
