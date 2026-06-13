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

### Chunk-1 result (extraction increment) — green

`tsc` clean · **315/315 tests pass** · build OK · bundle 420.71 kB (gzip 127.72, was 127.73). Pure verbatim JSX relocation, no logic change. **user-verified: no** (pending Wave-B checkpoint).
