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
| 1 | `TessellationLabMode.tsx` | S3/S4 | "Cinzel uppercase pill button" inline-style object copy-pasted ~10× with minor variants (phase btn, tool btn, undo/redo, clear, frame btns). | Extract shared `segmentedButtonStyle(active)` / pill-button style helpers in `labShared`. | open |
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
