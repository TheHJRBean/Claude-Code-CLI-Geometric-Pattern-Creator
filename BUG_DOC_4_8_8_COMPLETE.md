# 4.8.8 Multi-Cell Complete Mode — Bug Tracker

**Branch:** `feat/art-deco-egypt-theme-revamp`
**Started:** 2026-05-17
**Context:** Cross-Cell + cross-stamp Complete mode in the Builder, focused on the 4.8.8 Configuration (octagon + square Cells). User goal: completions should work uniformly across all configs (single-cell + multi-cell) and only place tiles that meet adjacency + non-overlap rules.

This doc is a session-continuity anchor — every bug seen, status, root cause, fix (with commit), and verification. Read top-down on resume.

---

## Architecture quick-reference

- **Patch** = `EditorPatch` with one or more `EditorCell[]`. Multi-cell example: 4.8.8 (`octagon` Cell at origin + `square` Cell at offset, rotated π/4).
- **Active Cell** = `patch.cells.find(c => c.id === patch.activeCellId)`. UI swap; no geometry change.
- **Coord frames:**
  - *Cell-local*: origin at Cell centre, vertices in the Cell's own rotation.
  - *Patch-local*: every Cell projected via `cellTransform(cell) = (translate cell.center, rotate cell.rotation)`. This is the canvas coord space.
  - *Stamp-translated patch-local*: composition stamps (`compositionOneRingStamps(patch)`) or per-Cell stamps (`editorOneRingNeighbourStamps(cell)`) translate the unit cell to one-ring neighbour positions.
- **Complete-mode entry points (reducer):**
  - `EDITOR_COMPLETE_GAP` (chord mode, 2 picks) → `chordCompleteAcrossPatch`.
  - `EDITOR_COMPLETE_N_GAP` (multi-pick, Ctrl-click + Enter) → `multiPickCompleteAcrossPatch`.
