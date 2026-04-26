# SESSION_STATE.md

## Goal
Improve tessellation options and add UI customisability. Full plan lives in
**`TESSELLATION_REVAMP_PLAN.md`** — keep this file as the rolling status anchor only.

## Terminology (locked 2026-04-26)
- **Tessellation** — underlying polygon tiling (squares, hexagons, rhombi, etc.).
- **Strand** — a line in the decorative PIC pattern overlaid on a tessellation.

UI strings now use these. Internal code still refers to "tiling" / "lineLength"
in some identifiers; those are deferred refactors and not user-visible.

## Plan
See `TESSELLATION_REVAMP_PLAN.md` for the full step-by-step plan. Per-step
progress trackers (e.g. `STEP2_PROGRESS.md`) hold finer-grained sub-task state.
Status snapshot:

- [done] Phase 0 — grill-me interview, locked architectural decisions
- [done] Phase 0 — first draft of plan (under wrong terminology)
- [done] Step 1 — Tessellation Lab scaffold
- [done] Step 2 — Port existing tessellations into Lab (dropdown, scale, reset, info, "Show strands" toggle)
- [done] Re-scope — terminology corrected, plan rewritten end-to-end as `TESSELLATION_REVAMP_PLAN.md`, UI strings updated, Lab now defaults to tessellation-first rendering
- [todo] Step 3 — Hexadecagonal-rosette tessellation (16-fold)
- [todo] Step 4 — Tessellation preset catalogue
- [todo] Steps 5–11 — see plan
- [todo] Steps 12–16 (opt)

## Done
- Grill-me interview: architectural decisions locked
- 5 alternative options saved as `/idea` memory entries
- Wrote `TILING_REVAMP_PLAN.md` (since renamed)
- **Step 1 implementation:** mode toggle in `App.tsx`, `TessellationLabMode.tsx`
  (renamed from `TilingLabMode`), Lab button in Main sidebar header. Independent
  `PatternConfig` per mode.
- **Step 2 implementation:** Lab "Tessellation" dropdown wired to
  `SYMMETRY_GROUPS` / `TILINGS`; scale slider; "Reset to default angle"; info
  panel (vertex config / fold / category); "Show strands" toggle.
- **Button overlap fix:** Main-mode Lab button at `left:50` so it no longer
  collides with `.sidebar-collapse-desktop` (`left:12`, w:30).
- **Terminology pass:** UI strings renamed throughout (Tiling→Tessellation,
  lines→strands). Lab defaults to tessellation-on, strands-off. Plan file
  renamed `TILING_REVAMP_PLAN.md` → `TESSELLATION_REVAMP_PLAN.md` and
  rewritten end-to-end.

## Next
- Visual sign-off in browser: open Lab, pick a tessellation, confirm
  polygons render with strands off; toggle "Show strands" to confirm
  PIC overlay still works.
- Then move on to **Step 3 — Hexadecagonal-rosette tessellation (16-fold)**
  from `TESSELLATION_REVAMP_PLAN.md`.

## Decisions
All architectural decisions captured in the "Locked architectural decisions"
section of `TESSELLATION_REVAMP_PLAN.md`. Recap (one-liner each):
1. All six original ambitions in scope, presets first, editor last.
2. Mandala = layered tessellation composition.
3. Mandala layer rule = strict divisor chain.
4. Mix-and-combine = region-stitching, simplest-case-only in v1.
5. Boundary = (b) strand match primary, (a) hard frame as fallback toggle.
6. Pair handling = hybrid filter: legal pairs by default, "show all" unlocks with auto-fallback.
7. Lab is a separate mode with stripped-down chrome.
8. Tessellation-first rendering in Lab; strands are an optional overlay.

## Blockers
None.
