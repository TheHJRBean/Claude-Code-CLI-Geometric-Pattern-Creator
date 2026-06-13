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

`tsc` clean · **342/342 tests pass** (328 +14: 6 stampSegments, 8 periodicFastPathEligible) · build OK · bundle gzip 127.21 kB (= Chunk-2, no regression). Two pure helpers exported + pinned; **no production logic changed** (only `function` → `export function` on the two helpers). The behavior-preserving bar is trivially met — there is no behavior change to verify, only the new tests. **user-verified: n/a** (no observable change; metrics snapshot is the deliverable). Restructure deferred with rationale above.
