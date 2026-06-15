# Thermo-Nuclear Review — Findings Ledger

State file for the whole-codebase review program (see `THERMONUCLEAR_REVIEW_PLAN.md`).
One row per finding: `chunk | file | severity | finding | remedy | status`.
Severity = the skill's standards (S0–S8). Status = `open | in-progress | done | deferred`.

---

## Tier-0 Baseline (Wave A) — 2026-06-13

Green baseline captured on `main`. Re-show these numbers at every Verification Checkpoint.

| Metric | Baseline value |
| --- | --- |
| `npx tsc --noEmit` | ✅ clean (exit 0) |
| `npm test` (vitest run) | ✅ **315 tests / 31 files** passing |
| `npm run build` | ✅ success — `index.js` 419.67 kB (gzip 127.73 kB), 115 modules |
| Builder FPS (PerfHud, heavy pattern) | _to capture with user at checkpoint_ |

### Largest-file line counts (Std-1 tripwire — must trend DOWN, never up)

| File | Baseline lines |
| --- | --- |
| `components/TessellationLabMode.tsx` | 2243 |
| `components/Canvas.tsx` | 974 |
| `components/Sidebar.tsx` | 907 |
| `hooks/usePattern.ts` | 902 |
| `state/reducer.ts` | 877 |
| `tilings/tapratsTiling.ts` | 796 |
| `pic/index.ts` | 667 |
| `decoration/voids.ts` | 609 |
| `components/EditorPickerOverlay.tsx` | 531 |
| `components/strands/FigureControls.tsx` | 497 |
| `editor/vertexPlacement.ts` | 487 |
| `components/ColourPicker.tsx` | 439 |
| `editor/migrations.ts` | 423 |
| `components/EditorVertexLayer.tsx` | 417 |
| `types/editor.ts` | 404 |
| `tilings/index.ts` | 394 |
| `rendering/PatternSVG.tsx` | 384 |
| Total (`src/**/*.ts{,x}`) | 26791 |

**user-verified: no** (pending Wave-A checkpoint)

---

## Findings

| Chunk | File | Sev | Finding | Remedy | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | `TessellationLabMode.tsx` | S1 | File was 2243 ln (2.2× the 1k bar). Two oversized components in one file. | Split into `lab/` module. **DONE:** shell now 812 ln; `lab/` = labShared 232, EditorDesignControls 199 (orchestrator), CompositionPanel 51, DecorationPanel 257, FramePanel 316, DesignPanel 555. No file >1000. | done |
| 1 | `TessellationLabMode.tsx` | S1/S2 | `EditorDesignControls` was ~1137 ln — 7 independent panels inlined into one function body. | **DONE:** each phase panel → its own focused component; `EditorDesignControls` is now a 199-ln orchestrator (undo/redo + phase switch + composition). Each panel self-derives `cell`/`multiCell` from `editor` — removes prop-drilling. | done |
| 1 | `lab/DesignPanel.tsx` | S1 | 555 ln — under the 1k bar but above the plan's ~400-500 target. Three logical groups (boundary/seed, symmetry/wrap/neighbours, tool). | Optional further split. Deferred — low risk, diminishing returns. | deferred |
| 1 | `lab/*` | S3/S4 | "Cinzel uppercase pill button" inline-style copy-pasted with minor variants. | **DONE**: extracted `segmentedButtonStyle(active, opts)` in `labShared` — dedupes the accent active/inactive triplet + 9 shared props across the 3 segmented-control sites (phase switch, tool toggle, decoration seg buttons), byte-identical. The divergent plain pills (undo/redo/clear/frame — varying size/spacing/padding/width) left **inline by design**: a shared helper there would be a fat config object adding indirection without real dedup (Std-4). | done |
| 1 | `TessellationLabMode.tsx` | S8 | Zero tests; pure-presentational + dispatch-wiring. The only testable derived logic (`tileTypes`, `validity`) is already covered by `editorTileTypes`/`validateMultiPick` unit tests. | Manual-verify only (Wave-B checkpoint: Design→Composition→Decoration walk). | open (awaiting user verify) |

### Chunk 2 — `Canvas.tsx` (974) + overlay cluster

Audit conclusion: the overlay components (`EditorPickerOverlay` 531, `EditorVertexLayer` 417, `OverlapConfirmModal` 204) are **healthy** — under the 1k bar and already decomposed into small sub-components; the `feedback_editor_svg_overlay_events` event-ordering caveat is correctly respected (onPointerDown + stopPropagation + documented render order). No action. The real target is `Canvas.tsx`.

| Chunk | File | Sev | Finding | Remedy | Status |
| --- | --- | --- | --- | --- | --- |
| 2 | `Canvas.tsx` | S6 | `cellTransform`+`applyTransform` reimplemented the Cell-local→Patch-world transform that already exists canonically as `applyCellTransform` (patchSelectable, used by reducer). | **DONE** (`b26c75f`): routed all 10 overlay call sites through `applyCellTransform`, deleted the duplicate; +7 characterization tests pin the transform. 974→948. | done |
| 2 | `Canvas.tsx` | S8 | `worldToScreen` (pan/zoom/rotation pixel mapping) was untested and inline in the component. | **DONE** (`65d0ab2`): extracted to pure `rendering/screenSpace.ts` + 6 tests. 948→922. | done |
| 2 | `Canvas.tsx` | S0/S2 | Four parallel picker pipelines (edge / boundary-section / vertex-placement / complete-vertex) — each a self-contained cluster of memos + local state — inline in the component body. | Extract one custom hook per pipeline (`useEdgePicker` etc.) for concept reduction. **DEFERRED**: Canvas is under the 1k hard bar, this is the riskiest (interdependent state/memo) part, and it's manual-verify-only; warrants its own focused session. | deferred |
| 2 | placement/picker | bug | Seed-tile inside/outside placement option inconsistent (`project_seed_tile_place_inside_outside_bug`). No explicit inside/outside toggle found in the picker code; likely the vertex-orientation set or viable-vs-forceable gating. | Needs a **user repro** (cell shape, edge, sizes shown vs not) to pin. | open (needs repro) |

