# Step 1 — Tiling Lab scaffold (Progress)

**Source plan:** `TILING_REVAMP_PLAN.md` § Step 1
**Branch:** `feat/art-deco-egypt-theme-revamp`
**Started:** 2026-04-25
**Status:** ✅ DONE — pending visual confirmation in the browser.

This file is the recovery anchor for Step 1 specifically. Update after each
sub-task is finished or paused. If picked up in a new session, read this first,
then `git status` / `git log --oneline -10`.

## Visible result acceptance
A new "Lab" button appears in the sidebar header (top-left). Clicking it swaps
the main canvas + sidebar for a stripped-down lab view: blank canvas, single
"Tiling" dropdown (placeholder option only — empty for now), nothing else. A
"← Main" button on the lab sidebar returns to Main mode. Switching back and
forth preserves the Main mode's current pattern (Main `useReducer` instance
stays mounted in `App.tsx` even while Lab is rendered).

## Sub-tasks
- [x] **1a** — Add `mode: 'main' | 'lab'` state to `src/App.tsx`, persist to localStorage key `app-mode`.
- [x] **1b** — Create `src/components/TilingLabMode.tsx` (own Canvas + minimal sidebar with empty Tiling dropdown).
- [x] **1c** — Lab mode reuses `Canvas` with overlay flags off (`showTileLayer=false`, empty `cpVisible`/`cpActive`, `lacing.enabled=false` in lab default config). Empty `tiling.type` causes `usePattern` to return empty arrays → blank canvas.
- [x] **1d** — Mode toggle button in the existing sidebar header (top-left, absolutely positioned). Same toggle exposed on the Lab sidebar header.
- [x] **1e** — Independent `PatternConfig` instance for Lab via its own `useReducer` (toggling cannot corrupt Main state).
- [x] **1f** — `npm run build` green. Type-check clean.
- [ ] **1g** — Manual test: switch Main → Lab → Main, confirm Main pattern is preserved. (User to verify in browser.)

## Notes / decisions made during Step 1
- Mode lives only in `App.tsx` local state (no URL routing, no context). Hits the safe-default in `TILING_REVAMP_PLAN.md`.
- `App.tsx` keeps Main's reducer mounted across mode changes — Main state survives. Lab renders early via an `if (mode === 'lab') return <TilingLabMode/>` after all Main-mode hooks have run, to satisfy the rules of hooks.
- Lab uses its own `useReducer(reducer, LAB_DEFAULT_CONFIG)`. Lab default config has `tiling.type=''`, no figures, lacing disabled — produces a blank canvas in v1.
- Lab canvas reuses `<Canvas>` directly. Overlay-stripping is achieved by passing input flags only — no changes required to `Canvas` / `PatternSVG`.
- Mode toggle button styling: small Cinzel pill, top-left of sidebar header. Says "Lab" in Main, "← Main" in Lab. Uses `--accent` colour with subtle bg fill when active.
- Did NOT port mobile-drawer / desktop-collapse behaviour into Lab v1. Lab is desktop-only sidebar for now. Can be added later if needed.

## Files touched
- `src/App.tsx` — added mode state, toggle, conditional Lab render.
- `src/components/TilingLabMode.tsx` — NEW.
- `src/components/Sidebar.tsx` — added `mode` / `onToggleMode` props + header button.
- `STEP1_PROGRESS.md` — this file (NEW).

## Next on resume
Step 1 implementation complete. Either:
1. User opens the dev server, eyeballs the Lab view, signs off → mark **1g** done → move to **Step 2 — Port existing tilings into Lab**.
2. If Main pattern *is* lost on toggle, the bug is almost certainly that the early `return <TilingLabMode/>` accidentally unmounts the Main reducer. Re-check `App.tsx` lines 41-58.
