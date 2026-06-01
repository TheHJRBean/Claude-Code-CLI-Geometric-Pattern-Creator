# SESSION_STATE.md

> **Vocabulary note (2026-05-16):** the canonical glossary is `CONTEXT.md`. This file predates the vocabulary alignment and uses legacy terms (`Tessellation Lab` → **Builder**, `main mode` → **Gallery**, `BoundaryTile` → **Cell**, `strand editor` / `Strand mode` → **Composition** Phase, `Design mode` → **Design** Phase, `origin tile` → **Seed Tile**, `line` → **Ray**). When updating this file, prefer the new terms. See `CONTEXT.md` and `docs/adr/0001`–`0003` for the locked decisions.

## ▶ RESUME HERE

**Current branch:** `feat/art-deco-egypt-theme-revamp`.

**2026-06-01 — Gallery Frame Tier B (lattice-unit sizing) + SCOPE LOCK.** The Gallery **Frame** Size slider now reads in **whole tiling repeat units** instead of raw px. One unit = `|t1|`, the tiling's nearest same-orientation translate at the current scale. `archimedean.ts` now exports `tilingRepeatLength(def, edgeLen)` (thin wrapper over the still-private `getTilingLattice`). `Sidebar.tsx` derives `frameRepeat` from `TILINGS[config.tiling.type]` + `config.tiling.scale`, drives the slider min/max/value in units, and `setFrameUnits` converts back to px. `size` is still **stored in px** — no schema or `readGalleryFrame` change; the slider just snaps to integer multiples of the live repeat. Label reads "N units · Mpx". Aspect + rotation sliders unchanged. Build + `tsc --noEmit` green.

**🔒 SCOPE LOCK (user, 2026-06-01):** Gallery framing is **shape + size ONLY — no tile-completion features.** The clip-only design already meets this (BFS fills the frame; strands hard-clip at the edge). Do NOT port the Builder's completion machinery (`computeFrameSections` / `placeRegularNGonOnFrameSection` / `frameCornerStubTiles` in `editor/frame.ts`) into the Gallery path. Edge resolution stays a future Decoration-stage job. With Tier B done, Gallery framing is considered **feature-complete** per this scope.

**Still pending:** browser-verify Tier A + Tier B (`npm run dev` → Gallery → Frame section: pick a shape, drag Size and confirm it snaps in repeat units across square/hex/octagon tilings; confirm aspect/rotation still work).

---

