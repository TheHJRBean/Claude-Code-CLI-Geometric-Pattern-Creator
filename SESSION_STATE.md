# SESSION_STATE.md

## Goal
Improve tiling options and add UI customisability. Full plan lives in **`TILING_REVAMP_PLAN.md`** — keep this file as the rolling status anchor only.

## Plan
See `TILING_REVAMP_PLAN.md` for the full step-by-step plan. Per-step progress
trackers (e.g. `STEP1_PROGRESS.md`) hold finer-grained sub-task state and
recovery notes. Status snapshot:

- [done] Phase 0 — grill-me interview (Q1–Q6 resolved; all locked decisions captured)
- [done] Phase 0 — write `TILING_REVAMP_PLAN.md`
- [done] Step 1 — Tiling Lab scaffold (Lab/collapse button overlap fixed in Step 2)
- [done] Step 2 — Port existing tilings into Lab (dropdown wired to SYMMETRY_GROUPS / TILINGS, scale slider, reset, info panel)
- [todo] Step 3 — Hexadecagonal-rosette (16-fold)
- [todo] Steps 4–11 — see plan
- [todo] Steps 12–16 (opt)

## Done
- Read `RESEARCH-TILING-CONFIGURATIONS.md`, `src/tilings/index.ts`, `src/types/pattern.ts`, scanned `src/components/Sidebar.tsx`
- Grill-me interview: 6 architectural decisions locked
- 5 alternative options saved as `/idea` memory entries (mandala cheap path, two mandala layer rules, free arrangement, forgiving overlap)
- Wrote `TILING_REVAMP_PLAN.md` — concrete simplest→most-complex action plan with visible-feature acceptance per step
- **Step 1 implementation:** added `mode: 'main' | 'lab'` to `App.tsx`, created `src/components/TilingLabMode.tsx`, added Lab-toggle button to Main sidebar. Build + type-check green. Independent `PatternConfig` per mode so toggling preserves Main state. See `STEP1_PROGRESS.md`.
- **Step 2 implementation:** wired the Lab's Tiling dropdown to `SYMMETRY_GROUPS` / `TILINGS`. Selecting a tiling dispatches `SET_TILING_TYPE`, which loads that tiling's `defaultConfig.figures` via the existing reducer; the standard PIC pipeline renders it through `Canvas`. Added Scale slider, "Reset to default angle" button (re-dispatches `SET_TILING_TYPE`), and an Info panel showing vertex config / fold / category. Lab still keeps overlays off (no tile grid, no curve handles, no lacing). Type-check green.
- **Button overlap fix:** Main-mode Lab button moved from `left:12` to `left:50` so it no longer collides with `.sidebar-collapse-desktop`. Lab-mode "← Main" button stays at `left:12` (no collapse button there).

## Next
- Visual sign-off in browser: open Lab, pick a tiling from the dropdown, confirm it renders identically to the same tiling in Main. Confirm Main pattern is preserved when switching modes.
- Then move on to **Step 3 — Add hexadecagonal-rosette (16-fold)** from `TILING_REVAMP_PLAN.md`.

## Decisions
All architectural decisions captured in the "Locked architectural decisions" section of `TILING_REVAMP_PLAN.md`. Recap (one-liner each):
1. All six original ambitions in scope, presets first, editor last.
2. Mandala = layered composition.
3. Mandala layer rule = strict divisor chain.
4. Mix-and-combine = region-stitching, simplest-case-only in v1.
5. Boundary = (b) strand match primary, (a) hard frame as fallback toggle.
6. Pair handling = hybrid filter: legal pairs by default, "show all" unlocks with auto-fallback.
7. Lives in a new "Tiling Lab" mode with stripped-down chrome.

## Blockers
None.