- **Pick-target source of truth:** `Canvas.tsx` aggregates `allCycles.outer` (every Cell's outer cycle), `boundaryCorners` (Cell-Boundary corners, filtered to drop coincident outer-cycle dots), `pocketVertices` (pocket cycle vertices), and `neighbourVertices` (stamps × every Cell × outer cycle). All passed to `EditorVertexLayer`.
- **Pick-target source of truth (reducer):** `patchSelectableVertices(patch, includeNeighbours)` in `src/editor/patchSelectable.ts` mirrors the canvas aggregation for reducer-side validation.

---

## Bug log

### Bug 1 — Cross-Cell + cross-stamp Complete silently no-ops in 4.8.8

**Status:** FIXED · commit `39ff3d4`
**Symptom:** With Show Neighbours on in 4.8.8, multi-pick Ctrl-click + Enter on octagon + square vertices (or any composition-stamped neighbour vertex) produces no tile and no rays. Picks visually register; nothing else happens.

**Root cause:** `placePolygonsOnOrbit` built its `selectable` set from per-Cell `neighbourCycleVertices(cell, outer)`, which calls `editorOneRingNeighbourStamps(cell)`. For `cell.shape === 'octagon'` that returns `[]` (octagon has no standalone lattice — `latticeBasis(octagon)` is `null`). So selectable for the octagon Cell was just the octagon's own ~12 vertices; composition-stamped neighbour positions weren't in the set; orbit propagation skipped every branch; reducer returned state unchanged.

**Fix:** Routed both Complete actions through a new Patch-frame selectable set:
- New `src/editor/patchSelectable.ts`:
  - `patchSelectableVertices(patch, includeNeighbours)` aggregates every Cell's outer + pocket + boundary cycles plus composition (or per-Cell) one-ring neighbour stamps applied to each Cell's outer cycle.
  - `patchNeighbourStamps(patch)` returns `compositionOneRingStamps(patch)` for multi-cell, `editorOneRingNeighbourStamps(patch.cells[0])` for single-cell.
  - `retargetTile(tile, source, stamp, target)` forward-transforms a tile through (cellTransform + optional stamp) into a target Cell's local frame.
  - Shared transform helpers: `applyCellTransform`, `inverseCellTransform`, `inverseRotateTranslate`, `isSelectable`.
- Reducer rewrite:
  - `chordCompleteAcrossPatch(state, pA, pB)`: iterates `(Cell × stamp)` pairs (active first, then siblings, then each one-ring neighbour stamp). Picks undone through stamp + Cell, fed to existing `completeGap`. Tile lives in source Cell when `stamp == null`; retargets to active Cell otherwise.
  - `multiPickCompleteAcrossPatch(state, picks)`: validates picks against `patchSelectableVertices(patch, true)`, transforms to active-Cell-local, runs symmetry orbit + `completeNGap` per orbit image (drops orbit images whose Patch-local mirror isn't in selectable). Tile always in active Cell per the locked design decision.
- Deleted the old `completeAcrossCells` helper and local `inverseCellTransform`.

**Verification:** Build + tsc green. User verified at high level — picks across cells now produce a tile.

---

### Bug 2 — Sibling-Cell tile outer-cycle vertices not surfaced (turned out to be a misread)

**Status:** RESOLVED (no code change)
**Symptom (as reported):** Only the active Cell's tile-outer-cycle vertices are clickable; sibling Cells (and neighbour stamps) only show Cell-Boundary corners.

**Investigation:** Canvas's `allCycles.outer` already iterates every Cell via `for (const cell of config.editor.cells)`. Probed with tsx — for default 4.8.8 the octagon Cell yields 8 outer vertices, square Cell yields 4 outer vertices, both coincide perfectly with their boundary corners (so the boundary-corner filter drops the dashed dots, leaving only solid patch dots). The user revised the report after the fix in Bug 1 landed — "all cell boundaries vertices are surfaced" indicates the dots ARE visible now.

**Outcome:** No code change. Likely the user was conflating dot variants visually pre-fix. The Patch-frame selectable already includes all cells' outer cycles.

---

### Bug 3 — Completions could overlap existing tiles or float in empty space

**Status:** FIXED · commit `55af253`
**Symptom:**
1. Chord-mode picks on far-apart cycle vertices produced a gap polygon that arc-walked around existing tiles, enclosing them — overlapping geometry.
2. Multi-pick picks on neighbour-stamp vertices (with none on real tiles) produced a tile floating off in empty space, not adjacent to any user-placed tile.

**Root cause:** Validation in `completeNGap` and `completeGap` only checked that the new polygon's centroid wasn't inside an existing tile. That allowed (a) polygons whose interior overlapped tiles while centroid was outside, and (b) polygons whose vertices were on cycle/stamp dots but whose body didn't touch any user tile.

**Fix:**
- New `src/editor/tileOverlap.ts`:
  - `overlapsExisting(polygon, existingTiles)` — strict three-part test: polygon vertex strictly inside any tile (excluding shared endpoints), tile vertex strictly inside the polygon (excluding shared endpoints), edge-edge strict crossings. Shared endpoints / shared edges accepted.
  - `sharesEdgeWithExisting(polygon, existingTiles)` — true iff any polygon edge endpoint-matches any existing tile edge.
- Exported `edgesShareEndpoints` from `src/editor/exposedEdges.ts` (was private).
- Reducer:
  - `existingTilesInHostFrame(patch, host)` aggregates every Cell's tile vertices into the host Cell's local frame.
  - `chordCompleteAcrossPatch`: after `completeGap` returns a tile, run overlap check against the full patch. Adjacency satisfied by construction (arc walk uses existing cycle edges).
  - `multiPickCompleteAcrossPatch`: adjacency check against the user's pre-existing tiles only (orbit images don't satisfy adjacency for each other — would let chains drift). Overlap check against pre-existing + sibling orbit placements.

**Verification:** Build + tsc green. User to verify against floating + overlap scenarios.

---

### Bug 4 — "Neighbour strands not showing" — UX confusion, no code change

**Status:** RESOLVED (UX clarification)
**Symptom (as reported):** Show Neighbours on; ghost neighbour stamps render as low-opacity tile fills but no rays appear at the stamped positions.

**Investigation:** Three checkboxes nested:
1. **Show neighbours** (parent) — gates the whole feature; only fires in Design Phase with wrap off.
2. **Show boundaries** (child) — draws the Cell-Boundary outline at each neighbour stamp.
3. **Show strands** (child) — includes ghost polygons in PIC's input set so rays propagate through them.

`usePattern` line 136: `picInput = editorNeighbourPreview && editorNeighbourStrands && ghostPolygons ? [...basePolys, ...ghostPolygons] : basePolys`. Only the child toggle includes ghost polys in PIC; the parent alone just makes the ghost tile fills visible.

**Outcome:** User had only the parent checked. Ticked Show strands → rays appeared. No code change; UX may eventually default both children on when parent is on, or merge into one toggle (open question for later).

---

### Bug 5 — "Show strands" doesn't render in Complete mode — RESOLVED (UX)

**Status:** RESOLVED (no code change)
**Symptom (as reported):** Show Neighbours + Show Strands both on; rays appear at neighbour stamps in Place mode but disappear when switching to Complete mode.

**Outcome:** User re-tested and reported strands work in Complete mode. Likely a momentary state confusion or the Place→Complete switch reset the toggle. No bug found in the wiring.

---

### Bug 8 — Multi-pick overlap rule rejected symmetric orbit placements

**Status:** FIXED · commit `75d7995`
**Symptom (from console log):** Single-cell square with symmetryMode != 'none', user Ctrl-clicks 6 vertices + Enter. Console:
```
[multiPick] orbit 0 completeNGap → tile.kind=irregular, adjacency=true, overlap=false  ✓
[multiPick] orbit 1 completeNGap → tile.kind=irregular, adjacency=true, overlap=true   ✗
```
Orbit 1 (a symmetry image of orbit 0) overlaps orbit 0 → atomic rule kicks in → whole completion returns state unchanged. No tile placed.

**Root cause:** Bug 3's overlap check included sibling orbit placements (`[...userTiles, ...placementVerts]`). Under non-trivial symmetry modes (full / rotation / vertical / horizontal), orbit images often touch or overlap each other at the symmetry axis. The user's intent is "all symmetric placements land atomically" — overlap between siblings should NOT abort.

**Fix:** Overlap check now only compares against the user's pre-existing tiles (`userTiles`), not against in-flight sibling orbit placements. Adjacency rule (at that point) still required shared EDGES — see Bug 9.

---

### Bug 9 — Adjacency rule too strict; rejected all non-edge-coincident multi-picks

**Status:** FIXED · commit pending
**Symptom (user, 2026-05-17):** "Within cell completion works just fine if I am not doing multipick. Multi pick of any kind doesn't work." Chord-mode (2 picks) succeeds; multi-pick (Ctrl-click ≥3 + Enter) silently no-ops in every config.

**Root cause:** Bug 3's `sharesEdgeWithExisting(candidate, userTiles)` rule required at least one full polygon edge to coincide with an existing tile edge. Multi-pick polygons whose vertices are non-consecutive on the outer cycle (e.g., picks 0, 2, 4 on an octagon) have NO edge that matches an existing edge — only shared vertices. Adjacency check rejected them all.

The user's actual intent (from earlier clarification "at least one pick must be on a real Cell vertex"): the polygon must touch the user's existing tiles in some way — a shared vertex is enough, no edge coincidence required.

**Fix:**
- Replaced `sharesEdgeWithExisting` with an early "non-floating" precondition: at least one pick must be in `patchSelectableVertices(patch, /*includeNeighbours=*/false)` — i.e., on a vertex of some Cell's outer / pocket / boundary cycle (no neighbour stamps). Within-cell multi-pick passes trivially (all picks on outer cycle). Cross-stamp multi-pick passes iff at least one pick is on a real Cell vertex. Pure-stamp picks are rejected.
- Removed the now-unused `sharesEdgeWithExisting` import.
- Overlap check (`overlapsExisting` vs `userTiles` only) unchanged from Bug 8 fix.

This also subsumes Bug 7 (pure-stamp picks rejected) without needing a separate Bug 7 fix.

**Verification:** User to re-test:
1. Single-cell square, multi-pick 3 non-consecutive cycle vertices → tile places. (Was rejected by Bug 9.)
2. Single-cell with symmetry, multi-pick → all orbit images place. (Bug 8.)
3. 4.8.8 multi-cell, multi-pick spanning octagon + square real vertices → tile places. (Bug 6.)
4. Pure-stamp multi-pick (all picks on ghost neighbours, none on real Cells) → rejected. (Bug 7.)

---

## OPEN bugs (next session — pick up here)

### Bug 6 — Cross-patch completion to neighbour stamps (re-test pending)

**Status:** PARTIAL — likely covered by the Bug 1 / Bug 8 / Bug 9 chain, but never directly verified in actual 4.8.8 multi-cell.

**Original symptom:** User reported "completion only works within the seed patch and not across patches to neighbours" (2026-05-17). Diagnostic console log revealed the repro was actually single-cell square + symmetry — i.e., Bug 8 + Bug 9. After those landed, the user has not yet re-tested in real 4.8.8 multi-cell.

**Repro to run on resume (single source of truth — DO THIS BEFORE ANY CODE):**
1. Open Lab → Configuration: 4.8.8 (octagon + square). Confirm `patchCells === 2` in any reducer log.
2. Design Phase, Complete mode. Show Neighbours on.
3. Ctrl-click 3 vertices: 2 on octagon outer cycle + 1 on the unique NE square vertex (patch-local ≈ (120.71, 191.42)). Press Enter.
4. Expect: triangle tile placed in active Cell, vertices spanning octagon + square.
5. If it works, close Bug 6 as RESOLVED.
6. If it doesn't, re-add the `[multiPick]` console.log block from commit history (search for `// eslint-disable-next-line no-console` in old `reducer.ts` blame); the block was removed in `75d7995`.

**Three possible cross-patch readings the user hasn't disambiguated, kept here in case re-test fails:**
- (a) Picks entirely on a NEIGHBOUR stamp's outer cycle → tile at the neighbour stamp's position, hosted in active Cell. Conflicts with Bug 9's "at least one pick on real Cell" precondition — would have to be re-scoped if (a) is the intent.
- (b) Picks BRIDGE the active Cell + neighbour stamp (at least one on real, others on stamps). Covered by current code.
- (c) Completion propagates across all lattice copies (tile becomes part of the unit cell). Different mechanic — not implemented.

---

### Bug 7 — Picks-with-no-real-Cell-vertex allowed

**Status:** RESOLVED by Bug 9 (the "at least one pick on real Cell vertex" precondition is exactly this rule).
Kept as a header for chronology; actionable work is folded into Bug 9.

---

### Bug 11 — Multi-pick preview disagreed with reducer validation

**Status:** FIXED · commit pending
**Symptom (user, 2026-05-17 after Bug 10 fix):** "Tile picker is working ok now but multipick is still not functioning." Diagnostic log:
```
[multiPick] start {picks: 3, active: 'octagon', patchCells: 2, symmetryMode: 'rotation'}
[multiPick] orbit 0 REJECT — candidate overlaps user tiles
```
Reducer correctly rejected the picks (per Bug 3 — polygon overlaps an existing seed Tile). But the canvas preview rendered the polygon GREEN before Enter, so the user thought their picks were valid and was surprised when Enter did nothing.

**Root cause:** The canvas preview used `validateNGapPolygon(picks, activeCell)` which only checks `≥3 picks / no duplicates / simple polygon / centroid not inside any tile`. The reducer's full pipeline adds: selectable, real-Cell pick precondition (Bug 9), and `overlapsExisting` strict overlap check (Bug 3). These extra gates were invisible in the preview.

**Fix:**
- New `validateMultiPick(patch, picks)` in `src/editor/patchSelectable.ts` returning a unified `MultiPickValidity` kind. Mirrors every gate the reducer applies.
- `existingTilesInHostFrame` moved from reducer.ts to patchSelectable.ts (now exported, used by both reducer and validator).
- `TessellationLabMode.tsx`: `previewValid` now calls `validateMultiPick(config.editor, picks)`. Polygon turns red the moment picks would be rejected.

After this fix the user's overlap-rejection is visible BEFORE Enter, so they know to pick differently rather than mash Enter and see nothing happen.

**Verification:** User to confirm — overlapping multi-pick scenarios should preview RED; valid scenarios green and Enter places the Tile.

---

### Bug 10 — Tile picker stuck on "no polygon fits here" in multi-cell after slider drag

**Status:** FIXED · commit pending
**Symptom (user, 2026-05-17):** "The tile picker is stuck on 'no polygon fits here' even when there is ample space. It seems to be restricted to 4.8.8." Picker fires on every clicked edge but offers no polygons.

**Root cause:** Multi-cell `SET_CELL_BOUNDARY_SIZE` scales `patch.edgeLength` to keep the lattice invariant, but explicitly leaves seed-Tile `edgeLength` untouched (intentional "single-shape parity" design). After any slider drag, `patch.edgeLength ≠ seed.edgeLength`, so `computeExposedEdges(cell, patch.edgeLength)` marks every seed-Tile edge as `conforming: false` (Decision 14a). `isPlacementViable` returned false on the first line; every PICKER_SIDES probe failed; `viableSidesForEdge` returned `[]`. Single-cell never hit this because its slider doesn't touch `patch.edgeLength`.

**Verified via tsx probe:**
```
patch.edgeLength=150, seed.edgeLength=100 → octagon edge 0 conforming=false, viable sides: []
```

**Fix:** Relaxed Decision 14a. Placement now sizes the new Tile to the SOURCE edge's actual length (`edge.length`) rather than `patch.edgeLength`. The `conforming` field is computed for backwards compat (UI may use it for styling later) but no longer hard-gates `isPlacementViable`. Mixed-size Patches are accepted — multi-cell slider workflow now produces new Tiles flush with the seed Tile's edges regardless of how far the lattice has been scaled.

Changes:
- `src/editor/placement.ts`: `isPlacementViable` drops the `if (!edge.conforming) return false` gate. Overlap probe uses `edge.length` for sizing.
- `src/state/reducer.ts`: `EDITOR_PLACE_TILE_ON_EDGE` uses `edge.length` for both viability and `placeRegularNGonOnEdge` / `placeTilesOnOrbit`.
- `src/editor/orbit.ts`: `viableSidesForEdge` ignores the passed `edgeLength` and uses `edge.length` internally for both single-edge and orbit-aware probes.

**Verification:** tsx probe shows the picker now returns all 9 PICKER_SIDES for an octagon edge under slider-drift (patch.edgeLength=150, seed=100). User to confirm in browser.

---

## Resume checklist

1. Re-read this doc top-to-bottom.
2. **Run the Bug 6 repro first.** If it works, mark Bug 6 RESOLVED and move on. Otherwise, re-instrument and diagnose.
3. After re-test, the only remaining work might be:
   - Tightening Bug 9's rule if it's too permissive (user reports "polygons floating one-vertex-touched but otherwise far from any tile" being accepted).
   - Reading (a) for cross-patch — needs a fresh user clarification because it directly contradicts Bug 9.
4. After each fix: append to the bug log with status FIXED + commit hash + verification.

## File index

- `src/editor/patchSelectable.ts` — Patch-frame selectable + transform helpers (Bug 1 fix).
- `src/editor/tileOverlap.ts` — overlap + adjacency validators (Bug 3 fix).
- `src/editor/exposedEdges.ts` — exports `edgesShareEndpoints`, `tileVertices`, `EDITOR_EPS`.
- `src/editor/boundary.ts` — `computeAllCycles`, `computeOuterBoundary`, `computeBoundaryCycle`.
- `src/editor/compositionLattice.ts` — `compositionOneRingStamps`, `compositionCellBasis`, `compositionToPolygons`.
- `src/editor/lattice.ts` — `editorOneRingNeighbourStamps`, `applyStamp`, `LatticeStamp` type.
- `src/state/reducer.ts` — `chordCompleteAcrossPatch`, `multiPickCompleteAcrossPatch`, `existingTilesInHostFrame`.
- `src/components/Canvas.tsx` — vertex pick aggregation (`allCycles`, `boundaryCorners`, `neighbourVertices`), prop passthrough to `usePattern`.
- `src/components/EditorVertexLayer.tsx` — clickable dot rendering with variants.
- `src/components/TessellationLabMode.tsx` — Show Neighbours / Show Strands UI + `editorNeighbourPreview` formula.
- `src/hooks/usePattern.ts` — multi-cell PIC pipeline; `picInput` decides whether ghost polygons are included.