### Chunk-2 result — green

`tsc` clean · **328/328 tests pass** (315 baseline +7 cellTransform +6 screenSpace) · build OK · bundle gzip 127.20 (was 127.73, smaller). Canvas 974→922. Two Std-6/Std-8 wins; behaviour-preserving (transform dedup proven algebraically + pinned). **user-verified: pending** (Wave-C checkpoint: exercise all 3 Place flows + ⚠ overlap popover + Complete + pan/zoom/rotate).

### Chunk-1 result (extraction increment) — green

`tsc` clean · **315/315 tests pass** · build OK · bundle 420.71 kB (gzip 127.72, was 127.73). Pure verbatim JSX relocation, no logic change. **user-verified: yes** (2026-06-13 — user exercised the Lab in-browser; only pre-existing behavioural bugs surfaced, no refactor regression). **MERGED to `main`** (`6eb6721`).

Bugs found during verify (both pre-existing, NOT refactor-caused — placement/PIC logic untouched), filed to memory for later chunks:
- Seed-tile Place: inside/outside option inconsistent → `project_seed_tile_place_inside_outside_bug.md` (Chunk 2).
- Force-overlapped tiles: overlap region sometimes emits its own Strands → `project_overlap_tiles_strand_bug.md` (Chunk 7).

### Chunk 4 — `hooks/usePattern.ts` (902)

Audit conclusion: the geometry-pipeline orchestrator is **under the 1k bar** and is the single most **perf-fragile** file in the tree — a chain of seven viewport/geometry/decoration-keyed `useMemo`s with hand-tuned, load-bearing dep arrays (several documented `eslint-disable react-hooks/exhaustive-deps`) and a stale-snapshot contract on `editorBase.patch`. The original plan's Std-2/5/7 ambition (collapse the flag soup; make the single-cell/multi-cell split an explicit dispatch; restructure the ~250-ln final memo) is **DEFERRED**: the memos' deps and the fast-path/non-fast-path/Decoration branching encode real, separately-verified perf fixes (zoom bucketing, frame-field keying, per-paint reuse — see SESSION_STATE), and the perf memory explicitly warns against churn here. A restructure would be high-risk for near-zero Std-1 payoff (no line-count win) and is not worth it without a dedicated perf-verify session. What this chunk banks instead is the **missing Std-8 safety net** on the two genuinely-pure, behavior-bearing helpers, so a future restructure has characterization cover.

| Chunk | File | Sev | Finding | Remedy | Status |
| --- | --- | --- | --- | --- | --- |
| 4 | `usePattern.ts` | S8 | `stampSegments` (translation-invariant field stamping; rotation+translation of base PIC segments across lattice stamps) was untested — load-bearing for the Lever-A fast-path field + Decoration reps/overlay hit-targets. | **DONE**: exported + 6 characterization tests (translate-all-four-points + scalar-preserve, no-mutation, count/order = base×stamps, 90° rotate-about-origin-then-translate, empty base / empty stamps). | done |
| 4 | `usePattern.ts` | S8 | `periodicFastPathEligible` (the SINGLE source of truth for Lever-A eligibility shared by the render gate + the Decoration reps memo; drift here blanks fills or wastes extraction) was untested. | **DONE**: exported + 8 tests pinning every gate (flag off, frame, boundary-lattice, vertex-lines figure, any rotated stamp) + the vacuous-empty-stamps case. `utils/perf` mocked via `vi.hoisted` to drive the flag in the node env (no localStorage). | done |
| 4 | `usePattern.ts` | S2/S5/S7 | Flag soup (10 boolean/string params) + a ~250-ln final memo branching fast-path / non-fast-path / Decoration inline; single-cell vs multi-cell split is an implicit `cells.length > 1`. | Collapse to an explicit dispatch / param object. **DEFERRED**: perf-fragile (load-bearing memo deps, documented eslint-disables, perf-memory warning), no Std-1 payoff, needs its own perf-verify session. | deferred |

### Chunk-4 result — green

`tsc` clean · **342/342 tests pass** (328 +14: 6 stampSegments, 8 periodicFastPathEligible) · build OK · bundle gzip 127.21 kB (= Chunk-2, no regression). Two pure helpers exported + pinned; **no production logic changed** (only `function` → `export function` on the two helpers). The behavior-preserving bar is trivially met — there is no behavior change to verify, only the new tests. **user-verified: n/a** (no observable change; metrics snapshot is the deliverable). Restructure deferred with rationale above. **MERGED to `main`** (`219d44f`).

### Chunk 5 — `state/reducer.ts` (877)