**2026-05-31 — Gallery Frame (Tier A, SHIPPED `aedfecc`).** Clip-only parametric Shape Frame in **Gallery** mode (distinct from the Builder's Framing Phase). The infinite tiling is clipped to a square/hex/octagon outline + visible accent stroke, driven by a new Gallery-only sidebar **Frame** section (shape / size / aspect / rotation). Reuses the existing `editor/frame.ts::frameOutlinePolygon` geometry + PatternSVG's clip+stroke path verbatim — **no completion machinery** (the BFS field already fills the frame, so the janky complete-to-frame problem doesn't arise here).

Files: `types/pattern.ts` (`PatternConfig.frame?: FrameConfig`, shape-only) · `state/actions.ts` + `state/reducer.ts` (`SET_GALLERY_FRAME` → top-level `config.frame`, distinct from the Builder's `SET_FRAME`→`editor.frame`) · `components/Canvas.tsx` (`frameOutline` memo reads `config.frame` when `tiling.type !== 'editor'`; gated off the Lab so it can't leak across workspaces) · `components/Sidebar.tsx` (Gallery `mode === 'main'` Frame section) · `state/configValidation.ts` (`readGalleryFrame` clamps size to `[MIN,MAX]`, defaults aspect/rotation, **drops non-`shape` frames silently** — a missing Gallery frame is harmless).

Build + `tsc --noEmit` green. **Known v1 caveat:** Strands hard-clip at the frame edge (clean cut, no edge resolution) — that's a Decoration-stage follow-up, intentionally out of scope. Placement defaults to world origin (0,0); reposition by panning the pattern under the frame. **Not browser-verified yet** (verify via `npm run dev` → Gallery → Frame section).

**⏭ NEXT — Tier B fast-follow (RAW, ~1–2h):** lattice-unit sizing so the frame is measured in **whole repeat units** (the affordable "patch-based like the Builder" feel). `archimedean.ts` already computes translation vectors internally via `getTilingLattice` (line ~239, private, used for pan-stability seed-snapping) — export it, then convert the Size slider to lattice-cell multiples (size = N × |t1|). Note: Gallery has **no fundamental-domain outline polygon**, only the two vectors — a true Builder-style n-ring patch frame (Tier C) would need to derive + union a domain per tiling and is a much larger, separate piece. Verdict from this session: Tier B is the right stopping point; Tier C not worth it.

---

**2026-05-30 — Framing Phase (Builder Phase 3: Design → Composition → **Framing** → Decoration).** Design rationale + full status live in `memory/project_framing_stage_idea.md` (**canonical**); glossary in `CONTEXT.md` (**Frame** / **Frame node**); ADR-0003 (phase sequence), ADR-0004 (Framing structural-only). Frame config on `PatternConfig.editor` (Builder-only). This block is the per-slice **commit log** only — see the memo for the why.

**Slices shipped (WIP-committed on this branch):**
1. Phase scaffold (`10a0ce8`) — `editorPhase` gains `'framing'`; renders the stamped Composition.
2. Frame data model (`c554c08`) — `FrameConfig` on `EditorConfig`; `SET_FRAME` + history + `migrateFrame`.
3. Outline + clip + UI (`637e384`) — `frame.ts::frameOutlinePolygon` (square/hex/oct); PatternSVG clips to it.
4. Frame nodes (`41a24b2`) — `computeFrameSections` (exact edgeLength spacing + `isStub` remainder).
5. Completion-to-frame (`4b30d64`+`ab68691`) — `placeRegularNGonOnFrameSection`; `EDITOR_PLACE_TILE_ON_FRAME_SECTION` → frame-scoped `completedTiles`.
6. PIC over frame tiles (`4cc859c`) — `usePattern` appends `completedTiles` to the PIC input.
7. Field bounding (`7a8fc3d`) — keep stamped tiles whose centre is inside the frame (Q12).
8a. Auto-fill (`91f9ba3`) — `EDITOR_COMPLETE_TO_FRAME` + Complete/Clear buttons.
8b. Aspect/rotation/origin (`1f985a5`) + node-symmetry fix (`d4ea3a2`, centred half-stubs).
9. Irregular stub fallback (`a75620f`) — `frame.ts::frameCornerStubTiles`, one corner-notch tile per Frame corner.
10. n-ring clip-only type (`3c1c31b`) — `editor/frameNRing.ts` (`nRingCellStamps` / `unionOutline` / `nRingOutline`); single-cell square/hex/triangle; Frame-type select + Rings slider. **Browser-verify pending.**
11. Default-state UX (`ce5ba92`) — Framing is non-destructive; empty state offers both Frame types directly.

**⏸ ON HOLD — complete-to-frame redesign.** User: "very janky — just overlays a single layer of tiles all around the edge." Full diagnosis + the options floated are in the memo ("Complete-to-frame — ON HOLD"). Root: the completion ring is **frame-edge-aligned** but the field is **lattice-aligned** → offset + overlap; clean tile-aligned completion needs the frame to match the lattice (the n-ring already is that). **User is writing a detailed spec — do NOT touch complete-to-frame or its dependents (wrap-to-whole-patch A/B, symmetry-orbit on completion) until it lands.**

**Resume:** continue from the latest `wip:` on this branch. `editorPhase` is local UI state (not persisted); frame *settings* persist on `EditorConfig`. Not blocked: `frameOrigin` click-picker (X/Y sliders already exist), Frame node/section terminology pass. Known minor: the stub fallback skips a thin corner sliver on aspect≠1 frames (degenerate notch; revisit if visible).

---

**2026-05-22 (session 6) — PIC `figureRouting` toggle.** User asked the honest meta-question: are these problems solvable or a product of the mathematics? Answer: partly mathematical (generic PIC has no canonical answer for degenerate pair-A meetings on irregular tilings; historical Islamic patterns on dual Laves tilings essentially don't exist and use bespoke rosette construction in Taprats, not generic PIC). Given the user can't have one "right" answer, surfaced the trade-off as a user-facing control.

- `PatternConfig.figureRouting?: 'auto' | 'edge' | 'centroid'` (default `auto`). New `SET_FIGURE_ROUTING` action + reducer case. Persisted through `configValidation.readPatternConfig`.
- `runPIC` reads `config.figureRouting` and threads it to `emitStarArms`. `useCentroidV = routing !== 'edge' && isConvex` — `edge` falls through to the original Kaplan edge-slide (with same-edge guard); `auto` and `centroid` keep the current centroid V behaviour.
- New segmented control in the Sidebar (under Curves, above Strand Thickness): three buttons — Auto / Edge / Centroid — with tooltips explaining the trade-off.
- New regression test: `figureRouting=edge bypasses centroid V on floret θ=40°` (asserts no segment endpoint at `poly.center` and longest segment ≥ 0.4 × diameter). 167 tests pass.

**Resume protocol:** load floret / kisrhombille / deltoid / heptagonal in browser and try each routing mode. Auto is the same as before this commit. Edge mode restores the slide artifact but keeps every ray. Centroid is the same as auto for now (kept as explicit symmetric override).

---

**2026-05-22 (session 4 + 5) — PIC: centroid V extended to all convex polygons; arm-length caps removed.**

Session 4 (commit `224fdfb`) introduced centroid-routed V on uneven convex polygons only, but user verification with 11 bug screenshots showed "many rays missing and floating shapes" — even-borderline polygons (heptagonal-rosette ratio 0.696) were still dropping their slide pairs via the arm-length cap from `2632e69`, and the per-ray fallback cap from `e451af0` was killing long Kaplan-trim arms on floret θ=30°.

Session 5 fix (this commit):
- **Centroid V now fires on ALL convex polygons** (was: uneven-only). Both `emitStarArms` branches gate on `isConvexPolygon(polyVertices)` rather than `isUneven`. Concave polygons keep the original edge-slide with same-edge guard (`ddcad24`).
- **Arm-length cap removed** from `emitStarArms` (no longer needed since convex always uses centroid V; concave path runs original Kaplan slide which is bounded by the polygon boundary).
- **Per-ray fallback cap removed** from `runPIC` — long Kaplan-trim arms (floret θ=30° 72-unit fallbacks) are restored.
- **Cairo behaviour changes** — the small slide at V0/V4 θ=27.5° is now a centroid V. Cairo regression test still passes (≥8 origin keys, strand pieces > 5 length).
- Probe: heptagonal-rosette θ=30° 6→9 segs; floret θ=30° 8→10; deltoid θ=30°/60° 6→7, 9→10. All 166 tests pass.
- **Visual verification pending** — refresh browser and sweep θ on floret-pentagonal, kisrhombille, deltoidal-trihexagonal, heptagonal-rosette, cairo, tetrakis. Confirm: (a) rays no longer missing; (b) the centroid V is acceptable on Cairo (this is a visible Cairo change vs. the original slide).

If the centroid V is too visible on Cairo specifically, the next iteration is to add a CAIRO-SPECIFIC exception (keep edge-slide on Cairo, centroid V elsewhere) or route through a softer interior point (apothem foot on the bisector of forwardRay/backRay edges) instead of the raw centroid.

---

**2026-05-22 (session 4) — PIC Direction 3 centroid-routed V (FIRST ATTEMPT, superseded by session 5).** User reported after visual verification of session-3 commits: "many of the rays disappear in the middle angles. However it is looking a bit cleaner at least, there is less overlapping." The session-3 trade-off (sparse figures on uneven polygons at middle θ) was too aggressive. Implemented Direction 3 (centroid-routed strands) from the investigation memo's Follow-up section.

- `emitStarArms` (`src/pic/index.ts`): both edge-slide branches (asymmetric + both-positive-outside) on uneven polygons emitted a V routed through `polygonCenter` instead of dropping the pair. Convex-only guard (`isConvexPolygon(polyVertices)`); concave uneven polygons kept the original drop.
- Was insufficient — even-borderline polygons (heptagonal-rosette ratio 0.696) and the per-ray fallback cap continued to drop rays. Replaced in session 5.

---

**2026-05-22 — PIC irregular-polygon edge-slide bugs, session 3 (`e451af0` → `7b08c38`).** Continued the work tracked in `~/.claude/projects/-home-harryjrh-Geometric-Pattern-Creator/memory/project_pic_irregular_polygon_bugs.md` and `INVESTIGATION-PIC-IRREGULAR-POLYGON-BUGS.md`. Four commits today (after the previous session's `ddcad24` Bug-2 same-edge guard + `2632e69` Bug-1 halfSpan cap):
- `e451af0` — edge-ratio gate: polygons with shortest/longest edge ratio < 0.65 ("uneven") get a stricter `0.75 × halfSpan` cap on the asymmetric + both-positive-outside edge-slide branches. Per-ray fallback's nearest-crossing search also capped at halfSpan / 0.75 × halfSpan (same gate). Catches Floret θ=40°, Deltoid θ=30°/50°, Floret θ=30° fallback long-arms.
- `271168f` — drop edge-slide entirely on uneven polygons (both branches, regardless of arm length). Catches the slide-along-boundary visual artifact at Kisrhombille θ=72° (was 18.0-unit boundary slide; now V0 inside pair-A only). Cairo / Tetrakis preserved because they're even (ratio 0.73 / 0.71).
- `7b08c38` — updates `INVESTIGATION-PIC-IRREGULAR-POLYGON-BUGS.md` with before/after table.
- Regression tests added in `src/pic/pipeline.test.ts`: floret θ=40°, kisrhombille θ=72°, floret θ=30° (per-ray fallback). All 164 tests pass.

**Trade-off the user needs to verify visually:** uneven polygons (kisrhombille, deltoid) now produce sparse strand patterns at many θ — kisrhombille θ=30°-72° shows just 2 short arms (V0 inside pair-A only) instead of the previous 4-6 segs with visible boundary slides. The visual artifact ("running along the edge") is gone but figure richness is reduced. If sparseness reads too empty in browser, the documented next step is **centroid-routed strands** (forwardRay.origin → polygonCenter → backRay.origin V-shape, replacing the dropped edge-slide) — see Direction 3 in `INVESTIGATION-PIC-IRREGULAR-POLYGON-BUGS.md`.

**Status as of session end:** user said "make notes so I can close the session" — has NOT visually verified today's commits yet. Probe data in `src/pic/probe.test.ts`; run with `npx vitest run src/pic/probe.test.ts --reporter=verbose` for fresh per-θ segment lengths. Dev server on http://localhost:5173/ when picking back up. Affected tilings to spot-check: `kisrhombille`, `floret-pentagonal`, `deltoidal-trihexagonal`, `heptagonal-rosette`, `nonagonal-rosette`, `decagonal-rosette`, `cairo-pentagonal`, `tetrakis-square`.

---

**2026-05-18 — Step 17.13 vertex placement shipped (`24b0959` → `5cfdeb8`).** New Design-Phase + Place-mode authoring mode: anchor a regular n-gon at a Cell corner or inward-only Boundary corner, pick orientation from a discrete set of snap rotations. Sibling to edge placement (17.3) and boundary-section placement (17.12). Always-on, single-cell only in v1 (multi-cell composition deferred — mirrors 17.12c locked decision b).

Sub-steps landed:
- **17.13a (`24b0959`)** — `src/editor/vertexPlacement.ts`: `ExposedVertex` + `VertexKey` + `computeExposedVertices(cell)` (groups coincident corners, subtracts incident-tile wedges, boundary corners start from the inward wedge `(n-2)π/n` CCW for inward-only enforcement). `placeRegularNGonOnVertex(sides, edgeLength, vertex, rotation, id)` with vertex 0 at the anchor and edge 0→1 leaving at `rotation`. `vertexPlacementOrientations` emits flush-CW / centred / flush-CCW per open sector (collapsed to one when fits ≈ 0). `isVertexPlacementViable` body-overlap + inward-only guard. `viableSidesForVertex` + `hostTileForClick` (closest-tile-to-click disambiguation for the orientation reference — locked decision).
- **17.13b (`3949d7f`)** — `EDITOR_PLACE_TILE_ON_VERTEX { vertexKey, sides, rotation }` action; reducer single-cell-only, single or orbit dispatch. `placeTilesOnVertexOrbit` in `editor/orbit.ts` with `transformVertexRotation(s, rotation, sides)`: pure rotations shift by α, reflections use `2β - rotation + 2π/n + π` (derived from CCW-reversal — new tile's edge 0→1 corresponds to reflected old edge 0→(n-1)). All-or-nothing on viability; centroid dedup for fixed-axis orbit images. Added to `DESIGN_MODE_ACTIONS`.
- **17.13c (`36987ca` + `5cfdeb8` fix-up)** — `EditorVertexPlacementLayer.tsx` (diamond dots, dashed when boundary corner, renders LAST in editor overlay so vertex clicks win over edges/sections). `EditorPickerOverlay.tsx` extended with `mode: 'vertex' | 'edge'`. Vertex mode is two-page: page 1 = shape grid; page 2 = ‹ / › orientation arrows + label ("Flush ⟲ / Centred / Flush ⟳") + `1 / total` counter + Place / Back. Arrow keys + Enter shortcut. Translucent dashed polygon preview of the candidate tile renders on canvas via `placeRegularNGonOnVertex`. `onPlaceTileOnVertex` plumbed Canvas → TessellationLabMode → reducer. Selecting a vertex clears edge / section picker so only one overlay is open.
- **17.13d** — sign-off probes captured (see below). User verified in-browser ("looks good now"). The `5cfdeb8` fix-up bumped the orientation counter from hint-text concatenation to its own monospace line so the 1 / 2 / 3 cycling is obvious at a glance.

**Locked decisions (this conversation, 2026-05-18):**
| # | Question | Resolution |
|---|----------|-----------|
| a | UI mode | Always-on in Design Phase + Place mode (no toggle — mirrors 17.12c). |
| b | Direction picker | ‹ / › arrows cycle through *snap* orientations (flush-CW, centred, flush-CCW per open sector). No continuous rotation. |
| c | Host tile for orientation reference | Closest tile to click point. `hostTileForClick(vertex, cell, clickPoint)` resolves it. |
| d | Boundary corners | Selectable, inward-only (`isVertexPlacementViable` rejects candidates whose centre lies outside the Boundary polygon). |
| e | Symmetry | Orbit-propagate via `placeTilesOnVertexOrbit` — all-or-nothing, identical semantics to edge orbit. |

**Sign-off probes for 17.13** (run after C; user-verified for the canonical scenarios):
1. Square Seed in square boundary, click vertex of Seed → picker shows shape grid (page 1) with viable shapes lit.
2. Pick triangle → page 2 shows `Flush ⟲ · 1 / 3`, arrows enabled. Cycle: Centred · 2 / 3 → Flush ⟳ · 3 / 3 → wraps. Live preview tracks rotation on canvas.
3. Click Place → triangle lands at the vertex flush against the chosen Seed edge.
4. Undo → triangle removed, picker state cleared.
5. Click boundary corner with `noSeed: true` → vertex picker opens; only inward-extending orientations survive viability.
6. `symmetryMode = 'full'` square Cell + vertex click → orbit propagates: 8 tiles land at corner-equivalent positions of the Seed under D₄.
7. Save / load Patch with vertex-placed tiles → round-trips (no schema change; tiles serialise via existing `EditorTile` shape).
8. Vertex click while an edge picker is open → edge picker closes, vertex picker opens. Reverse direction also works (edge click while vertex picker open).
9. **Fix-up `5cfdeb8`** — orientation counter visibility: confirmed users can see all 3 orientations at a glance after the counter moved to its own line.

**Deferred / not in v1**:
- Multi-cell composition support (locked decision b inherited from 17.12 — currently the reducer refuses if `cells.length > 1`).
- Continuous-angle rotation (snap-only is locked).
- "Snap to viable" UX variants beyond the three snap kinds.

---

**2026-05-18 (earlier) — Step 17.12 rebuilt after design grill.** The 17.12c boundary-inward UI shipped earlier today was reworked end-to-end based on a follow-up grill:
- **Boundary-inward placement is now always-on** in Design Phase + Place mode (single-cell). The `EditorCell.boundaryInward` flag and `SET_EDITOR_BOUNDARY_INWARD` action were removed — the section picker is a standard part of design functionality, not a separate mode.
- **New `EditorCell.noSeed: boolean` + `SET_CELL_NO_SEED` action.** When on, the active Cell starts empty (no auto-placed Seed Tile). Refused if the Cell holds any non-Seed Tile (mirrors the existing Seed-sides slider lock). Toggling on wipes the Seed; toggling off re-creates it at the current `seedSides` + Patch `edgeLength`. Helpers tolerate empty Cells: `applyWrap` skips when `cell.tiles.length === 0`; `SET_CELL_SEED_SIDES` keeps `tiles: []` when noSeed is on. Migrator allows `tiles: []` only when `noSeed: true`.
- **`patch.edgeLength` reset is now first-only** (locked decision f honored). Proxy: `cell.tiles.length === (cell.noSeed ? 0 : 1)`. Avoids the silent Composition-lattice jump on every subsequent boundary placement.
- **Tile-priority on click overlap.** Section layer renders BEFORE the edge layer in the same `<g>`, so SVG hit-testing gives the edge layer z-priority on coincident pixels. Sections render transparent at rest (no visual clutter at the boundary), accent on hover/select only. No disambiguation modal in v1 — the soft cases (Seed fills Boundary → section viability rejects everything anyway; placed boundary tile shares an edge → both pickers either reject or place outside) are mostly handled by viability rules. Add the modal if UX reports demand it.
- **`originLocked` semantic corrected** in `EditorDesignControls`: was `cell.tiles.length > 1`; now `cell.tiles.some(t => t.source !== 'seed')` so the Seed-sides slider and No-Seed checkbox both lock properly when the Cell holds any placed/completed Tile (including the noSeed-on case with one placed Tile).
- **Disambiguation popup is deferred** — flagged in the grill as a fallback only if users report friction.

Build green (tsc + vite). **Manual smoke test still pending** — needs in-browser verification of (1) toggling No Seed wipes the Cell to empty, (2) clicking a section in an empty Cell places a tile, (3) Place-mode click on a coincident Tile edge opens the edge picker (tile-priority), (4) the edgeLength reset fires exactly once per Cell.



**2026-05-17 — Builder Complete-mode bug sweep in flight.** Detailed tracker at `BUG_DOC_4_8_8_COMPLETE.md` (root). Read that FIRST before any Complete-mode work; it has the full chronology, fixes (commits `39ff3d4`, `55af253`, `75d7995`, and one pending), open Bug 6 with a concrete re-test repro, and the file index. The summary below is preserved for the prior Phase 2/4/5/6 schema work.

**Last action:** 2026-05-16 — Phase 2 (introduce `EditorCell` + schema v3)
**BUILD GREEN — all 210 tsc errors resolved.** Every helper, the reducer,
and every UI component now operates on the v3 `EditorPatch.cells[]` shape
described in ADR-0001. `migrateEditorConfig` reads v1 / v2 / v3 and always
returns v3, so persisted Lab patches round-trip transparently.

**What changed since the WIP commit:**
- Helpers retargeted to `EditorCell` and given the Patch-shared `edgeLength`
  where they need it: `placement.ts`, `orbit.ts`, `complete.ts`,
  `completeN.ts`, `boundaryInward.ts`, `lattice.ts`, `autoComplete.ts`
  (`autoCompletePatch` → `autoCompleteCell`, `fitBoundarySize` takes
  `edgeLengthFloor`).
- `compositionLattice.ts` collapsed to a Patch walker
  (`compositionToPolygons` / `compositionBoundaryOutlines` /
  `compositionLatticeStamps` / `compositionOneRingStamps` iterate
  `patch.cells`).
- `nonTilingDetection.ts` is now per-Cell (`detectCellTilingStatus`); the
  Lab UI aggregates across `patch.cells` and surfaces the first non-tiling
  Cell as the Patch-level warning.
- `tileTypes.ts` walks `patch.cells` itself (single-Cell and multi-Cell
  Patches share one path).
- `createDefault.ts`: `createDefaultEditorConfig` produces v3 single-Cell
  shape; `createDefault488EditorConfig` produces v3 multi-Cell shape
  directly (no more separate `createDefault488Composition`).
- `migrations.ts` rewritten: v1 / v2 single-shape → one `EditorCell` with
  id `'main'`; v2 composition → each `BoundaryTile` becomes one
  `EditorCell`, lifting `configurationId` / `edgeLength` / `activeTileId`
  onto the Patch. Legacy `origin` / `originSides` field aliases preserved.
- `state/reducer.ts` rewritten: `updatePatch(...)` → `updateActiveCell(...)`
  routing through `withActiveCell`. All per-Cell field reads / writes
  (`shape`, `boundarySize`, `seedSides`, `alternateBoundary`,
  `symmetryMode`, `wrapBoundary`, `boundaryInward`) go through the active
  Cell. Patch-level fields (`edgeLength`, `configuration`, `autoComplete`)
  update the Patch directly. `SET_EDITOR_BOUNDARY_SIZE` multi-cell scales
  every Cell's centre + `boundarySize` + `patch.edgeLength` in lockstep
  (preserves the v2 4.8.8 invariant — Cell edge = lattice edge).
- `state/labDefaults.ts` `loadLabState` pipes any persisted `config.editor`
  through `migrateEditorConfig`; missing / invalid editor patches drop
  silently and the tiling type resets to `''`.
- `hooks/usePattern.ts` branches on `patch.cells.length > 1` instead of on
  `composition`; iterates `patch.cells` for multi-Cell.
- `components/Canvas.tsx` aggregates exposed edges / cycles / boundary
  corners / neighbour vertices from every Cell, transforming each via the
  Cell's `center` + `rotation` into Patch-local coords for rendering.
  Selected-edge viability uses the host Cell + `patch.edgeLength`.
- `components/TessellationLabMode.tsx` UI controls read from
  `activeCell(editor)` for Cell-level fields and `editor.configuration` /
  `editor.cells.length > 1` for multi-Cell branching.

**Commits to land:** the working tree has the full Phase 2 conversion
staged for one commit (`feat(editor): Phase 2 v3 schema migration — build
green`).

**Phase 4 action renames — DONE.** Build green; landed in the commit
after this Phase 2 commit:
- `SET_EDITOR_BOUNDARY_CONFIGURATION` → `SET_BUILDER_CONFIGURATION`
- `SET_ACTIVE_BOUNDARY_TILE` → `SET_ACTIVE_CELL`
- `SET_EDITOR_BOUNDARY_SHAPE` → `SET_CELL_SHAPE`
- `SET_EDITOR_BOUNDARY_SIZE` → `SET_CELL_BOUNDARY_SIZE`
- `SET_EDITOR_ORIGIN_SIDES` → `SET_CELL_SEED_SIDES`
- `DESIGN_MODE_ACTIONS` allowlist updated.
- `SelectedEdge.hostBoundaryTileId` (and `ExposedEdge.hostBoundaryTileId`)
  renamed to `hostCellId` across Canvas / EditorEdgeLayer /
  TessellationLabMode / exposedEdges.

`SET_ACTIVE_CELL` still uses payload key `tileId` (legacy) — deferred
along with the rest of the comment sweep so the rename + sweep stay
mechanical.

**Phase 5 comment sweep + payload rename — DONE.** Landed in the
commit after Phase 4. Build green.

- Code-comment vocabulary swept across Canvas.tsx, TessellationLabMode.tsx,
  PatternSVG.tsx, customTessellations.ts, mainConfigs.ts, editor/history.ts,
  editor/useEditorHistory.ts: "strand mode" → "Composition Phase",
  "design mode" → "Design Phase", "main mode" → "Gallery", "boundary
  tile" → "Cell", "strand-editor mode" → "Composition Phase".
- `migrations.ts` / `types/editor.ts` `BoundaryTile` mentions left as-is
  — those refer to the actual v2 legacy type names the migrator reads.
- `SET_ACTIVE_CELL` payload key renamed `tileId` → `cellId`
  (actions.ts + reducer.ts + 2 call sites in TessellationLabMode.tsx).

**Phase 6 — Lacing removal — DONE.** Landed in the commit after Phase 5.
Build green; bundle gzip dropped ~1.5kb.

- `PatternConfig.lacing` → `PatternConfig.strand: StrandStyle`
  (`{ width, color, background }`). `background` carries what
  `lacing.gapColor` had been doing as the canvas background.
- Action `SET_LACING` → `SET_STRAND_STYLE`.
- `StrandLayer.tsx` lost the over/under crossing detection, gap
  splitting, and two-pass render — now a single `<path>` per Strand.
- Sidebar Lacing collapsible section deleted; the Strand Thickness
  slider stays and dispatches the new action.
- Legacy `lacing` shape migrates to `strand` on load: file imports
  (`configValidation.ts:readStrandStyle`) + lab-state-v1 localStorage
  (`labDefaults.ts:loadLabState`).
- `feedback_lacing.md` memory deleted; `project_lacing_removal.md`
  captures the new state.

**Outstanding items** (deferred — not blocking):
- Identifier-level naming still uses some legacy terms (`editorStrandMode`
  prop, `editorPhase: 'design' | 'strand'` state). Strict SESSION_STATE
  scope was comments only; identifier renames can land later.

---

### ⚠ Phase 2 resume plan (FULLY COMPLETED — kept for reference)

**Branch state on resume:** the WIP commit (next session: look at the
most recent commit on this branch tagged `wip:`) introduces the v3 type
design in `types/editor.ts` and updates four helpers. The remaining ~20
files still reference v2 fields and fail to compile.

**What's already done** (committed as WIP — DO NOT push to main):
- `types/editor.ts` rewritten to v3 shape:
  - New `EditorCell` (id, shape, center, rotation, boundarySize,
    seedSides, tiles, alternateBoundary?, symmetryMode?,
    boundaryInward?, wrapBoundary?).
  - New `EditorPatch` (cells: EditorCell[], activeCellId, edgeLength,
    configuration?, autoComplete?).
  - `EditorConfig = EditorPatch & { version: 3 }`.
  - Legacy `BoundaryComposition`, `BoundaryTile`, `V2InnerPatch` kept
    as `@deprecated` types — read by migrator only.
  - `CellShape` is the canonical name; `BoundaryShape` is an alias for
    migration.
- `editor/active.ts` rewritten to v3 adapter:
  - `activeCell(patch)`, `allCells(patch)`, `withActiveCell(patch, cell)`,
    `withCellById(patch, id, cell)`. Replaces `activePatch` / `allPatches`
    / `withActivePatch`.
- `editor/buildEditorPolygons.ts` retargeted: `editorBoundaryVertices`
  and `editorTilesToPolygons` now take `EditorCell`.
- `editor/boundary.ts` retargeted: `computeAllCycles`,
  `computeOuterBoundary`, `computeBoundaryCycle` take `EditorCell`.
- `editor/exposedEdges.ts` retargeted: `computeExposedEdges(cell,
  edgeLength?)` takes `EditorCell` plus the optional Patch edgeLength
  for the conforming check.

**What's NOT done** (resume here, in this order):
1. `editor/placement.ts` — `isPlacementViable`, `placeRegularNGonOnEdge`,
   `viableSidesForEdge` take Cell input.
2. `editor/symmetry.ts` — already takes CellShape via `boundarySymmetries`;
   verify call sites pass cell.shape.
3. `editor/orbit.ts` — `orbitEdges`, `placeTilesOnOrbit`, `orbitTileIds`,
   `placePolygonsOnOrbit`, orbit-aware `viableSidesForEdge` take Cell.
4. `editor/complete.ts` + `editor/completeN.ts` — gap-fill operations
   take Cell; may also need Patch for cross-Cell context.
5. `editor/autoComplete.ts` — `autoCompletePatch` becomes
   `autoCompleteCell`; `fitBoundarySize` takes Cell.
6. `editor/boundaryInward.ts` — `computeBoundarySections(cell)`,
   `placeRegularNGonOnBoundarySection`.
7. `editor/lattice.ts` — `editorLatticeStamps` takes Cell;
   `editorOneRingNeighbourStamps` takes Cell.
8. `editor/compositionLattice.ts` — collapses substantially: under v3
   the multi-cell layout is just `patch.cells`. Functions become Patch
   walkers: `compositionToPolygons(patch)` iterates cells and stamps.
9. `editor/nonTilingDetection.ts` — Patch-vs-Cell-Boundary area compare.
10. `editor/tileTypes.ts` — `editorTileTypes(patch)` walks `patch.cells`;
    `seedFiguresForEditor` likewise.
11. `editor/createDefault.ts`:
    - `createDefaultEditorConfig` produces v3 single-cell shape.
    - `createDefault488Composition` / `createDefault488EditorConfig`
      collapse into one `createDefault488EditorConfig` producing v3
      multi-cell shape with `cells: [...]` directly.
12. `editor/sampleConfig.ts` — produce v3 shape.
13. `editor/migrations.ts` — rewrite to migrate v1 / v2 → v3:
    - v1 / v2 single-shape: wrap fields into one Cell (id: `'main'`);
      patch holds `cells: [cell]`, `activeCellId: 'main'`, `edgeLength`,
      `autoComplete`.
    - v2 composition: each `BoundaryTile` → `EditorCell`; collapse
      `BoundaryComposition.{configurationId, activeTileId, edgeLength}`
      onto `EditorPatch.{configuration, activeCellId, edgeLength}`.
    - Map legacy `BoundaryShape` octagon allowance: octagon now allowed
      on any Cell in a multi-cell Patch; single-cell Patches keep the
      triangle/square/hexagon restriction at the picker (not the type).
14. `state/reducer.ts` — every `updatePatch(state, p => ...)` becomes
    `updateCell(state, c => ...)` operating on `activeCell(patch)`.
    Action handlers that mutate Cell-level fields (boundaryShape →
    cell.shape, boundarySize → cell.boundarySize, seedSides → cell.seedSides,
    symmetryMode → cell.symmetryMode, alternateBoundary →
    cell.alternateBoundary, wrapBoundary → cell.wrapBoundary,
    boundaryInward → cell.boundaryInward) route via `withActiveCell`.
    Patch-level fields (edgeLength, configuration, autoComplete) update
    the Patch directly.
15. `state/labDefaults.ts` — initial state uses v3 shape.
16. `hooks/usePattern.ts` — branches once on `patch.cells.length > 1`
    rather than on `composition`; iterates `patch.cells` for multi-cell.
17. `rendering/PatternSVG.tsx` — boundary outline list comes from
    `patch.cells` rather than `composition.tiles`.
18. `components/Canvas.tsx` — `editor.cells.find(...)` lookups; remove
    `editor.composition` branches.
19. `components/EditorEdgeLayer.tsx`, `EditorPickerOverlay.tsx`,
    `EditorVertexLayer.tsx` — same shape navigation.
20. `components/TessellationLabMode.tsx` — heavy: navigate `patch.cells`,
    use `activeCell(patch)` for Cell-level field reads, route writes
    through reducer actions (most stay the same except for action
    renames in Phase 4).

**Strategy for the resume:** work bottom-up — fix helpers first
(steps 1–13), then reducer (step 14), then UI (steps 15–20). Each batch
should drop tsc errors monotonically. Commit when tsc passes; do not
push to remote until the build is green.

**Phase-4 / Phase-5 action items** (queued behind Phase 2):
- Rename reducer actions: `SET_EDITOR_BOUNDARY_CONFIGURATION` →
  `SET_BUILDER_CONFIGURATION`; `SET_ACTIVE_BOUNDARY_TILE` →
  `SET_ACTIVE_CELL`; `SET_EDITOR_BOUNDARY_SHAPE` → `SET_CELL_SHAPE`;
  `SET_EDITOR_BOUNDARY_SIZE` → `SET_CELL_BOUNDARY_SIZE`;
  `SET_EDITOR_ORIGIN_SIDES` → `SET_CELL_SEED_SIDES`. Update
  `DESIGN_MODE_ACTIONS` allowlist.
- Comment sweep: replace "strand mode" → "Composition Phase",
  "design mode" → "Design Phase", "main mode" → "Gallery", "boundary
  tile" → "Cell" in code comments.
- Lacing removal (per `feedback_lacing.md`) — currently broken; slated
  for reintroduction under Decoration Phase. Independent of the above.

---

### Vocabulary alignment session — what shipped

Shipped:
- `CONTEXT.md` — canonical glossary (Lab / Builder / Gallery, Patch /
  Cell / Boundary / Tile, Phase / Phase-switch, Ray / Strand / Figure,
  Tiling / Composition / Configuration, Seed Tile / Tile source).
- `docs/adr/0001` — Patch always has Cells (recursive shape, requires
  v2 → v3 schema migration).
- `docs/adr/0002` — Complete (not Fill) — Fill reserved for Decoration
  colour-fill.
- `docs/adr/0003` — Phase sequence Design → Composition → Framing →
  Decoration (last two reserved).
- `CLAUDE.md` — rewritten against the new vocabulary.
- `TESSELLATION_REVAMP_PLAN.md` + `RESEARCH-TILING-CONFIGURATIONS.md`
  + this file — vocabulary-mapping headers added (full-prose sweep deferred).
- UI labels — `TessellationLabMode.tsx`, `Sidebar.tsx`,
  `FigureControls.tsx`: Builder header, Gallery toggle, Ray length,
  Seed sides, Composition phase button, plus tooltips on Phase,
  Boundary, Editing Cell, Boundary size, Lattice edge, Complete,
  Strands, Lacing, Contact angle.

Commits: `a099e10` (docs + ADRs + CONTEXT.md), `f24cde2` (UI labels).

**Queued for next session — code-internal alignment** (deferred from this
session because it changes runtime behaviour / type shape and deserves
its own focused pass):
1. **Schema migration v2 → v3** per ADR-0001 — every `EditorPatch`
   carries `cells: EditorCell[]`; legacy `tiles[]` wraps into one Cell.
2. **Type renames**: `BoundaryTile` → `EditorCell` (or `Cell`),
   `BoundaryComposition` collapses into `EditorPatch.cells`,
   `EditorTileOrigin` value `'origin'` → `'seed'`, field
   `EditorTile.origin` → `EditorTile.source`, `originSides` →
   `seedSides`.
3. **Reducer action renames**: `SET_EDITOR_BOUNDARY_CONFIGURATION` →
   `SET_BUILDER_CONFIGURATION`, `SET_ACTIVE_BOUNDARY_TILE` →
   `SET_ACTIVE_CELL`, etc.
4. **Sweep code-internal comments** that still say "strand mode",
   "design mode", "main mode" (CLAUDE.md is the only doc that's been
   fully rewritten — large planning docs carry mapping headers only).
5. **Lacing removal** (per `feedback_lacing.md`) — currently broken;
   slated for reintroduction under Decoration Phase. Could happen
   independently.

**Prior in-flight work** (still pending — does not block the above):
Step **17.12 boundary-inward authoring mode** — sub-step A (foundation)
shipped in `8c935a2`. B (reducer + first-tile placement) and C (UI /
section highlights + mode toggle) are queued. The boundary-inward UI
copy should land in the new vocabulary from the start.

### What's in 17.12a (`8c935a2`)
- New `src/editor/boundaryInward.ts`:
  - `BoundarySection` interface (`edgeIndex`, `sectionIndex`, `p1`,
    `p2`, `midpoint`, `sectionLength`).
  - `SECTION_FRACTION_AT_MIN_SIZE = 0.30` /
    `SECTION_FRACTION_AT_MAX_SIZE = 0.10`, linearly interpolated over
    boundary size [80, 800] and clamped outside.
  - `sectionFractionForBoundarySize` + `sectionCountForBoundarySize`
    (count = `round(1 / fraction)` so each boundary edge divides
    evenly).
  - `computeBoundarySections(patch)` walks `editorBoundaryVertices`
    (honours `alternateBoundary`) and emits sections CCW.
  - `placeRegularNGonOnBoundarySection(sides, section, id)` builds a
    regular n-gon flush against the section on the interior side,
    with edge length = section length. CCW convention matches
    `placeRegularNGonOnEdge` (vertex 0 = `section.p2`, vertex 1 =
    `section.p1`).
- `EditorPatch.boundaryInward?: boolean` field added; migration in
  `src/editor/migrations.ts` accepts it so saved patches round-trip.
- **No reducer or UI yet** — strictly geometry + data model. App
  behaviour is unchanged on `main`-equivalent paths.

### Locked design decisions (this conversation, 2026-05-11)
| # | Question                       | Resolution |
|---|--------------------------------|-----------|
| a | Origin tile interaction        | **Keep both.** Origin tile and its exposed edges stay clickable. Boundary-section highlights are *additional* targets, not a replacement. |
| b | Composition scope              | **Single-shape only in v1** (triangle / square / hexagon). Composition (4.8.8) follows in a later arc. |
| c | Section schedule               | Linear: fraction 0.30 at boundarySize ≤ 80 → 0.10 at boundarySize ≥ 800, clamped. Section count = `round(1 / fraction)`. |
| d | First-tile shape               | Reuse `PICKER_SIDES = [3,4,5,6,7,8,9,10,12]`. Regular n-gons only. |
| e | Symmetry orbit                 | Route via `placeTilesOnOrbit` so `symmetryMode` behaves consistently with edge placement. `'none'` ⇒ single-section. |
| f | `patch.edgeLength` conflict    | **First boundary-section placement resets `patch.edgeLength`** to the section length. The pre-existing origin tile's exposed edges then become non-conforming (Decision 14a) and inert in the picker. |

### Sub-step plan (pick up here)
- **17.12b — Reducer.** New action `EDITOR_PLACE_TILE_ON_BOUNDARY_SECTION`
  payload `{ sectionIndex: number; edgeIndex: number; sides: number }`.
  Implementation outline:
  - Resolve the `BoundarySection` from the payload via
    `computeBoundarySections(activePatch)` and the `(edgeIndex,
    sectionIndex)` pair.
  - Build a tile via `placeRegularNGonOnBoundarySection`.
  - If `editor.symmetryMode && editor.symmetryMode !== 'none'`, route
    through `placeTilesOnOrbit` — needs a small extension since
    `placeTilesOnOrbit` currently takes an edge, not a section.
    Cleanest path: write a `placeTilesOnBoundarySectionOrbit` sibling
    that transforms the section under each symmetry element, builds
    the tile, and gates by overlap.
  - **Reset `patch.edgeLength = section.sectionLength`** before
    appending the tile so subsequent Place flow inherits the new
    edge length (decision f).
  - Re-seed figures via `seedFigures` + run `applyWrap` envelope (the
    standard tile-mutating envelope from the existing
    `EDITOR_PLACE_TILE_ON_EDGE` path).
  - Add action to `DESIGN_MODE_ACTIONS` for undo/redo coverage.
- **17.12c — UI.**
  - New `src/components/editor/EditorBoundaryInwardLayer.tsx`
    rendering the section highlights as clickable overlays inside
    `PatternSVG`'s `editorOverlay` slot. Mirror `EditorEdgeLayer`'s
    pointer-event pattern (invisible thick hit-area, stop pan).
  - Show this layer when `patch.boundaryInward && editorMode === 'place'`.
    Standard exposed-edge layer stays visible in parallel (decision a).
  - Checkbox **"Boundary-inward placement"** in
    `EditorDesignControls` — gates the new layer + persists with the
    patch. Disabled when composition is active (decision b).
  - Click a section → open the existing `EditorPickerOverlay` at the
    section midpoint → user picks an n-gon → dispatch
    `EDITOR_PLACE_TILE_ON_BOUNDARY_SECTION`. After commit, the picker
    closes.
  - When `patch.edgeLength` has been reset by a boundary placement
    (decision f), the origin tile's exposed-edge picker should
    render those edges dashed/inert — the existing `conforming` flag
    on `ExposedEdge` already handles this; no new code needed if
    `editor.edgeLength` is the comparison source of truth.

### Sign-off probes for 17.12 (run after C)
1. Square boundary at default size (400) + "Boundary-inward
   placement" off → no section highlights, behaviour identical to
   pre-17.12 (regression check).
2. Toggle Boundary-inward on with no tiles placed yet → boundary
   edges show ~10 section highlights (square edge 400 / section
   ~50). Hovering highlights one, click opens picker at midpoint.
3. Pick a 4-gon → square tile lands flush against the section on
   the interior side. Origin tile (the default centred square)
   remains. `patch.edgeLength` is now the section length.
4. Origin tile's exposed edges should now appear dashed/inert
   because their length no longer matches `patch.edgeLength`.
   Boundary tile's free edges expose normally.
5. Triangle boundary at min size (80) → ~3 sections per edge
   (fraction ≈ 0.30); hex boundary at large size (800) → ~10
   sections per edge (fraction ≈ 0.10). Visual count should
   match.
6. `symmetryMode = 'full'` + Boundary-inward + click one section →
   tile propagates to all orbit-equivalent sections. `'none'` +
   click one section → only that section fills.
7. Save / load patch with `boundaryInward: true` set →
   round-trips through `loadPatternConfig` and re-renders with the
   flag intact.
8. Undo after a boundary-section placement → tile removed,
   `patch.edgeLength` restored to its prior value (verifying the
   snapshot captures the edge-length reset).
9. Composition (4.8.8) → checkbox is disabled and section
   highlights don't render (decision b).

### Captured this session
- `/idea` — vertex placement with direction picker
  (`project_editor_vertex_placement_idea.md`). Sibling to 17.12.
  Tiles can be placed on a single vertex; picker gains a second
  page where the user picks the new tile's rotation around the
  shared vertex.

### Roadmap sync (2026-05-11)
- `project_editor_custom_boundary_idea.md` — promoted
  `LIVE 2026-05-10` → `DELIVERED 2026-05-10`.
- `project_editor_per_edge_placement_idea.md` — corrected RAW →
  `DELIVERED 2026-05-06` (already shipped at 17.4 re-enable via
  `symmetryMode='none'` default).
- `MEMORY.md` index reorganised into `## Delivered` and `## Ideas /
  Future` sections; duplicate framing/decoration entries removed.

---

**Earlier 2026-05-11 — Rosette figure type removed (`f7f812d`).**
Single-arc cleanup PR per the `/idea` memo. Star is now the only
strand figure type; the rosette-patch tessellations (pentagonal /
heptagonal / nonagonal / decagonal / hendecagonal / hexadecagonal)
and Taprats rosette presets are untouched per user scope decision.

- `FigureConfig.type` narrowed to `'star'`; `rosetteQ` / `rosetteS`
  fields dropped.
- `SegmentKind` no longer includes `'petal'`; the petal-emission
  block in `pic/index.ts` and the petal guards in
  `strand/computeCurves.ts` + `rendering/ControlPointLayer.tsx`
  are gone.
- `SET_ROSETTE_Q` and `SET_FIGURE_TYPE` actions deleted (no more
  button bar between star/rosette in Lab or Main).
- `FigureControls.tsx` lost `figType` / `rosetteQ` props and the
  Petal shape (q) slider. `Sidebar.tsx` + `TessellationLabMode.tsx`
  no longer plumb them.
- `loadPatternConfig` coerces legacy `type: 'rosette'` to `'star'`
  and strips `rosetteQ` / `rosetteS` so existing saved configs
  (file or localStorage) still load and render as plain stars.
- Memory: `project_remove_rosette_idea.md` deleted on delivery;
  `project_rosette_deprecated.md` also deleted (superseded — the
  feature is gone, no need to track "don't invest"). MEMORY.md
  index updated.

`npx tsc --noEmit` green, `npm run build` green, all 135 tests pass.

**Earlier 2026-05-10 — Editor v2 4.8.8 composition feature
parity with single-shape patches. Three tools added in one pass:

1. **Alternate orientation per active tile** — `SET_EDITOR_ALTERNATE_BOUNDARY`
   now routes through `updatePatch`, flipping just the active boundary
   tile's inner-patch boundary. The cell vectors + `BoundaryTile.center`
   / `rotation` are untouched so the unit cell still tiles by translation.
   Checkbox in `EditorDesignControls` no longer hidden under composition.
2. **Show neighbours preview in composition** — new
   `compositionOneRingStamps(composition)` in `compositionLattice.ts`
   returns 8 cell-level translation stamps. `usePattern` and the Canvas
   neighbour-vertex layer both branch on composition: ghost polygons +
   ghost boundary outlines + ghost outer-cycle vertex picks all stamp
   the merged unit cell (octagon + square together, per stamp).
3. **Cross-tile edit/delete in composition** — `ExposedEdge` and
   `SelectedEdge` gained an optional `hostBoundaryTileId`. Canvas
   aggregates exposed edges from every boundary tile (each tagged with
   host id) and renders each edge under its own `BoundaryTile`
   transform. `EditorEdgeLayer` disambiguates by all three keys.
   `TessellationLabMode.handleSelectEdge` auto-dispatches
   `SET_ACTIVE_BOUNDARY_TILE` when the user clicks an edge in a
   non-active host so the existing `EDITOR_PLACE_TILE_ON_EDGE` and
   `EDITOR_DELETE_TILE` reducer cases (which route through
   `activePatch`) target the right inner patch.

Round-trip verification: `migrateBoundaryComposition` /
`migrateBoundaryTile` / `migratePatchFields(allowOctagon=true)` already
cover composition save/load via `loadPatternConfig`; `structuredClone`
preserves the composition object intact through localStorage.

Earlier same day — Editor v2 boundary configurations
**4.8.8 (octagon + square)** went LIVE. Cell-edge slider behaves with
single-shape parity (scales cell + boundary outline + tile centres
but not the origin polygons). Tile placement (picker) was live in
composition. Wrap-boundary toggle worked per-active-tile.
Complete-mode vertices exposed across every boundary tile, and
completion routed to whichever tile actually hosted the picks.

Phase log:
- `93dcdd4` Phase 1 — `EditorPatch` + `src/editor/active.ts`
  adapter; ~12 helper signatures migrated. No behaviour change.
- `b3c98ee` Phase 2 — octagon polygon (`BoundaryShape += 'octagon'`,
  `BOUNDARY_SIDES[octagon]=8`, `BOUNDARY_ROTATION[octagon]=3π/8`,
  D8 symmetry). Octagon never assignable to a top-level
  `boundaryShape` (migration's allow-list keeps it inside
  `BoundaryTile.shape` only).
- `13a6a63` Phase 3 — `BoundaryComposition` + `BoundaryTile` +
  `EditorConfig.version: 2`. `createDefault488EditorConfig()` +
  `migrateEditorConfig` accepts both v1 (legacy) and v2 with
  optional composition.
- `1d30054` Phases 4 + 7 — two new actions:
  `SET_EDITOR_BOUNDARY_CONFIGURATION` (snapshots history) and
  `SET_ACTIVE_BOUNDARY_TILE` (pure pane swap, excluded). Existing
  per-patch reducer cases route via new `updatePatch` →
  `activePatch` / `withActivePatch`.
- `1a0a247` Phase 5 — `src/editor/compositionLattice.ts`:
  `compositionToPolygons`, `compositionBoundaryOutlines`,
  `compositionLatticeStamps` (4.8.8 cell vectors `(L(1+√2), 0)`
  and `(0, L(1+√2))`). `usePattern` branches once on `composition`.
- `d703dec` Phase 6 — picker now shows 4 entries (Triangle /
  Square / Hexagon / 4.8.8). Active-tile sub-picker
  ("Editing: [Octagon] [Square]") under composition. Single-shape
  controls (Alternate orientation, Boundary size, Wrap boundary)
  hide when composition is active. Strand panel aggregates tile
  types via `allPatches`. Canvas transforms picker overlay to
  cell-local while keeping validation in patch-local.

Bug-fix passes after Phase 6:
- `21d6609` activePatch / allPatches / withActivePatch were trivial
  passthroughs — composition mutations stripped the composition.
  Branch on `editor.composition`. Strand panel cards now aggregate
  both inner patches' tile types correctly.
- `e4ed2c1` Cell-edge slider was scaling everything proportionally
  (origin tiles too) — wrong parity. Slider now only updates
  `composition.edgeLength` + each `patch.boundarySize`.
- `f8ef4ac` Slider needed to also scale `BoundaryTile.center` so
  positions track the new cell vectors (otherwise octagon and
  square boundaries drifted apart and overlapped as the cell grew).
- `7814b46` (REVERTED in 6e44e69) — briefly emitted boundary
  outlines as polygons; broke single-shape parity (polygon scaled
  with slider).
- `6e44e69` Reverted to single-shape parity:
  `compositionToPolygons` returns the inner patch tiles (origin
  polygons, fixed size), boundary outlines stay visual via
  `compositionBoundaryOutlines`. Slider min clamped to 100 (the
  seeded edge) so dragging down can't pinch BoundaryTile centres
  past what fixed-size origin polygons can fit (the previous
  overlap symptom).
- `2cae2ad` SESSION_STATE log of the bug-fix arc + v1 design
  contract.
- `d67e3a7` Re-enabled the tile placement picker in composition
  mode (was hidden under v1 stance). Edges already computed in
  patch-local + parallel-transformed to cell-local for rendering;
  dispatch keys (tileId, edgeIndex) stable so EDITOR_PLACE_TILE_ON_EDGE
  routes through updatePatch correctly. At the seeded cell edge,
  origin = boundary so placements would land outside the cell —
  becomes useful once the user scales past 100.
- `34374b9` Wrap-boundary toggle for composition. Per-active-tile:
  fits `composition.edgeLength` to the active patch via
  `fitBoundarySize` and propagates to every BoundaryTile (boundary
  outline + scaled centres) so the 4.8.8 invariant — octagon edge =
  square edge = cell edge — holds. SET_EDITOR_BOUNDARY_SIZE clears
  wrap on every patch (manual override). SET_ACTIVE_BOUNDARY_TILE
  re-runs applyWrap after the pane swap so wrap follows the new
  active tile.
- `1fe08ee` Complete-mode vertex layer aggregates outer cycles +
  pocket cycles + boundary corners across every BoundaryTile
  (transformed via each tile's own centre + rotation). New reducer
  helpers `inverseBoundaryTransform` + `completeOnComposition` route
  EDITOR_COMPLETE_GAP / EDITOR_COMPLETE_N_GAP to whichever tile
  actually hosts the picks (active first, falling back to siblings).

**v1 design contract (4.8.8):**
- `composition.edgeLength` drives cell vectors and is the slider
  target. Seeded at 100 (matches `DEFAULT_EDGE_LENGTH`).
- Each `BoundaryTile.patch` has an origin tile sized to the seeded
  edge with `rotation = BOUNDARY_ROTATION[shape]` so origin = boundary
  outline at default.
- PIC processes the origin polygons; boundary outlines are visual
  only via `compositionBoundaryOutlines`. At the seeded edge the
  strand pattern reads as 4.8.8; scaling up grows the boundary frame
  around fixed origins (lattice tiles via the boundary outlines when
  `showBoundaryLattice` is on).
- Picker (`EditorEdgeLayer`) and Complete vertex layer
  (`EditorVertexLayer`) are both live. Picker edges come from
  `activePatch(editor)`; Complete vertex sets aggregate across every
  boundary tile in composition.
- Reducer routing through `activePatch` / `allPatches` /
  `withActivePatch` (`src/editor/active.ts`) is the single seam
  between wrapper-aware code (reducer, persistence, history,
  Canvas overlay coords) and per-patch consumers (every geometry
  helper). `withActivePatch` preserves composition; the wrapper
  mirrors the active patch's per-patch fields so legacy single-shape
  reads stay coherent.

**Architectural map (4.8.8 v1):**
- `src/types/editor.ts` — `EditorPatch` (per-patch shape) + `EditorConfig
  extends EditorPatch & { version, composition? }` + `BoundaryComposition`
  + `BoundaryTile`. `BoundaryShape = 'triangle'|'square'|'hexagon'|
  'octagon'`. Octagon never assignable as a top-level boundaryShape —
  migration's allow-list keeps it inside `BoundaryTile.shape`.
- `src/editor/active.ts` — `activePatch` / `allPatches` /
  `withActivePatch`. Composition-aware.
- `src/editor/createDefault.ts` — `createDefault488EditorConfig` +
  `createDefault488Composition`. Origin tiles seeded with
  `rotation = BOUNDARY_ROTATION[shape]` so origin = boundary at
  default.
- `src/editor/compositionLattice.ts` — `compositionToPolygons` (origin
  tiles, transformed), `compositionBoundaryOutlines` (visual outlines),
  `compositionLatticeStamps` (cell vectors at `composition.edgeLength`),
  `compositionCellBasis`. Triangle's intra-stamp pattern in
  `lattice.ts` is intentionally NOT reused (different semantics).
- `src/editor/migrations.ts` — `migrateEditorConfig` switches on
  `r.version` (1 = legacy single-shape; 2 = single-shape OR
  composition). v1 patches load with composition absent.
- `src/state/reducer.ts` — wrapper-aware. New actions
  `SET_EDITOR_BOUNDARY_CONFIGURATION` (history) +
  `SET_ACTIVE_BOUNDARY_TILE` (excluded — pure pane swap that re-runs
  applyWrap). Helpers `updatePatch`, `completeOnComposition`,
  `inverseBoundaryTransform`. `applyWrap` handles per-active-patch
  wrap fit in composition + propagates to every BoundaryTile.
- `src/hooks/usePattern.ts` — branches once on `composition`.
- `src/components/TessellationLabMode.tsx` — Boundary picker has
  4 entries (Triangle / Square / Hexagon / 4.8.8). Composition
  shows the "Editing: [Octagon] [Square]" segmented tab + a Cell
  edge slider (min 100, max 400) wired to SET_EDITOR_BOUNDARY_SIZE.
  Wrap toggle is shared with single-shape, scoped to active patch
  in composition. Strand panel aggregates tile types via
  `allPatches`.
- `src/components/Canvas.tsx` — picker overlay computes exposed
  edges in patch-local (active patch via `activePatch`), parallel-
  transformed to cell-local for rendering. Complete-mode cycles +
  boundary corners aggregate across every BoundaryTile in
  composition.

**Sign-off probes for the 4.8.8 boundary configuration:**

Single-shape regression:
1. New patch → triangle / square / hexagon → place + delete +
   Complete → undo / redo. Behaviour identical to pre-refactor.
2. Save to library + reload from library — single-shape patches
   survive.

4.8.8 composition:
3. New patch → Boundary picker shows **4.8.8** as a 4th entry.
4. Click 4.8.8 → octagon + square outlines render at their cell
   positions; "Editing: [Octagon] [Square]" appears under the
   picker; alternate orientation control hides; cell-edge + wrap
   boundary controls show, scoped to the active tile.
5. Active = Octagon → drag cell-edge slider up → octagon and
   square boundaries grow proportionally, origin polygon at each
   centre stays at its seeded size (single-shape parity).
6. Cell-edge slider min is 100; the slider can't drag below the
   seeded edge (which would pinch boundary centres tighter than
   the fixed-size origin polygons can fit).
7. Active = Octagon → toggle Wrap boundary on → cell-edge fits
   to octagon's tiles. Switch active to Square → wrap follows
   the new active tile (cell-edge refits to square).
8. Active = Octagon → click an exposed edge of an interior tile →
   placement picker opens at the cell-local edge midpoint →
   choose a polygon → tile lands inside the octagon's patch.
   Switch to Square → same flow lands inside the square's patch.
9. Complete mode → vertex layer shows dots from every boundary
   tile (octagon outer-cycle vertices AND square outer-cycle
   vertices, plus boundary corners + pockets if any). Picking
   two vertices from the same tile completes a gap inside that
   tile (router finds the right host tile from the picks; active
   tile is tried first). Picks split across tiles silently no-op.
10. Strand mode → cells stamp across the viewport via cell
    vectors at `composition.edgeLength`. With showBoundaryLattice
    on, octagon + square outlines tile cleanly at any cell-edge.
    PIC strands flow at shared edges when contact angles match.
11. Strand panel → cards appear for every distinct tile type
    across both inner patches (octagon-8, square-4, plus any
    user-placed shapes inside either).
12. Picking Triangle / Square / Hexagon while 4.8.8 is active →
    exits composition with a fresh single-shape patch in the
    chosen shape (destructive, undoable via the design-mode
    history stack).
13. Undo across composition switch → single-shape patch restored
    intact. Active-tile pane swap is **not** undoable (the active
    tile changes back via the picker, not via undo).
14. Save composition to Lab library + reload page → composition
    entry round-trips. saveJSON to file → loadJSON → both inner
    patches survive intact.
15. Load a legacy v1 single-shape patch (saved before this
    feature) → loads as v2 with composition absent.

**Previous milestone:** 2026-05-07 — Step **17.11b** (orbit
propagation for multi-vertex Complete) shipped + signed off
(`73f5f81`).

New `placePolygonsOnOrbit(editor, picks, idPrefix)` in
`src/editor/orbit.ts` mirrors `placeTilesOnOrbit`'s conventions:
applies each subgroup element to each pick, gates by
vertex-coincidence with the union of patch-outer / boundary /
pocket / neighbour vertex sets snapshotted from the initial
editor, dedups by tile centroid, and builds the placements
cumulatively against a working state — aborts (returns `null`)
if any orbit copy fails `completeNGap`. `symmetryMode='none'` ⇒
identity-only group ⇒ identical to 17.11 single-instance
behaviour. Reducer's `EDITOR_COMPLETE_N_GAP` now routes through
this helper instead of the bare `completeNGap`.

**Sign-off probes for 17.11b:**
1. `symmetryMode='none'` — multi-vertex Complete still produces
   exactly one tile (regression check vs. 17.11 sign-off probes).
2. Square + `'full'` (D4) + Ctrl-pick a corner-gap polygon →
   Enter → all 4 corners fill in one gesture.
3. Hexagon + `'full'` (D6) + Ctrl-pick a corner-gap polygon →
   Enter → all 6 corners fill.
4. Triangle + `'full'` (D3) + Ctrl-pick → all 3 corner gaps fill.
5. Square + `'rotation'` only + Ctrl-pick → 4 rotated copies fill,
   no reflections.
6. Square + `'vertical'` mirror only + Ctrl-pick on the right →
   the seed + the left mirror image fill (2 tiles).
7. Asymmetric patch — square + an extra placed tile that breaks
   D4 + `'full'` + Ctrl-pick a gap on the asymmetric side → only
   the seed places (orbit images that would land in non-existent
   gaps are silently dropped via the vertex-coincidence gate).
8. Cross-boundary case — square + `'full'` + Ctrl-pick spanning
   the boundary edge to a neighbour vertex → 4 corner-meet tiles,
   one per stamp corner.
9. Undo after orbit commit — Ctrl/Cmd+Z reverts the entire orbit
   set in one undo step (single action = single history entry).
10. Pick on the symmetry axis — Ctrl-pick 3 vertices that lie on
    the vertical mirror with `'full'` → the vertical-reflection
    orbit image deduplicates with itself (centroid dedup), no
    duplicate tile.

Earlier 2026-05-07 — Step **17.11** (multi-vertex Complete:

Earlier 2026-05-07 — Step **17.11** (multi-vertex Complete:
cross-boundary + enclosed pocket) shipped + signed off. First
sub-step of Step 17 v2 done. User confirmed multi-vertex
completions work, click order produces the expected polygon, and
the preview/hint UI guides cleanly. Tracking memo
`project_editor_complete_n_gap.md` deleted on delivery; `MEMORY.md`
line removed.

Two follow-ups captured in the plan (not blocking sign-off):
1. **Neighbour-vertex Ctrl/Cmd-click** — `b6a2568` moved
   `editorOverlay` to be the topmost child of the rotation `<g>` in
   `PatternSVG`. Strand strokes had been catching clicks at
   neighbour coordinates because they painted above the editor
   overlay. Awaiting browser confirmation that neighbour picks now
   register.
2. **Chord-mode click-on-neighbour silently no-ops.** No modifier
   + click 1 patch + click 1 neighbour → `completeGap` can't find
   the neighbour on any cycle → returns null, picks reset, no tile.
   Path forward: either auto-promote chord → multi when the second
   click lands on a neighbour, or refuse the click with a hint.
   Decide before next neighbour-fill iteration.

Locked design (this conversation):
- Click order = polygon order (user owns ordering).
- Validity: N≥3, simple polygon, centroid exterior to every existing
  tile. Mid-pick preview tints red while invalid.
- Cross-boundary tile = plain `EditorIrregularTile` straddling the
  boundary edge (Decision 5 covers it; no new tile kind).
- No pocket auto-detect — pocket cycle vertices are merely *exposed*
  as click targets. User picks them like any other vertex.
- Plain (no-modifier) 2-vertex chord flow unchanged — Ctrl/Cmd is
  purely the "I want N>2" modifier.
- Releasing Ctrl/Cmd does **not** commit; picks remain visually
  highlighted. **Enter** commits, **Esc** cancels.
- Symmetry-orbit propagation parked as 17.11b follow-up.
- Standard `ctrlKey || metaKey` cross-platform.

**17.11 commit chain (2026-05-07):**
- `9f505a6` — plan + cycle detection (17.11.0).
- `06011b5` — pocket + neighbour vertex exposure (17.11.1+17.11.2).
- `424dee4` — multi-pick state machine (17.11.3).
- `80fbc2c` — completeNGap + Enter to commit (17.11.5+17.11.6).
- `9406ee9` — preview polygon with validity tint (17.11.4).
- `1a64d8f` — progress notes + sign-off probes.
- `b6a2568` — fix: 17.11.7 layer-order (neighbour-vertex clicks).

**Sign-off probes for 17.11.7:**
1. Existing 17.5 chord regression — square + 4 corner triangles → no
   modifier → click 2 adjacent triangle apexes → corner gap fills as
   today (one tile, single click sequence).
2. Enclosed pocket — build a patch with an interior triangular hole
   (3 tiles forming a triangular gap inside the patch). Pocket
   vertices should appear as accent-tinted dots distinct from the
   outer-cycle dots. Ctrl/Cmd-click the 3 pocket vertices in CCW
   order → preview polygon shows accent fill → press Enter → one
   irregular tile fills the pocket. Subsequent click on an outer
   vertex without modifier should start a fresh chord pick (not
   extend the previous multi-pick).
3. Cross-boundary — square or hex patch with one or two corners
   missing → "Show neighbours" on → ghost dots at neighbour stamps'
   outer cycles render at ~0.45 opacity. Ctrl/Cmd-click 1 patch
   vertex + 2 neighbour vertices forming a corner-gap polygon →
   Enter → tile commits with vertices straddling the boundary.
   Strand-mode lattice should show one continuous fill at the
   meeting point (not three sub-pieces).
4. Self-intersection — Ctrl/Cmd-click 4 vertices in a bowtie order
   (2 patch + 2 across) → preview tints red with dashed stroke →
   Enter no-ops → Esc clears.
5. Centroid-inside-tile — Ctrl/Cmd-click 3 vertices that bracket
   tiles (rather than a gap) → preview tints red → Enter no-ops.
6. Duplicate vertex — Ctrl/Cmd-click the same vertex twice →
   preview tints red.
7. Esc cancellation — at any pick depth, Esc clears all picks
   (chord OR multi).
8. Cancel button — at picks.length ≥ 1, Cancel button shows in the
   hint area; click it → all picks cleared.
9. Undo — after a multi-vertex commit, Ctrl/Cmd+Z reverts the
   completed tile (action is in DESIGN_MODE_ACTIONS).
10. Cross-platform — on Mac, Cmd-click engages multi mode the same
    as Ctrl-click on Linux/Windows.

If 17.11.7 finds bugs, fix them as a follow-up commit before sign-off.
After sign-off, delete `project_editor_complete_n_gap.md` from memory
and remove its line from `MEMORY.md` (per memory hygiene rule).

**Parked follow-up:** 17.11b — orbit propagation for multi-vertex
Complete (apply `editor.symmetryMode` to mirror the completed polygon
across the orbit, the way 17.4 mirrors `EDITOR_PLACE_TILE_ON_EDGE`).

Earlier 2026-05-06 — Step 17.4 re-enabled + signed off.
Symmetry-axis subgroup picker (`9015ac0`) plus follow-up fix
(`7be4ef4`) so the polygon picker hides side counts whose orbit
images would fail viability (the original symptom: octagon offered
on a square origin under Full mode, click silently did nothing).
Default mode is `'none'` (legacy 17.3 behaviour); user opts into
`'full' | 'rotation' | 'vertical' | 'horizontal'` via the
`<select>` between Origin sides and Wrap boundary in the Editor
Design controls. Triangle hides "Horizontal mirror" since
equilateral triangles have no horizontal mirror axis. Idea memo
deleted on delivery; plan decision row flipped from archived to
re-enabled. Two related ideas remain captured for future work:
`project_editor_cross_boundary_complete_idea.md` and the new
`project_editor_enclosed_pocket_idea.md` (multi-vertex-gap → one
tile mechanic).

Earlier 2026-05-06 — Lab UI polish: collapsible sections
+ custom Save/Rename modal (`69e1f7b`, fix `9ddb1d5`). All four
sidebar sections (Editor / My Tessellations / Strands / Display)
now have chevron-toggle headers matching Main mode; open/closed
state persists per-section to `lab-sidebar-collapsed-sections` in
localStorage. New `src/components/TextPromptModal.tsx` replaces the
two `window.prompt` calls with an in-app dialog (Esc / backdrop /
Cancel dismiss; Enter to confirm; focus + select on open; empty
input disables confirm). The modal sits at `--bg-elevated` so it
reads opaque against the canvas (initial commit used a non-existent
`--bg` variable that fell through to transparent — fix in
`9ddb1d5`).

Earlier 2026-05-06 — sub-step **17.9** code-complete:
undo / redo (Q12). New `src/editor/history.ts` defines
`DESIGN_MODE_ACTIONS`, `HISTORY_DEPTH = 50`, and
`HISTORY_COALESCE_MS = 500`. New `src/editor/useEditorHistory.ts`
hook wraps the base dispatch — for any action in
`DESIGN_MODE_ACTIONS`, snapshots the prior `EditorConfig` to a `past`
stack (capped at 50, FIFO eviction); consecutive same-type actions
within 500ms coalesce into one entry so a slider drag is one undo
step. `LOAD_CONFIG` clears the entire stack. New action
`EDITOR_RESTORE_SNAPSHOT` (payload `EditorConfig | null`) is the
restore primitive used by undo/redo: when payload is null it drops
`editor` and zeroes `tiling.type`, otherwise it sets `editor` and
re-seeds figures (no `applyWrap` — snapshot already carries its own
boundary size). Strand-mode actions (figure tuning, lacing, curves)
explicitly bypass the stack so flipping back from Strand never
resurfaces stale figure tuning. Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z
(plus Ctrl+Y) bound globally while Lab is mounted; ignored when
focus is in an input/textarea/select so the library Save / Rename
prompts aren't hijacked. `EditorDesignControls` gained an Undo /
Redo header row above the Phase toggle, visible in both phases per
Q12 ("preserved across Design ↔ Strand flips").

Earlier: 2026-05-06 — sub-step **17.8** code-complete:
persistence validation + migration scaffold. New
`src/editor/migrations.ts` exports `migrateEditorConfig(unknown)`:
takes an unvalidated value (from JSON / localStorage), checks shape,
returns a clean `EditorConfig` or `null`. The version dispatch is the
intended hook for future `EditorConfig.version` bumps; only `1` is
valid today. New `src/state/configValidation.ts` exports
`loadPatternConfig(unknown)` + `ConfigValidationError`: validates
`tiling`, `figures`, `lacing`; rejects retired tiling types
(`layered-mandala`, `composition`); routes the optional `editor`
field through `migrateEditorConfig`. `loadJSON` now returns a
validated `PatternConfig` and rejects with a `ConfigValidationError`
on malformed input; `App.handleLoadJSON` surfaces the message via
`window.alert`. `customTessellations.listSavedTessellations` runs
each entry through `loadPatternConfig` and skips bad rows with a
warning so one corrupt entry doesn't blank the whole library.

Earlier 2026-05-06 — UI move: auto-complete checkbox now lives inside
the Mode section's Complete branch; only surfaces when Complete is
selected (`af06d66`). Wrap boundary stays above the Mode toggle since
it applies in both Place and Complete.

Earlier: 2026-05-06 — split 17.7's `match-boundary` flavour
out into a separate design-mode "Wrap boundary" toggle. Auto-complete
keeps its single checkbox (no dropdown) and always runs until-convex
on Design→Strand flip. `EditorConfig.wrapBoundary` is a new optional
flag; when on, `applyWrap` recomputes `boundarySize` to hug the patch
after every tile mutation (place / complete / delete / origin-sides /
boundary-shape / alternate / auto-complete run). Manual drag of the
boundary-size slider clears the flag, so the slider stays meaningful
when wrap is off. New reducer helper `applyWrap(state)` threads the
fit through tile-mutating cases. Type / action changes:
`AutoCompleteFlavor` removed; `SET_EDITOR_AUTO_COMPLETE_FLAVOR`
removed; `SET_EDITOR_WRAP_BOUNDARY` added. `autoCompletePatch` no
longer takes a flavor and returns `{ tiles }` only — `fitBoundarySize`
is the standalone helper for wrap. UI in `EditorDesignControls`:
"Auto-complete on entering Strand editor" + "Wrap boundary"
checkboxes; small caption under the boundary-size slider when wrap
is on ("Driven by Wrap boundary — drag to override.").

Earlier: 2026-05-05 — sub-step **17.7** code-complete:
auto-complete on flip (Decision 11). New `editor/autoComplete.ts`
exports `autoCompletePatch(editor)` and `fitBoundarySize`.
Walks the patch's outer cycle (CCW, via existing
`computeOuterBoundary`), finds the first reflex vertex (cross of
incoming × outgoing edges < 0), and dispatches `completeGap` on the
prev/next neighbours; loops up to 64 passes or until convex.
`EditorConfig` gained an optional `autoComplete?: { enabled }`
field; new reducer actions `SET_EDITOR_AUTO_COMPLETE_ENABLED` and
`EDITOR_RUN_AUTO_COMPLETE`. The latter is idempotent on already-
convex patches. `EditorDesignControls` shows an
"Auto-complete on entering Strand editor" checkbox.
`TessellationLabMode` dispatches `EDITOR_RUN_AUTO_COMPLETE` on the
Design→Strand transition when the opt-in is on. Auto-completed
tiles persist as first-class `'completed'` polygons (Decision 16)
so flipping back to Design leaves them editable / deletable.

Earlier: 2026-05-05 — sub-step **17.6** code-complete in two
parts.

**17.6a (`7056a9f`)** — canonical-signature `tileTypeId` for irregular
tiles per Q11 (Option B): regular `"<n>"`, irregular
`"<n>i:<8-char hex>"` from interior-angles + edge-length-ratios
quantised to 4 d.p., reduced to lex-min cyclic / reflective rotation,
FNV-1a hashed. New `editor/tileTypeId.ts` + `editor/tileTypes.ts`
expose `tileTypeIdFor`, `tileTypeLabel`, `editorTileTypes`,
`seedFiguresForEditor`. Reducer's editor cases all run through a
`seedFigures` helper (Q15: lazy + additive — deletes never strip
figures, so re-placing the same shape restores tuning). Strand panel
in Lab now lists one card per distinct tile type in the patch
("Triangle" / "Square" / … for regulars; "Irregular A/B/C…" for
irregulars in first-seen order).

**17.6b** — strand-editor lattice preview + Design / Strand phase
flip. New `editor/lattice.ts` returns translation-stamps covering the
viewport for square (basis (L,0)/(0,L)) and hex (basis (√3·L,0) /
(√3·L/2, 1.5L)). Triangle defers to a follow-up (needs 2-orientation
alternation); strand mode on a triangle boundary shows a single
stamp with an explanatory note. `usePattern` accepts an
`editorStrandMode` flag; when on, it generates polygons by stamping
`editorTilesToPolygons` at every lattice translation, runs PIC over
the whole stamped set, and returns no `boundaryOutline`. `Canvas`
hides the edge / vertex / picker overlays in strand mode.
`TessellationLabMode` owns a `editorPhase: 'design' | 'strand'`
flag (UI-only); `EditorDesignControls` shows a Design / Strand
editor toggle at the top, and in strand phase replaces the design
rows with a hint card.

Earlier: 2026-05-05 — sub-step **17.5** code-complete:
manual Complete operation. Single-gap version (no orbit propagation
since 17.4 is parked). New `editor/boundary.ts` walks exposed edges
into a CCW outer-boundary cycle. New `editor/complete.ts` resolves
the gap between two picked vertices by trying both arcs and keeping
the one whose chord-and-arc polygon's centroid is **outside** the
patch (handles concavities + rejects convex-side chords); then
prefers a regular-polygon fit (sides + angles within tolerance) and
falls back to an irregular `EditorIrregularTile` per Decision 10/12.
New reducer action `EDITOR_COMPLETE_GAP` (payload `{pA, pB}`). New
`EditorVertexLayer` SVG layer of clickable boundary dots; `Canvas`
swaps it in for the edge layer when `editorMode === 'complete'`.
Editor section now has a Place / Complete mode toggle + a hint
caption, with Esc / Cancel to drop a half-completed pick. Acceptance
probe: square origin + 4 placed triangles → switch to Complete, click
two adjacent triangle apexes → corner gap fills with an isosceles
(irregular) tile.

Earlier same day — boundary-size + origin-sides UX
follow-ups. Per-shape default boundary edge lengths
(`DEFAULT_BOUNDARY_SIZE_BY_SHAPE = { triangle: 460, square: 400,
hexagon: 200 }`) so all three boundaries read at a comparable visual
scale; slider max bumped 500 → 800. `SET_EDITOR_BOUNDARY_SHAPE` now
also snaps `boundarySize` to the new shape's default (consistent
with the existing tile-reset semantics). Origin-sides slider is
greyed out and labelled "Locked — clear the patch to change the
origin shape" once any tile beyond the origin has been placed, so a
stray drag can't wipe the patch.

Earlier same day: sub-step **17.4 archived** the same
day it was built. Built first as `e30fdb9` (orbit-symmetric
placement + delete under D3/D4/D6), then the user tried it in the
browser and didn't like how it felt — but wasn't yet sure what
alternative they wanted. Rather than iterate blindly we **parked
the whole feature**: moved `editor/symmetry.ts` and `editor/orbit.ts`
to `archive/editor-orbit-17.4/` (with a restoration `README.md`),
and reverted the reducer to 17.3's single-edge placement + tile
delete. The `project_editor_symmetry_axes_toggle_idea.md` `/idea`
was updated to note that re-enabling propagation should be bundled
with a symmetry-axis subgroup picker (full / rotation-only /
vertical / horizontal / none) — it shouldn't ship as full-D_n-by-
default again.

Earlier: 2026-05-04 — sub-step **17.3** shipped (`ccc7da0`):
single-edge tile placement. New geometry helpers
`computeExposedEdges`, `placeRegularNGonOnEdge`, `isPlacementViable`
(Decision 7 angle-sum check + Decision 14a non-conforming gate),
`viableSidesForEdge` filtering `PICKER_SIDES = {3,4,5,6,7,8,9,10,12}`.
New `EditorEdgeLayer` renders inside `PatternSVG`'s rotation `<g>`
via a new `editorOverlay` slot — each exposed edge has an invisible
hit-area; pointer events stop propagation so pan doesn't fire.
Non-conforming edges render dashed and inert. New
`EditorPickerOverlay` is a screen-space HTML popover positioned via
a new `worldToScreen` helper in `Canvas` that respects pan, zoom
and the rotation `<g>`. New reducer action
`EDITOR_PLACE_TILE_ON_EDGE` re-validates and appends a placed tile.
`TessellationLabMode` owns `selectedEdge` state and dispatches the
placement. Awaiting visual sign-off.

Earlier: 17.2 shipped 2026-05-04 (`f9d6197`) — Design-mode shell;
follow-up `0aff7fb` resets placed tiles when shape / origin sides
change. 17.1 shipped 2026-05-03 (`e199aee`) — data model +
read-only render. `94f651c` made Lab editor-only.

**2026-05-06 — Step 17.4 re-enabled + signed off** (`9015ac0` +
fix `7be4ef4`). Restored `src/editor/symmetry.ts` +
`src/editor/orbit.ts` from `archive/editor-orbit-17.4/` and
parameterised `boundarySymmetries(shape, mode)` with the new
`SymmetryMode` = `'full' | 'rotation' | 'vertical' | 'horizontal'
| 'none'`. Default on `editor.symmetryMode` is absent → reads as
`'none'` (current 17.3 single-edge behaviour) so legacy patches
load unchanged. Reducer's `EDITOR_PLACE_TILE_ON_EDGE` and
`EDITOR_DELETE_TILE` route through `placeTilesOnOrbit` /
`orbitTileIds` when mode ≠ none; orbit-aware delete filters the
origin tile out defensively. Picker UI in `EditorDesignControls`
is a `<select>` between Origin sides and Wrap boundary;
"Horizontal mirror only" is hidden for triangle (no horizontal
mirror axis on an equilateral triangle).
`SET_EDITOR_SYMMETRY_MODE` is a design-mode action so undo/redo
covers it. Follow-up fix (`7be4ef4`): `viableSidesForEdge` in
`orbit.ts` runs an orbit-wide probe so the picker hides side
counts whose orbit images would fail viability — replaces the
silent-fail behaviour the user hit on octagon-into-square. Plan
doc decision row for 17.4 flipped from archived to re-enabled.
Idea memo `project_editor_symmetry_axes_toggle_idea.md` deleted
(DELIVERED).

**2026-05-06 — Steps 17.6c + 17.6d signed off.**

**17.6c — Triangle strand-mode lattice.** `editorLatticeStamps`
now handles triangle via a 2-orientation cell (source + 180°-flipped),
basis derived from boundary edge midpoints (handles
`alternateBoundary` for free). `usePattern`'s strand-mode stamping
applies stamp rotation around the patch centroid before translation,
for polygons and the optional boundary-lattice outlines.
`supportsLatticePreview` returns true for all shapes now.

**17.6d — Design-mode neighbour preview.** "Show neighbours" toggle
in Editor Design controls renders one ring of low-opacity ghost
stamps around the patch. `editorOneRingNeighbourStamps` returns 8
offsets for square, 6 for hex, 3 for triangle (the edge-shared
down-triangles flipped 180°). Two sub-toggles when on: "Show
boundaries" (ghost outlines via `boundaryOutlines`) and "Show
strands" (ghosts join the PIC input so strands flow across stamp
edges). Disabled while `wrapBoundary` is on (boundary moves mid-edit).
Standalone preview; cross-boundary Complete fill (the 17.5b idea)
stays parked but is easier to plan for now that gaps are visible.

**2026-05-06 — Main "My Patterns" library shipped + signed off.**
Reversed plan decision #10. New `state/configLibrary.ts` factory
(storage-key parameterised) backs both libraries.
`state/customTessellations.ts` became a thin wrapper using
`lab-tessellations-v1`; new `state/mainConfigs.ts` wraps
`main-configs-v1` so namespaces stay separate. UI lifted into
`components/ConfigLibraryPanel.tsx` and plugged into both Lab's
"My Tessellations" and Main's new "My Patterns" sidebar section
(between Display and Export). Panel takes a controlled `activeId`
so external resets — Lab's Clear / New / Sample, Main's Load JSON
— can wipe selection.

**17.9 signed off 2026-05-06** — undo/redo confirmed working.

**2026-05-06 — sub-step 17.10 code-complete: non-tiling patch
detection + UI tag.** New `src/editor/nonTilingDetection.ts`
exports `detectPatchTilingStatus(editor)` — shoelace-area compare
of `computeOuterBoundary` vs `editorBoundaryVertices` with a 1%
relative tolerance. Returns `{ kind: 'tiling' }` or
`{ kind: 'non-tiling', reason: 'underfills' | 'overflows' | 'empty' }`.
`TessellationLabMode` renders a small `NonTilingWarning` block
inside the strand-mode info card when the status is non-tiling
("Patch doesn't fill the boundary — stamped copies will leave
gaps." / "Patch extends past the boundary — stamped copies will
overlap."). Diagnostic only; no auto-fix per scope. This is the
last v1 sub-step — Step 17 v1 complete pending visual sign-off.

**Next action:** Step 17 v1 is feature-complete. All shipped
sub-steps (17.0–17.10, plus 17.4 re-enabled) are signed off
through 2026-05-06. Pick-up options for the next session, in
rough priority order (no commitment yet):

1. **Cross-boundary Complete fill** + **enclosed-pocket Complete
   fill** (`project_editor_cross_boundary_complete_idea.md` +
   `project_editor_enclosed_pocket_idea.md`). Captured as related
   ideas — both about resolving multi-vertex gaps as a single
   irregular tile rather than as N pieces. Co-design recommended.
2. **Step 15** k-uniform tiling generator (parked).
3. **Step 16** quasi-periodic tilings (parked).
4. **Step 18** Girih substitution (parked).
5. Other Lab UX or strand-rendering polish — open list.

17.8 sign-off probes (carried forward — confirm before 17.9 sign-off):
1. Save 3 patches across categories → reload → all persist.
2. Save → load JSON round-trips wrap/auto-complete flags.
3. Devtools-corrupt one library row → bad row skipped on reload.
4. Import unrelated JSON → friendly alert.

17.7 sign-off probes (2026-05-06) — confirmed working:
- Auto-complete checkbox alone fills concave dents on flip.
- Wrap boundary toggle on → boundary hugs patch live in Design.
- Build out tiles with wrap on → boundary follows.
- Drag boundary-size slider with wrap on → wrap clears, slider takes
  over.

After 17.7 sign-off:
1. New square patch + a few placed tiles → flip to Strand editor →
   patch should appear stamped on a square grid covering the viewport.
   Strand panel cards drive global strand tuning.
2. Hex patch with placed tiles → strand mode → hex lattice stamping.
3. Triangle patch → strand mode → single stamp with the deferred-lattice
   notice.
4. Place a tile in design mode, flip to strand, edit contact angle,
   flip back to design — the figure tuning should persist (Q15
   stickiness).
5. Build a patch with one irregular completed tile and one regular
   placed tile → strand panel should list both as separate cards
   ("Irregular A" + "Triangle" or similar).

**17.5 deferred items still in 17.6a:** none — canonical-hash + lazy
seeding shipped here. **17.6c follow-up:** triangle 2-orientation
lattice (alternating up/down stamps). Will file as `/idea` if you want
to formally park it.

Visual sign-off on 17.5 probes:
1. New square + place 4 triangles on its edges → Complete mode →
   pick two adjacent triangle apexes (across one corner) → the
   corner gap fills.
2. Repeat the click for the other 3 corners → all 4 corners filled.
3. Hex origin + place 6 triangles → Complete the corner gaps.
4. Convex chord (pick two non-adjacent vertices on a still-convex
   patch) → no fill (gap centroid is inside the patch, rejected).
5. Pick a vertex twice → cancels the pick (no fill).
6. Cancel button + Esc both reset the half-completed pick.

Strand rendering on irregular completed tiles will look provisional
until 17.6 (canonical-signature hash + per-polygon synthetic
figures-map). That's deferred and expected.

**17.4 parking note:** archived under `archive/editor-orbit-17.4/`.
When the user is ready, re-enable bundled with the symmetry-axis
subgroup picker (see `project_editor_symmetry_axes_toggle_idea.md`)
— don't ship full-D_n-by-default again.

**17.3 visual review (2026-05-04):** user confirmed it works well
overall. Two follow-ups landed in the same session:
1. Picker icon contrast — buttons were too dark; switched to
   accent-bordered + accent-coloured icons (`fix(picker): brighten
   icons` follow-up commit). Look for further refinement if still
   under-contrast in light theme.
2. Overlap detection — angle-sum at shared endpoints missed
   non-adjacent tile overlaps for large candidate n-gons (e.g.,
   placing a 12-gon on a small square's edge wrapping past
   neighbours). `isPlacementViable` now also runs a centre-in-polygon
   check both ways via `pointInPolygon` against `regularPolygonVertices`
   of the candidate. Should catch the cases the user saw.

**17.3 deferred:** symmetry conservation is *not* enforced on
single-edge placements — the user can still build asymmetric
patches. Captured as `/idea`
(`project_editor_symmetry_enforcement_idea.md`, MEMORY.md updated).
Decision: defer until 17.4 lands the orbit, then optionally add a
"Strict symmetry" checkbox that *refuses* asymmetric placements
(distinct from 17.4's default which *propagates* placements
across the orbit).

**To rebuild context in a fresh session, read:**
1. This file (status anchor).
2. `TESSELLATION_REVAMP_PLAN.md` — full plan, Steps 4–8 / 12 / 13 marked
   ARCHIVED but kept for design history. The Step 17 brief at the bottom
   is the live one.
3. `archive/tessellation-lab/README.md` — what's archived and which
   helpers may be worth lifting back into the editor.
4. `CLAUDE.md` (project) — repo conventions and architecture overview.

---

## Goal
Improve tessellation options and add UI customisability. The user-editable
tessellation editor (Step 17) is the remaining ambition; everything else
on the original plan has either shipped, been archived, or been parked.

## Terminology (locked 2026-04-26)
- **Tessellation** — underlying polygon tiling (squares, hexagons, etc.).
- **Strand** — a line in the decorative PIC pattern overlaid on a tessellation.

UI strings use these. Internal code still uses "tiling" / "lineLength" in
some identifiers; deferred refactors, not user-visible.

## Status snapshot

Plan steps live in `TESSELLATION_REVAMP_PLAN.md`. One-liner status:

- [done] Phase 0 — architectural decisions, terminology, Option-B restructure
- [done] Steps 1–3 — Lab scaffold + existing tessellations + hexadecagonal-rosette
- [archived 2026-05-03] Steps 4–8 — preset catalogue, mandala engine + presets, composition + presets
- [done] Steps 9–11 — Lab polish, `FigureControls` lift, Lab Strands panel
- [archived 2026-05-03] Steps 12–13 — mandala strand renderer, composition strand renderer + match-up
- [done] Step 14 — Lab-local library (`state/customTessellations.ts`)
- [done] **Step 17 v1** — user-editable tessellation editor. 17.0–17.10 shipped + signed off. 17.4 re-enabled 2026-05-06 behind the `SymmetryMode` subgroup picker.
- [parked] Steps 15, 16, 18 — k-uniform generator, quasi-periodic, Girih substitution

## Live architecture (post-cleanup, post-17.3)

- `TilingCategory` = `'archimedean' | 'rosette-patch'` (live tree). The
  editor patch is signalled by `tiling.type === 'editor'` plus
  `config.editor` payload — it has no `TilingDefinition` entry because
  it doesn't fit the static-tiling schema.
- `PatternConfig` carries `tiling`, `figures`, `lacing`, optional
  `edgeAngles`, optional `smoothTransitions`, and **optional `editor?:
  EditorConfig`** (Q13 Option C). `EditorConfig` has its own inner
  `version: 1`.
- `EditorConfig` shape: `{ version, boundaryShape, boundarySize,
  originSides, edgeLength, autoComplete?, wrapBoundary?, tiles:
  EditorTile[] }`. `EditorTile` is a
  tagged union of `EditorRegularTile` and `EditorIrregularTile` with
  an `origin: 'origin' | 'placed' | 'completed'` discriminator (single
  array per Decision 12).
- `SavedSourceCategory` = `'archimedean' | 'rosette-patch' | 'editor'`.
- Reducer actions: PIC + figure controls, plus editor actions —
  `EDITOR_NEW`, `EDITOR_CLEAR`, `SET_EDITOR_BOUNDARY_SHAPE`,
  `SET_EDITOR_BOUNDARY_SIZE`, `SET_EDITOR_ORIGIN_SIDES`,
  `EDITOR_PLACE_TILE_ON_EDGE`. Knob handlers are no-ops when no
  patch is active. Shape / origin-sides changes reset `tiles` to
  `[origin]` (orbit / origin invalidates downstream tiles).
  `EDITOR_PLACE_TILE_ON_EDGE` recomputes `computeExposedEdges`,
  re-validates with `isPlacementViable`, and appends an `origin:
  'placed'` tile.
- `usePattern` dispatches: editor branch first (`tiling.type === 'editor'
  && config.editor` → `editorTilesToPolygons` + `runPIC` +
  `editorBoundaryVertices`), then the existing archimedean /
  rosette-patch branches. Editor patches bypass viewport
  quantisation since they're finite. `PatternData` now carries an
  optional `boundaryOutline: Vec2[]` populated only in editor mode.
- `tileTypeIdFor()` keys regular tiles as `"<n>"`. Irregular tiles get a
  provisional `"<n>i:provisional"` placeholder until 17.5 lifts the
  canonical-signature hash from `archive/tessellation-lab/`.
- `PatternSVG` has no clipPath plumbing — single tile + strand layer.
  At 17.2 it accepts an optional `boundaryOutline: Vec2[]` and renders
  it as a non-interactive dashed accent polygon below `TileLayer`
  (via the local `BoundaryOutline` sub-component). At 17.3 it gained
  an `editorOverlay?: ReactNode` slot rendered above `TileLayer`
  inside the rotation `<g>`; `Canvas` plugs in `EditorEdgeLayer` and
  positions the picker via screen-space `worldToScreen`.
- `App.tsx` has no `activePresetId` state.
- `TessellationLabMode` chrome (post-17.2): header, **Editor
  section** which swaps based on patch state — when active, shows
  design controls (3 boundary-shape buttons + boundary-size slider
  + origin-sides slider + Clear); when inactive, shows New patch /
  Show sample patch. "My Tessellations" library (Save / Rename /
  Duplicate / Delete + saved-entries dropdown), Strands panel
  (currently inert in editor mode — wired at 17.6 per Q15),
  Display section. The standard tessellation Type dropdown /
  Scale / Reset / Info panel were removed in `94f651c` — Lab is
  editor-only.
- Editor defaults (`src/editor/createDefault.ts`): square boundary,
  boundarySize 200, originSides 4, edgeLength 100. Origin rotation
  is 0 across all combos; boundary rotation is `-π/2` for triangle /
  hex (point-up) and `π/4` for square (axis-aligned), defined in
  `BOUNDARY_ROTATION` inside `buildEditorPolygons.ts`.
- Migrations: `loadLabState` resets retired tiling types to `''` and
  strips dropped payloads; `listSavedTessellations` skips retired-type
  entries with `console.warn`. `'editor'` is *not* retired and passes
  through.

## Decisions still in force after the pivot

1. Lab is a separate mode; Main is unchanged.
2. Tessellation-first rendering in Lab; strands are an optional overlay.
3. Lab-resident custom work — no Main-mode bridge.
4. Library is Lab-only, persists to `lab-tessellations-v1` localStorage.
5. Existing JSON `saveJSON` / `loadJSON` remains the canonical share format.

Architectural decisions specific to mandala / composition (strict-divisor
layer rule, hard-frame fallback, verified-pairs allow-list, etc.) are
moot now those features are archived.

## Blockers
None. 17.3 visually signed off (with two follow-ups that shipped
in the same commit). 17.4 (orbit propagation) is queued.
