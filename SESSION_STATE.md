# SESSION_STATE.md

## ▶ RESUME HERE

**Current branch:** `feat/art-deco-egypt-theme-revamp` (last commit `edc02cd`).

**Last action:** 2026-05-03 — scrapped the mandala + composition features
and the entire preset catalogue. Reusable code archived under
`archive/tessellation-lab/` (see its README). Lab UI shell preserved.

**Next action:** Plan **Step 17 — user-editable tessellation editor**.
This is now the project's primary focus. Open the planning brief at
`TESSELLATION_REVAMP_PLAN.md` → "Step 17 planning brief" and grill the
user on the design questions listed there before writing any code.

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
- [next] **Step 17** — user-editable tessellation editor (drag-and-drop polygon placement)
- [parked] Steps 15, 16, 18 — k-uniform generator, quasi-periodic, Girih substitution

## Live architecture (post-cleanup)

- `TilingCategory` = `'archimedean' | 'rosette-patch'`. No mandala, no composition.
- `PatternConfig` carries only `tiling`, `figures`, `lacing`, optional `edgeAngles`, optional `smoothTransitions`. No `mandala?`, no `composition?`.
- Reducer actions are PIC + figure controls only (no `SET_MANDALA_*` / `SET_COMPOSITION_*`).
- `usePattern` runs `generateTiling` (archimedean) or `generateRosettePatch`, then `runPIC`.
- `PatternSVG` has no clipPath plumbing — single tile + strand layer.
- `App.tsx` has no `activePresetId` state.
- `TessellationLabMode` chrome: header, "Editor" placeholder section, Tessellation picker, "My Tessellations" library (Save / Rename / Duplicate / Delete + saved-entries dropdown), Strands panel (when strands on), Display section.
- Migrations: `loadLabState` resets retired tiling types to `''` and strips dropped payloads; `listSavedTessellations` skips retired-type entries with `console.warn`.

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
None. Ready to plan Step 17.
