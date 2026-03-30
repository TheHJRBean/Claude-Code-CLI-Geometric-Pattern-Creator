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

### Planned stages (see plan file)

The implementation follows 10 staged builds. Stages 1–6 (foundation, PIC, Archimedean tilings, strand graph, lacing, export) are complete or in progress. Stages 7–10 add: Rosette figures + Infer algorithm, Girih tiles (Lu & Steinhardt 2007), quasi-periodic/Penrose tilings, and per-edge angle control.

## Commit Status Tag

After each commit, mention the short commit hash and message in your chat response (e.g. `a1b2c3d: Fix header layout`). This is for the developer's awareness in the conversation — do NOT render it in the application UI.
