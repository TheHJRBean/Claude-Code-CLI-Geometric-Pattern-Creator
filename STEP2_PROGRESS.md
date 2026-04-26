# Step 2 — Port existing tilings into Lab (Progress)

**Source plan:** `TILING_REVAMP_PLAN.md` § Step 2
**Branch:** `feat/art-deco-egypt-theme-revamp`
**Started:** 2026-04-26
**Status:** ✅ DONE — pending visual confirmation in the browser.

## Visible result acceptance
The Lab's "Tiling" dropdown lists every existing tiling, grouped by
fold-symmetry (same grouping as Main). Selecting a tiling renders it on the
lab canvas with default contact angles. A **Scale** slider, a **Reset to
default angle** button, and a small **Info** panel (vertex config / fold /
category) appear once a tiling is chosen. Overlays remain off — no tile grid,
no curve handles, no lacing.

## Sub-tasks
- [x] **2a** — Wire Lab dropdown to `SYMMETRY_GROUPS` / `TILINGS`.
- [x] **2b** — On selection, dispatch `SET_TILING_TYPE` so the existing
  reducer loads the tiling's `defaultConfig.figures`. No new code path needed.
- [x] **2c** — Lab `Canvas` invocation already passes `showTileLayer={false}`
  and empty `cpVisible` / `cpActive` — overlays stay off automatically.
- [x] **2d** — Add Scale slider (`SET_SCALE`).
- [x] **2e** — Add "Reset to default angle" button (re-dispatches
  `SET_TILING_TYPE` to reload defaults).
- [x] **2f** — Add Info panel (vertex config / fold / category).
- [x] **2g** — Type-check clean.
- [ ] **2h** — Manual test: every tiling in the dropdown renders identically
  in Lab vs Main when both use defaults. (User to verify in browser.)

## Side fix shipped with Step 2
- **Lab/collapse button overlap (Main mode):** Moved the Lab toggle from
  `left:12` to `left:50` in `Sidebar.tsx`, sitting just to the right of
  `.sidebar-collapse-desktop` (which is `left:12`, `width:30`). The Lab-mode
  "← Main" button stays at `left:12` because Lab has no collapse button.

## Files touched
- `src/components/TilingLabMode.tsx` — dropdown wired up, scale slider,
  reset button, info panel.
- `src/components/Sidebar.tsx` — Lab button repositioned to left:50.

## Next on resume
1. User visually confirms Lab renders existing tilings correctly → mark
   **2h** done → move to **Step 3 — Hexadecagonal-rosette (16-fold)**.
2. Step 3 plan: add a `'hexadecagonal-rosette'` entry to `tilings/index.ts`
   with vertex config `[16, 4]` (verify against research §2.5), default
   contact angle 78.75°, three tile types (16-gon centre, thin rhombus
   ring, square fillers). Add to `SYMMETRY_GROUPS` as fold-16. Append
   discoveries to `RESEARCH-TILING-CONFIGURATIONS.md`.