Audit conclusion: **under the 1k bar** (no Std-1 violation). The plan floated converting the mega-`switch` to a `Record<type, handler>` dispatcher (Std 2), but a discriminated-union `switch` is the idiomatic, type-safe reducer shape — a handler-map would *lose* per-case payload narrowing and add indirection, which is the "unnecessary abstraction/wrapper" the skill's Approval Bar warns against (lateral motion, not deletion). The repeated `if (!state.editor) return state` guard and the `applyWrap(seedFigures(updateActiveCell(...)))` composition vary meaningfully per case (which post-processors run differs), so extracting them trades legibility for little real dedup. **No restructure.** The genuine gap is Std-8: the figure/curve mutation helpers (`updateFigure` / `updateCurve` / `curveBase` / `curveField`) and the **edge↔vertex line mutual-exclusion invariant** were entirely untested — exactly the kind of invariant a refactor silently breaks. Existing suites cover only the decoration actions + figure-key pruning.

| Chunk | File | Sev | Finding | Remedy | Status |
| --- | --- | --- | --- | --- | --- |
| 5 | `reducer.ts` | S8 | Edge↔vertex line **mutual-exclusion invariant** (disabling either line source force-enables the other so a tile keeps ≥1 source) was untested; trivially broken by a refactor. | **DONE**: 3 tests pinning both directions + the "enable doesn't touch the other" case. | done |
| 5 | `reducer.ts` | S8 | Figure/curve mutation helpers untested: scalar field writes + unknown-tile fallback seeding, `SET_VERTEX_LINES_DECOUPLED` seeding (vertex fields from coupled values + deep-copied `vertexCurve`), curve defaults / `[1,3]` clamp / per-index merge, edge-vs-vertex curve target isolation, `RESET_FIGURES` (gallery default vs `DEFAULT_EDITOR_FIGURE`), immutability. | **DONE**: 22 tests in `figureMutations.test.ts`. | done |
| 5 | `reducer.ts` | S8 | Editor no-op guards + the multi-cell `SET_CELL_BOUNDARY_SIZE` lattice-scale invariant (all cell `boundarySize` follow `edgeLength`; centres scale by k) + triangle symmetry-mode coercion untested. | **DONE**: covered in the same file. | done |
| 5 | `reducer.ts` | S2 | ~30-case mega-switch. | Convert to handler-map. **REJECTED** (not deferred): idiomatic type-safe reducer; conversion loses payload narrowing + adds indirection for no deletion. Documented rationale above. | rejected |

### Chunk-5 result — green

`tsc` clean · **367/367 tests pass** (342 +25 in `figureMutations.test.ts`) · build OK · bundle gzip 127.21 kB (unchanged). **Zero production-code change** — pure characterization tests pinning invariants for a future refactor. **user-verified: n/a** (no observable change). **MERGED to `main`** (`7bf724f`).

### Chunk 3 — `components/Sidebar.tsx` (907)

Audit conclusion: **under the 1k bar**. The small sub-components (OctaStar, SectionTitle, Toggle, ExportBtn…) are already well-factored. The plan's "data-driven control registry" hypothesis is right-sized to a **`<Section>` wrapper component** — the section-wrapper chrome (border row + Lotus divider + collapsible `SectionTitle` + open-gate) was hand-repeated 8× — NOT a heterogeneous section-descriptor array (the bodies reference too much local state/handlers; a descriptor array would be the over-abstraction trap the skill warns against). Separately, the **frame units↔px clamp math** inlined in the component is the one genuinely behavior-bearing, testable piece (and its clamp edges had a documented past slider-freeze bug).

| Chunk | File | Sev | Finding | Remedy | Status |
| --- | --- | --- | --- | --- | --- |
| 3 | `Sidebar.tsx` | S2/S6 | Section-wrapper chrome (`<div border><LotusDivider/><SectionTitle open onToggle/>{open && body}</div>`) hand-duplicated across 8 control groups. | **DONE**: extracted a `<Section>` shell; 8 sections route through it (bodies stay inline children). 907→890 ln (−39 boilerplate net of the +22-ln component). One section (My Patterns) left raw **on purpose** — its trailing spacer renders OUTSIDE the open-gate, which `Section` can't express without changing behaviour; commented. | done |
| 3 | `Sidebar.tsx` / `editor/frame.ts` | S8 | Frame unit-sizing clamp (units↔px, with edge clamps that previously froze the slider) was inline + untested. | **DONE**: extracted pure `frameUnitModel` + `frameUnitsToPx` to `frame.ts`; +15 tests incl. a parametric **round-trip-stability** guard for the freeze bug (`max × repeat` survives the px clamp across 7 repeats). | done |
| 3 | `Sidebar.tsx` | S8 | Remainder is pure-presentational JSX (selects/sliders/toggles wired straight to `dispatch`) — no extractable logic left. | Manual-verify only (Wave-D checkpoint: toggle every control + collapse/expand each section). | open (awaiting user verify) |

### Chunk-3 result — green

`tsc` clean · **382/382 tests pass** (367 +15 frame-unit tests) · build OK · bundle JS 419.71→418.96 kB (gzip 127.23, ≈flat). Sidebar 907→890. One Std-2/6 dedup (`<Section>`) + one Std-8 extraction (tested frame-units helper). Behaviour-preserving: `<Section>` is verbatim chrome relocation (same DOM, same styles — the merged style objects are byte-equal per section); the frame-units math is a pure-arithmetic move pinned by the round-trip test. **user-verified: pending** (Wave-D checkpoint: open Gallery Sidebar, collapse/expand every section, toggle each control, drag the Frame size slider to its max + min — should not freeze). **MERGED to `main`** (`3dac419`).

