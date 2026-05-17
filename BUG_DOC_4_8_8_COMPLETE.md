# 4.8.8 Multi-Cell Complete Mode — Bug Log

Compact tracker for the Builder Complete-mode work on `feat/art-deco-egypt-theme-revamp`. Each entry is just enough to reopen the bug if it regresses. See git log for full diffs.

## Architecture quick-ref

- **Patch** holds `EditorCell[]`. Active Cell is `patch.cells.find(c => c.id === patch.activeCellId)`.
- **Frames:** Cell-local (origin at Cell centre, Cell rotation) ↔ Patch-local via `cellTransform(cell)` (rotate, then translate by `cell.center`). One-ring stamps translate the unit cell to neighbour positions.
- **Reducer entry points** (`src/state/reducer.ts`):
  - `EDITOR_COMPLETE_GAP` → `chordCompleteAcrossPatch` (2 picks, arc walk).
  - `EDITOR_COMPLETE_N_GAP` → `multiPickCompleteAcrossPatch` (≥3 picks).
  - `EDITOR_PLACE_TILE_ON_EDGE` (picker).
- **Pick-target source of truth (canvas):** `allCycles.outer` + `boundaryCorners` + `pocketVertices` + `neighbourVertices` in `Canvas.tsx`. Mirrored reducer-side by `patchSelectableVertices(patch, includeNeighbours)` in `src/editor/patchSelectable.ts`.

## Bug log

| # | Title | Status | Commit | One-line root cause |
|---|---|---|---|---|
| 1 | Cross-Cell / cross-stamp Complete silently no-ops in 4.8.8 | FIXED | `39ff3d4` | `placePolygonsOnOrbit`'s per-Cell selectable returned `[]` for octagon — no standalone lattice. Routed both Complete actions through Patch-frame selectable + active-Cell-local frame. |
| 2 | Sibling-Cell outer-cycle vertices not surfaced | RESOLVED | — | Misread of pre-existing dot styling. `allCycles.outer` already iterates every Cell. |
| 3 | Completions overlapped existing tiles / floated in empty space | FIXED | `55af253` | Added `overlapsExisting` + `sharesEdgeWithExisting` validators. |
| 4 | Neighbour strands didn't appear | RESOLVED | — | User hadn't ticked the "Show strands" sub-toggle under Show Neighbours. |
| 5 | Strands missing in Complete mode | RESOLVED | — | Same as Bug 4 — sub-toggle. |
| 6 | Cross-patch Complete to stamped neighbours not verified | PARTIAL | — | The originally-reported repro was actually Bug 8. Confirmed working post-fix; user did not file a separate scenario. |
| 7 | Picks-with-no-real-Cell-vertex allowed | RESOLVED | `e45bf1c` | Folded into Bug 9 — the "≥1 pick on a real Cell vertex" precondition is exactly this rule. |
| 8 | Symmetric orbit placements rejected as overlapping each other | FIXED | `75d7995` | Overlap check included sibling orbit placements; under non-trivial symmetry, mirror images touch at the axis. Now checks only against pre-existing user tiles. |
| 9 | Adjacency rule too strict (full edge match) | FIXED | `e45bf1c` | `sharesEdgeWithExisting` required a full polygon edge to match a tile edge — rejected non-consecutive-cycle picks. Replaced with early precondition "≥1 pick on a real Cell vertex" via `patchSelectableVertices(patch, false)`. |
| 10 | Tile picker stuck on "no polygon fits here" after multi-cell slider drag | FIXED | `3318713` | Multi-cell slider scales `patch.edgeLength` but not seed Tile edges → every edge non-conforming → picker dead. Relaxed Decision 14a; placement now sizes the new Tile to the source edge's actual length (`edge.length`). Mixed-size Patches accepted. |
| 11 | Preview disagreed with reducer validation | FIXED | `21255c5` | Preview ran only `validateNGapPolygon`; reducer additionally checked selectable / real-Cell-pick / overlap. Unified via `validateMultiPick(patch, picks)` in `patchSelectable.ts`. |
| 12 | No visible reason when preview rejected | FIXED | `335daa4` | Added `OverlapDetail`, `multiPickValidityLabel`, and an SVG pill label rendered at the picks' centroid in `EditorVertexLayer` when the preview is invalid. |
| 13 | Overlap rule 3 false positive on shared-endpoint segments | FIXED | `9377c64` | `segmentsStrictlyCross` used strict orient predicates; for segments sharing an endpoint, tiny float error from `sin/cos` + transforms could flip signs and trigger a false crossing. Added `shareEndpoint` guard that skips rule 3 for any pair sharing endpoints (two segments sharing an endpoint can't strictly cross elsewhere). |

## Key files

- `src/editor/patchSelectable.ts` — `patchSelectableVertices`, `validateMultiPick`, `multiPickValidityLabel`, `retargetTile`, `existingTilesInHostFrame`, transform helpers.
- `src/editor/tileOverlap.ts` — `overlapsExistingDetail` (returns `OverlapDetail` with sub-rule), `sharesEdgeWithExisting`, `shareEndpoint`.
- `src/editor/placement.ts` — `isPlacementViable` (uses `edge.length`, no conforming gate).
- `src/state/reducer.ts` — `chordCompleteAcrossPatch`, `multiPickCompleteAcrossPatch`, `EDITOR_PLACE_TILE_ON_EDGE`. Diagnostic `[multiPick]` logs still on as of `9377c64`; remove once stable.
- `src/components/EditorVertexLayer.tsx` — preview polygon + `previewMessage` pill label.
- `src/components/Canvas.tsx` / `src/components/TessellationLabMode.tsx` — prop plumbing.

## Reopen checklist (if Complete-mode regresses)

1. Reproduce in dev server. Capture the `[multiPick]` console line + `tileVerts` / `candidateVerts` arrays (still on in `multiPickCompleteAcrossPatch`).
2. Note which validity kind / overlap rule fires (visible as red pill on canvas).
3. Match against the table above — if the symptom looks like a previously fixed bug, check the relevant commit hasn't been reverted.
4. If the rejection rule is a genuine false positive: precision in `segmentsStrictlyCross` (Bug 13 territory) and the strict `pointInPolygon` boundary handling are the usual suspects.
