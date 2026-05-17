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

**Status:** FIXED · commit pending
**Symptom (from console log):** Single-cell square with symmetryMode != 'none', user Ctrl-clicks 6 vertices + Enter. Console:
```
[multiPick] orbit 0 completeNGap → tile.kind=irregular, adjacency=true, overlap=false  ✓
[multiPick] orbit 1 completeNGap → tile.kind=irregular, adjacency=true, overlap=true   ✗
```
Orbit 1 (a symmetry image of orbit 0) overlaps orbit 0 → the atomic rule kicks in → whole completion returns state unchanged. No tile placed.

**Root cause:** Bug 3's overlap check included sibling orbit placements (`[...userTiles, ...placementVerts]`). Under non-trivial symmetry modes (full / rotation / vertical / horizontal), orbit images often touch or overlap each other at the symmetry axis. The user's intent is "all symmetric placements land atomically" — overlap between siblings should NOT abort.

**Fix:** Overlap check now only compares against the user's pre-existing tiles (`userTiles`), not against in-flight sibling orbit placements. Adjacency rule unchanged (still vs userTiles only). Chord mode already only checks vs user tiles, so no change there.

**Verification:** User to re-test single-cell symmetric Complete and multi-cell cross-Cell Complete.

---

## OPEN bugs (next session — pick up here)

### Bug 6 — Completion only works within the seed (active) patch; not across patches to neighbours

**Status:** OPEN
**Symptom (latest user message):** With Show Neighbours + Show Strands both on (verified after Bug 4 clarification), the neighbour-stamp rays render in PLACE mode but disappear when the user switches to COMPLETE mode.

**Hypothesis:** `editorMode` (`'place' | 'complete'`) is canvas-only state; `usePattern` should be agnostic to it. But somewhere the prop wiring may force `editorNeighbourPreview` or `editorNeighbourStrands` off when complete mode is engaged. Other possible cause: complete-mode overlays (`EditorVertexLayer` dots) might be painted in a way that obscures the strand layer underneath, even though `editorOverlay` is supposed to be the topmost interactive layer with strand paths beneath.

**To check:**
- Confirm `editorNeighbourPreview` and `editorNeighbourStrands` values in Canvas / usePattern when `editorMode === 'complete'`. Are they being clobbered by a memoised condition?
- Confirm `editorNeighbourPreview` formula in `TessellationLabMode.tsx` line 668: `editorPhase === 'design' && showNeighbours && !(wrap)`. Nothing about editorMode here — should hold regardless.
- Inspect `Canvas.tsx` neighbour-related useMemos for an `editorMode === 'complete'` dependency that disables strand pipeline.
- Repro in browser: toggle place → complete with neighbours+strands on, watch the segment count in the React Profiler or log it in `usePattern`.

---

### Bug 6 — Completion only works within the seed (active) patch; not across patches to neighbours

**Status:** PARTIAL — Bug 8 fix may have resolved the visible symptom; re-test required.
**Symptom:** Picks on neighbour-stamp vertices alone don't produce a tile. Despite the Bug 1 fix adding stamp candidates to `chordCompleteAcrossPatch`'s iteration order and `patchSelectableVertices` including stamped neighbour vertices.

**Note (2026-05-17):** the user's reproduction of "completion across cells fails" came back as single-cell + symmetry (`active: 'main', patchCells: 1`) — actually Bug 8, not a cross-cell issue. After fix #8 they may see this resolved too. Re-confirm before further work.

**Hypothesis 1:** The Bug 3 adjacency check rejects them. `sharesEdgeWithExisting(candidate, userTiles)` requires the candidate to share an edge with the user's REAL tiles (Cells in the patch, no stamps). A candidate built entirely on neighbour-stamp vertices may share edges with the STAMPED tiles (which are virtual ghost copies) but not the real ones. Then adjacency fails → rejected.

This is exactly the rule the user asked for in Bug 7 below ("completions between vertices that do not include the seed patches cells, this should not be possible"). So Bug 6 and Bug 7 are in tension:
- Bug 7 says: reject completions whose picks don't include real-cell vertices.
- Bug 6 says: completions should also work across to neighbour stamps.

**Need clarification:** What does "across patches to neighbours" mean exactly? Possible readings:
- (a) Picks on a NEIGHBOUR stamp's outer cycle should produce a tile at the neighbour stamp's position, hosted in the active Cell (current implementation tries this but adjacency rejects). This conflicts with Bug 7.
- (b) Picks that BRIDGE the active Cell + a neighbour stamp should be allowed (at least one pick on real, at least one on stamp). Both adjacency and bridging satisfied.
- (c) Cross-patch completion is a different mechanic — maybe the new tile should propagate across all lattice copies (i.e., become part of the unit cell, visible at every stamp position).

**To check:**
- Clarify with user which of (a)/(b)/(c) they mean.
- If (b): allow adjacency to include neighbour-stamp tile edges, OR require at least one pick to be on a real-cell vertex (cheaper to enforce).
- If (c): completion should add the tile to a Cell with appropriate coords so PIC sees it inside the unit cell, then composition lattice stamps it normally.

---

### Bug 7 — Completions allowed where picks don't include the seed patch's Cells

**Status:** OPEN
**Symptom:** User reports being able to complete tiles whose vertex picks don't include any vertex from the user's actual patch (octagon + square in 4.8.8) — only ghost-stamp vertices.

**Hypothesis:** Edges of a neighbour-stamped octagon coincide with the central octagon's edges at the seam. A candidate built on neighbour-stamp vertices CAN share an edge with the central octagon (the shared seam edge). That satisfies `sharesEdgeWithExisting(candidate, userTiles)` even though the picks were all on stamp vertices. The user wants stricter: at least one PICK must be on a real-cell vertex.

**Fix sketch:**
- Add a precondition in `multiPickCompleteAcrossPatch`: at least one of `picks` must coincide with a vertex in `patchSelectableVertices(patch, false)` (the no-neighbours set — only real-Cell cycles).
- Mirror in `chordCompleteAcrossPatch` if chord-mode has the same loophole.

**Tension with Bug 6:** If we enforce "at least one pick on real Cell", does Bug 6 want this too? Probably yes — reading (b) is "bridging picks" which by definition has at least one on real. Reading (a) is the conflicting one and probably wrong UX.

---

## Resume checklist

1. Re-read this doc top-to-bottom.
2. Clarify Bug 6 reading (a/b/c) with the user before coding.
3. Most likely fix: add the "at least one pick on real Cell" precondition (Bug 7); revisit Bug 6 after that lands.
4. Bug 5 may resolve itself once the Canvas wiring is inspected — start with logging `editorNeighbourPreview` + `editorNeighbourStrands` values when toggling between place/complete.
5. After each fix: append to the bug log with status FIXED + commit hash + verification.

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