### Chunk 6 — `tilings/tapratsTiling.ts` (796)

Audit conclusion: **under the 1k bar**; ~540 of its 796 ln are the embedded `TAPRATS_DATA` literal (13 tilings) and only ~250 ln are generator logic. Already has tests → this is a **Std-0/4/8 audit + adversarial coverage**, not a restructure. The generator is otherwise clean; two real findings (both behaviour-preserving) + the missing adversarial layer.

| Chunk | File | Sev | Finding | Remedy | Status |
| --- | --- | --- | --- | --- | --- |
| 6 | `tapratsTiling.ts` | S0 | `intersectsViewport` ran a per-vertex "inside the viewport?" early-return loop **then** an AABB-overlap test — but a contained vertex *forces* AABB overlap, so the loop is provably dead code (the AABB test is a strict superset). | **DONE**: deleted the loop; AABB test is now the sole, identical path. +test pinning that a tile straddling a tiny window with NO vertex inside is still included (the case the dead loop never added but AABB always did). | done |
| 6 | `tapratsTiling.ts` | S5/S8 | No guard on `edgeLen`: a non-positive/NaN value zeroes the lattice vectors ⇒ `maxI = ceil(diag/0) = Infinity` ⇒ the generation loop **hangs forever**. Reachable via a crafted/legacy `LOAD_CONFIG` (scale flows in as `edgeLen`; slider clamps but JSON load doesn't). | **DONE**: `if (!(edgeLen > 0)) return []` fail-closed guard. +3 adversarial tests (0 / negative / NaN → `[]`, which would time-out the suite pre-fix). | done |
| 6 | `tapratsTiling.ts` | S8 | Existing tests were happy-path only (per-tiling side counts + shared edges at one fixed viewport). No data-integrity, determinism, cap, degenerate-input, or `getTapratsTileTypes` coverage. | **DONE**: +22 tests — data-integrity sweep across **all 12 tilings** (`sides === vertices.length`, all coords finite — catches hand-entered `TAPRATS_DATA` typos), determinism, MAX_POLYGONS cap, zero-area viewport, + `getTapratsTileTypes` (unknown / dup-suffix `4.1`·`4.2` / explicit `6.x` overrides / distinct-id dedup). | done |
| 6 | `tapratsTiling.ts` | S6 | The 540-ln `TAPRATS_DATA` literal could move to its own `tapratsData.ts` (logic file → ~250 ln). | **DEFERRED**: pure relocation that doesn't reduce concepts a reader holds (Std-0 cautions against that); data is cohesive with the format interfaces + generator. No Std-1 pressure (under 1k). | deferred |
| 6 | `rosettePatch.ts` | S4 | `generateRosettePatch(def, …)` is a thin pass-through to `generateTapratsTiling(def.name, …)`. | **NOTED, not changed**: it keeps `usePattern` agnostic to the Taprats key convention + mirrors `generateTiling`'s signature; out of this chunk's file. | noted |

### Chunk 7 — `pic/index.ts` (667) + `pic/` package — the minefield

Audit conclusion: **under the 1k bar**; `runPIC`'s `emitStarArms`/`pairAtVertex` branch ladder is genuine, documented spaghetti (the comments cite specific tilings at specific θ — each branch is a hard-won bug fix). Per the plan + memories (`project_pic_irregular_polygon_bugs`, `feedback_pic_pair_selection`) this is **high-risk**, so the discipline was: **characterization-net FIRST, then only the one provably-safe structural change; defer the reframe.** Existing coverage was already strong on the regression history (`pipeline.test.ts` 17 tests across Cairo/floret/kisrhombille/nonagonal/deltoid θ bands + centroid-V + edge-routing); the gaps were a whole-output guard, adversarial/degenerate inputs, and `snapPoints.ts` (used by FigureControls, **zero tests**).

| Chunk | File | Sev | Finding | Remedy | Status |
| --- | --- | --- | --- | --- | --- |
| 7 | `pic/index.ts` | S0/S4 | `convex` was computed in `runPIC` and threaded into `pairAtVertex` + `pairVertexAtEdge` as `_convex`, **both of which ignore it** (doc comment confirms it's unused); `emitStarArms` recomputes its own `isConvexPolygon`. Dead computation + 2 dead params. | **DONE**: deleted the var + both params. 667→664. Provably behaviour-preserving — the **golden fingerprint (below) is byte-identical before/after**. | done |
| 7 | `pic/` | S8 | No whole-output guard on `runPIC`; degenerate/adversarial inputs + extreme θ untested. | **DONE**: `runPIC.characterization.test.ts` — a **golden fingerprint** (count + Σlen + per-kind counts) across a **12-case tiling/θ matrix** (square/hex/tri/4.8.8/vertex-lines/fixed-len/cairo/floret/kisrhombille/nonagonal/tetrakis/edge-routing) + adversarial (empty, no-figure, zero-area collinear polygon, θ=5°/85°, determinism, triangle-θ60 collinear dedup). 18 tests. This guards every future PIC refactor. | done |
| 7 | `snapPoints.ts` | S8 | `snapToNearest` (pure, threshold/snap arithmetic, used by FigureControls) untested. | **DONE**: `snapPoints.test.ts`, 6 tests (no-points identity, within/outside threshold, nearest-not-first, default-0.08 with <2 points, adaptive tighter threshold from min gap). | done |
| 7 | `pic/index.ts` | S0/S2 | The **branch ladder** (`pairAtVertex` 6-way priority + `emitStarArms`' asymmetric/outside/normal × centroid-V/edge-slide sub-branches) is the canonical code-judo prize — a candidate for a named-case **policy table**. | **DEFERRED** (high-conviction, but gated): (a) the memories say borderline cases still emit *wrongly* — a "preserve current behaviour" refactor would lock in known-imperfect output, so the reframe must be paired with the product decision on preserve-vs-fix; (b) it ties to the planned **bespoke-rosette-figures-via-Taprats** architectural fold (`project_star_tilings_gallery_idea`). Do NOT refactor blind. The golden fingerprint is now in place to make it safe when undertaken. | deferred |
| 7 | `pic/index.ts` | S6 | Triplicated pair-A/B probe skeleton (`pairAtVertex` / `pairVertexAtEdge` / `snapPoints::autoTForPolygon`); centroid-V emission copy-pasted twice in `emitStarArms`; the 9-field segment-push literal repeated ~8×. | **DEFERRED** with the reframe (same risk surface). A `pushSegment` helper + per-polygon ctx bundle is the mechanical first step; left for the dedicated PIC session so the minefield isn't churned twice. | deferred |
| 7 | `pic` (overlap bug) | bug | `project_overlap_tiles_strand_bug` (force-overlapped tiles emit overlap-region strands "as if a new tile"). | **AUDITED — not a `runPIC` defect**: PIC runs per-polygon and correctly emits each tile's self-contained figure; two overlapping polygons each emit theirs, so the overlap shows both. Resolving it needs a product decision (dedup/clip overlapping polygons *before* PIC, in the Builder layer) + a user repro patch. Memory stays OPEN. | open (needs repro + decision) |

### Chunk 8 — `editor/` placement family

Audit conclusion: all files **under the 1k bar**. The plan asked "is there a canonical 'place a regular n-gon on X' primitive hiding under three names?" — **the *placers* are legitimately distinct** (edge-coincident vs vertex-at-corner vs section-on-boundary — genuinely different anchoring), but the **validators** (`isPlacementViable` / `isVertexPlacementViable` / `isBoundarySectionPlacementViable`) each carried a **byte-identical body-overlap probe** (the source comments even say "mirrors isPlacementViable's second half"). That probe IS the hidden primitive. Plus `centroid` was reimplemented 5× across the tree.

| Chunk | File | Sev | Finding | Remedy | Status |
| --- | --- | --- | --- | --- | --- |
| 8 | `placement` / `vertexPlacement` / `boundaryInward` | S6 | The body-overlap probe (centre-containment ×2 + `overlapsExisting`) was copy-pasted into all three validators. | **DONE**: extracted `placedTileOverlaps(candidateVerts, candidateCenter, tiles)` to `tileOverlap.ts` (its natural home — already owns `overlapsExisting`); all three validators call it. Behaviour-preserving — the **viable-size fingerprints** (below) are identical. | done |
| 8 | `placement` / `vertexPlacement` / `boundaryInward` / `orbit` | S6 | `centroid` reimplemented as bespoke `avgCenter`/`centroidOf` in 4 in-scope files (canonical `centroid` already exists in `utils/math`). | **DONE**: deleted all 4; callers use canonical `centroid` (folded into `placedTileOverlaps` for the validators). | done |
| 8 | placement family | S8 | The three validators had no direct unit coverage (only exercised indirectly via reducer/orbit tests). | **DONE**: `placementViability.test.ts` — viable-size fingerprints for edge/section/vertex on the default square cell (guard the probe extraction) + sides<3 rejection + 3 direct `placedTileOverlaps` adversarial cases (strong overlap / disjoint / empty). 7 tests. | done |
| 8 | `reducer` / `completeN` | S6 | `centroidOf` ALSO reimplemented in `state/reducer.ts` (Chunk 5, merged) and the `tileInteriorAngleAt`/`interiorAngle` pure helper is duplicated `placement`↔`vertexPlacement`. | **DEFERRED to Chunk 13** (cross-cutting dup sweep) — out of this chunk's file set; low-risk pure-helper consolidation best done in one pass. | deferred |

### Chunk 9 — `decoration/voids.ts` (609) + `scopes.ts` + `strand/`

Audit conclusion: **the healthiest layer in the codebase** — best test density (11 decoration + 2 strand test files), all files under 1k, clean structure. The plan's Std-2 hypothesis (Reach-ladder special-case sprawl) **does not bite**: `scopes.ts`'s ladder is a tidy precedence model (`instance > patch > cell > sig > '*'`) with a clean `buildColourIndex`/`resolveColour`/`clearMaskingRecords` split, already tested. `voids.ts` is dense but its complexity is **essential** (Cyrus–Beck clip → planar arrangement w/ spatial-grid broad-phase → DCEL face walk → congruent signature), clearly sectioned and documented; no incidental spaghetti to delete. Coordinating with the layer's many open ⏳ browser-verifies (memory `project_decoration_stage_idea`), I did **not** refactor on top of unconfirmed behaviour. The one real gap was Std-8.

| Chunk | File | Sev | Finding | Remedy | Status |
| --- | --- | --- | --- | --- | --- |
| 9 | `voids.ts` | S8 | `minRotation` (Booth's-algorithm ring canonicaliser) + `hash8` underpin **every** persisted Void/strand signature but were untested. `minRotation`'s own comment warns it must reproduce the pre-Booth O(m²) joined-string ordering EXACTLY — a deviation silently re-canonicalises + re-hashes existing saves. | **DONE**: `voidSignatureCanonical.test.ts` — rotation/reversal invariance, hand-picked prefix-token cases, a **2000-trial differential fuzz against a reference O(m²) implementation** (pins the exact-ordering invariant), + `hash8` determinism/format. 8 tests. | done |
| 9 | `decoration/` `strand/` | — | Reach ladder (`scopes.ts`) + Void extraction (`voids.ts`) + weave (`weave.ts`/`wovenPathD.ts`). | **NO ACTION**: structurally healthy + well-tested; refactoring on top of the open browser-verifies would be premature (memory note). Audited clean. | done |
| 9 | `strand/computeCurves.ts` | S8 | `computeCurves` (206 ln) is only exercised by the perf probe, not a behavioural regression. | **NOTED**: candidate for a focused render-output test in Chunk 10 (`rendering/`) where the curve→path pipeline is reviewed end-to-end. | deferred |

### Chunk 10 — `rendering/` (1080 ln, was 0 tests beyond screenSpace)

Audit conclusion: the layer is React/SVG **components** in a `node` test env (no DOM) — full component snapshots would need a jsdom infra change, out of scope. So the plan's "write render-output tests" becomes the codebase's stated mitigation for thin UI coverage: **extract the pure, behaviour-bearing logic embedded in the components into tested helpers.** `PatternSVG` (384) is pure wiring/composition (no extractable logic); the logic lived in `StrandLayer` + the paint overlay.

| Chunk | File | Sev | Finding | Remedy | Status |
| --- | --- | --- | --- | --- | --- |
| 10 | `VoidFillLayer` + `DecorationPaintLayer` | S6 | `polygonPath` (polygon→`M…L…Z`) was byte-identical in both. | **DONE**: extracted to `rendering/svgGeometry.ts`; both import it. | done |
| 10 | `DecorationPaintLayer` | S8 | The strand Paint hit-test (`pointSegmentDist` + the nearest-within-tolerance `strandIndexAt`) was inline + untested — it's the interaction the perf fix introduced (miss ⇒ click falls through to pan). | **DONE**: extracted `pointSegmentDist` + `nearestSegmentIndex` to `svgGeometry.ts`; component calls them. +10 tests (on/perp/past-endpoint/zero-length dist; nearest/miss/empty/tie). | done |
| 10 | `StrandLayer` | S8 | The `lineStyle`→stroke-attribute derivation (dash arrays, butt-vs-round cap, mask flag, cut/centre widths) was inline + untested. | **DONE**: extracted `strandStyleAttrs(lineStyle, w)` to `rendering/strandStyle.ts`. +5 tests (solid/double/triple/dashed/dotted). | done |
| 10 | `strand/computeCurves` | S8 | Still only perf-probe-tested (carried from Chunk 9). | **DEFERRED**: best as an end-to-end curve→path-output test alongside the `curvedPathD`/`wovenPathD` render path — its own focused pass; the inputs are heavy to construct by hand. | deferred |

### Chunk 11 — remaining `components/` (the test-free pure-UI tail, ~2300 ln)

Scope = everything in `components/` not already covered by Tier 1 (TessellationLabMode/Canvas/Sidebar + the `lab/` split) or Chunk 2 (EditorPickerOverlay/EditorVertexLayer/OverlapConfirmModal): `ColourPicker` 439, `strands/FigureControls` 497, `ConfigLibraryPanel` 247, `RotationDial` 204, `TextPromptModal` 176, `PerfHud` 194, and the small editor SVG layers (`EditorEdgeLayer`/`EditorVertexPlacementLayer`/`EditorBoundaryInwardLayer`/`SandstoneEdge`). Audit conclusion: same as Chunk 10 — these are React/SVG in a `node` (no-DOM) test env, so the deliverable is **extract the behaviour-bearing logic into tested helpers**; the genuinely pure-presentational remainder is manual-verify. Only two files carried real embedded logic worth a helper module; the rest already delegate their logic to layers tested in earlier chunks.

| Chunk | File | Sev | Finding | Remedy | Status |
| --- | --- | --- | --- | --- | --- |
| 11 | `ColourPicker.tsx` | S8 | Hex validation (`isHexColour`), eye-dropper alpha-strip normalisation, the module-level recent-colours store (newest-first / dedup / cap-10 / lower-case / invalid-reject + the localStorage round-trip + subscriber notify), the theme load/validate/save persistence, and the four theme array transforms (create/add/remove/delete) were all inline + untested — and they back persisted user data. | **DONE**: extracted to `colourPicker.logic.ts` (no JSX). `ColourPicker.tsx` re-exports `pushRecentColour` + `ColourTheme` so import sites (TessellationLabMode, lab/DecorationPanel) stay stable; theme handlers + eye-dropper now call the pure transforms. +20 tests (`colourPicker.logic.test.ts`, in-memory localStorage mock): validation edge cases, eye-dropper 9→7 strip, store dedup/cap/notify/identity-on-noop, malformed-theme filtering, transform purity + untouched-sibling identity. 439→351. | done |
| 11 | `RotationDial.tsx` | S8 | The dial's angle maths — `normDeg`, `pointerAngle`, the ±180 seam-crossing drag delta, and the wheel step-size ladder (0.5°/15°/1°) — was inline + untested; the seam wrap is the easy thing to get subtly wrong. | **DONE**: extracted to `rotationDial.logic.ts` (`normDeg`/`pointerAngle`/`applyDragDelta`/`wheelStep`); component is now pointer/SVG wiring. +17 tests (`rotationDial.logic.test.ts`): range wrap incl. negatives, cardinal pointer angles, short-way seam crossing both directions + exact-180, wheel modifier precedence + seam wrap. 204→189. | done |
| 11 | `strands/FigureControls.tsx` (497) | — | Largest of the tail, but its real logic (`computeSnapPoints` / `snapToNearest`) already lives in `pic/snapPoints.ts`, **tested in Chunk 7**. The only inline maths is `toTrackPct` (a one-line slider-track linear remap). | **NO ACTION**: not worth a module — pure presentational over already-tested helpers. Manual-verify (Figure/Curve controls in Gallery Sidebar + Lab Composition). | done |
| 11 | `ConfigLibraryPanel.tsx` (247) | — | Thin wrapper over `state/configLibrary` (save/rename/duplicate/delete validation lives there → Chunk 12). Only inline derivation is `suggestedName`. | **NO ACTION**: library logic is Chunk 12's surface; panel is wiring. Manual-verify (Save/Rename/Duplicate/Delete in both libraries). | done |
| 11 | `TextPromptModal`, `PerfHud`, editor SVG layers | — | Pure presentational: modal input echo, the dev-only perf HUD readout, and SVG overlays driven by `editor/` geometry (tested in Chunk 8). | **NO ACTION**: manual-verify only. | done |

### Chunk 12 — `export/` (128) + `types/` (610) + `theme/` (43) + `state/configValidation` (197) + `configLibrary` (166)

Scope = the save/load/validate surface the Chunk-11 panels delegated to, plus the type-declaration headers and the tiny theme context. Audit conclusion: this layer is **healthy and exemplary** — `types/editor.ts` annotates every field with its decision/ADR reference and marks legacy shapes `@deprecated`; `configValidation`/`configLibrary` are tidy, well-documented, and fail-closed. As the plan predicted (the recurring theme), the honest deliverable is the **missing test safety net** on the behaviour-bearing validate/CRUD logic, plus one genuine Std-6 dedup in `export/`.

| Chunk | File | Sev | Finding | Remedy | Status |
| --- | --- | --- | --- | --- | --- |
| 12 | `export/exportJSON.ts` + `export/exportSVG.ts` | S6 | `downloadBlob` (8-line Blob→`<a download>`→revoke helper) was **byte-identical-duplicated** in both files. | **DONE**: extracted to `export/download.ts`; both import it. Verbatim — no behaviour change. | done |
| 12 | `export/exportSVG.ts` | S8 | `exportUnwovenSVG` mixed pure markup generation (stroke-width = 0.1% of viewBox diagonal + per-Strand `<path d>` build) with the DOM download — untested, and the stroke-width formula + viewBox-fallback are easy to break. | **DONE**: extracted pure `unwovenSvgMarkup(segments, viewBox, w, h): string`; `exportUnwovenSVG` is now `downloadBlob(blob(markup(...)))`. +4 tests (`exportSVG.test.ts`): wrapper/dims, one `<path>` per chained strand, the 0.1%-diagonal stroke width, the width/height fallback when the viewBox has no numbers. | done |
| 12 | `state/configValidation.ts` (197) | S8 | The load-time validator (`loadPatternConfig` + `readStrandStyle`/`readGalleryFrame`/`coerceLegacyFigures`) gates every file/localStorage import but had **no test** — the required-field gate, retired-tiling reject, legacy `lacing`→`strand` + rosette→star migrations, Frame clamp/degrade, and editor-payload rule were all unpinned. | **DONE**: +18 characterization tests (`configValidation.test.ts`) covering each path incl. the degrade-not-throw Frame behaviour and the editor-required-when-editor-tiling rule. Zero production change. | done |
| 12 | `state/configLibrary.ts` (166) | S8 | The localStorage-backed CRUD library (used by both Gallery + Lab) was untested: save/list round-trip, deep-clone isolation, version gate, corrupt-entry skip, quota error path, source-category inference. | **DONE**: +16 characterization tests (`configLibrary.test.ts`, in-memory localStorage stand-in). Zero production change. | done |
| 12 | `types/editor.ts` (404) | S5 | `FrameConfig` carries a `type: FrameType` discriminator but is a **flat all-optional interface** (shape/size/aspect for `'shape'`, `rings` for `'n-ring'`) rather than a discriminated union — illegal combinations are representable in the type. | **DEFERRED (rationale)**: a DU would ripple through every `FrameConfig` consumer (editor/frame, Gallery frame, Canvas, migrations) for low real-bug payoff — the load boundary (`readGalleryFrame`/`migrateFrame`) already enforces the shape, and runtime construction is internal + controlled. Not worth the wide behaviour-neutral churn the thermo-nuclear bar discourages. | deferred |
| 12 | `types/*`, `theme/ThemeContext.tsx` | — | The rest of the surface is pure declarations (`pattern`/`geometry`/`tiling`, exemplary docs) + a tiny localStorage-guarded React theme context. No logic to extract. | **NO ACTION**: declarations need no tests; the theme context is trivial pure-UI (manual-verify: dark/light toggle persists). | done |

### Chunk-12 result — green

`tsc` clean · **539/539 tests pass** (496 +43: 18 configValidation + 16 configLibrary + 4 exportSVG, and the 5 owed Builder vertex-strand regressions banked earlier this wave) · build OK · bundle JS 419.83 kB (gzip 127.56, ≈flat). One Std-6 dedup (`download.ts` — two byte-identical `downloadBlob` collapsed to one) + one Std-8 extraction (pure `unwovenSvgMarkup`); the rest is **pure test safety net over the save/load/validate surface, zero production-logic change**. Behaviour-preserving — the export changes are verbatim relocations pinned by the new tests; the validator/library tests are characterization (they assert *current* behaviour). The one structural finding (`FrameConfig` discriminated union) is deferred with rationale. **user-verified: pending** — low-risk: the only observable surface is Save/Load JSON + the SVG/PNG export buttons, all behaviour-identical (fold into a Wave-F manual pass: Save a pattern → reload it; Export SVG/PNG; load a legacy `lacing`/`rosette` save).

### Chunk-11 result — green

`tsc` clean · **496/496 tests pass** (459 +37: 20 colourPicker.logic + 17 rotationDial.logic) · build OK · bundle JS 418.61 kB (gzip 127.20, ≈flat). `ColourPicker.tsx` 439→351, `RotationDial.tsx` 204→189; logic now in two small pure modules (`colourPicker.logic.ts` 156, `rotationDial.logic.ts` 46). Behaviour-preserving — verbatim extractions, pinned by the new tests (incl. reference-identity assertions on the store no-op and the theme transforms) + confirmed by `tsc` + the unchanged build. The `pushRecentColour`/`ColourTheme` re-exports keep all import sites byte-identical. **user-verified: pending** — but low-risk: the user-visible surfaces (paint colour validation, theme save/recents, the rotation dial) are exactly the logic now pinned by tests. Wave-F manual-verify can fold in with the Chunk-3/Chunk-10 owed checks.

### Chunk-10 result — green

`tsc` clean · **459/459 tests pass** (444 +15) · build OK · bundle gzip 127.07→127.09 (≈flat). Components shrank (StrandLayer 286→282, DecorationPaintLayer 241→220, VoidFillLayer 25→20) with logic moved into 2 small tested modules (`svgGeometry.ts` 46, `strandStyle.ts` 33). Behaviour-preserving — pure extractions; the helpers reproduce the inline code verbatim, pinned by the new tests + confirmed by `tsc` + the unchanged build. **user-verified: pending** (Wave-F checkpoint: Decoration strand painting still hit-tests correctly; double/triple/dashed/dotted strand styles still render — both exercise the extracted helpers).

### Chunk-9 result — green

`tsc` clean · **444/444 tests pass** (436 +8) · build OK · bundle unchanged. **Zero production-code change** — the decoration layer is genuinely healthy; the deliverable is pinning its single most identity-critical untested primitive (`minRotation`) with a differential fuzz so a future "optimise the canonicaliser" change can't silently re-hash every saved pattern. **user-verified: n/a** (no observable change).

### Chunk-8 result — green

`tsc` clean · **436/436 tests pass** (429 +7; all existing editor/orbit/reducer tests still green — they exercise the refactored validators) · build OK · bundle JS 418.87→**418.31 kB** (gzip 127.23→127.07, the dedup). Sizes: placement 144→126, vertexPlacement 487→474, boundaryInward 251→240, orbit 342→336, tileOverlap 129→160 (gained the shared helper) — net family logic down, one canonical probe. Behaviour-preserving: the placer geometry is untouched; only the triplicated validation probe + the centroid copies were consolidated, pinned by the fingerprints. **user-verified: n/a** (internal dedup, no observable change).

### Chunk-7 result — green

`tsc` clean · **429/429 tests pass** (405 +24: 18 characterization/golden + 6 snapPoints; all 17 existing pipeline regressions still green) · build OK · bundle gzip 127.23 (flat). `pic/index.ts` 667→664. **The only production change is the dead-`convex` removal, proven byte-identical by the golden fingerprint** (captured on `main`@`609e1c2`, unchanged after the deletion). The branch-ladder reframe + the Std-6 dedup are **deferred with rationale** — the minefield gets refactored once, deliberately, behind the net now in place. **user-verified: n/a** (no observable change). The Wave-E headline ("latent PIC edge-case bugs fixed") is explicitly NOT claimed here — it belongs to the deferred reframe session.

### Chunk-6 result — green

`tsc` clean · **405/405 tests pass** (382 +23: deleted-loop straddle test + 3 edgeLen guards + 12 data-integrity + 2 determinism/cap + 4 `getTapratsTileTypes` + a degenerate-viewport case) · build OK · bundle JS 418.96→418.89 kB. File 796→800 (the dead-loop deletion is offset by the explanatory comment + the hang-guard comment — **documentation + safety, not complexity**; still far under 1k). Behaviour-preserving: the deletion is provably equivalent; the guard only changes a previously-hanging input. **user-verified: n/a** (the two changes are an internal dead-code removal + a fail-closed guard on an input that used to hang — no observable change on any real input).
