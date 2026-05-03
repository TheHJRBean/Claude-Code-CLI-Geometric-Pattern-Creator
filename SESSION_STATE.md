# SESSION_STATE.md

## ▶ RESUME HERE

**Current branch:** `feat/art-deco-egypt-theme-revamp`.

**Last action:** 2026-05-03 — sub-step **17.1** shipped (`e199aee`):
`EditorConfig` data model + read-only render. New types
(`src/types/editor.ts`), helpers (`src/editor/regularPolygon.ts`,
`buildEditorPolygons.ts`, `sampleConfig.ts`), `editor?: EditorConfig`
on `PatternConfig`, `usePattern` editor branch, and a Show sample
patch / Clear pair in the Lab Editor section that loads a hand-built
fixture (square + 4 triangles flush to each edge). Visual sign-off
received. Follow-up `94f651c` removed the standard tessellation Type
dropdown / Scale / Reset / Info panel from Lab — Lab is now editor-
only; standard tessellations live in Main.

**Next action:** Begin sub-step **17.2 — Boundary picker + size slider
+ origin picker (Design-mode shell)**. Boundary shape dropdown
(triangle / square / hexagon), size slider (rescales lattice cell
only — Q9 Option B), origin polygon picker; auto-place origin at
boundary centre per Decision 6. Acceptance: user can pick boundary +
origin and see them rendered.

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
- [in progress] **Step 17** — user-editable tessellation editor. 17.0 + 17.1 done; **17.2 next**.
- [parked] Steps 15, 16, 18 — k-uniform generator, quasi-periodic, Girih substitution

## Live architecture (post-cleanup, post-17.1)

- `TilingCategory` = `'archimedean' | 'rosette-patch'` (live tree). The
  editor patch is signalled by `tiling.type === 'editor'` plus
  `config.editor` payload — it has no `TilingDefinition` entry because
  it doesn't fit the static-tiling schema.
- `PatternConfig` carries `tiling`, `figures`, `lacing`, optional
  `edgeAngles`, optional `smoothTransitions`, and **optional `editor?:
  EditorConfig`** (Q13 Option C). `EditorConfig` has its own inner
  `version: 1`.
- `EditorConfig` shape: `{ version, boundaryShape, boundarySize,
  originSides, edgeLength, tiles: EditorTile[] }`. `EditorTile` is a
  tagged union of `EditorRegularTile` and `EditorIrregularTile` with
  an `origin: 'origin' | 'placed' | 'completed'` discriminator (single
  array per Decision 12).
- `SavedSourceCategory` = `'archimedean' | 'rosette-patch' | 'editor'`.
- Reducer actions are PIC + figure controls only (no editor-specific
  actions yet — 17.2+ will add them).
- `usePattern` dispatches: editor branch first (`tiling.type === 'editor'
  && config.editor` → `editorTilesToPolygons` + `runPIC`), then the
  existing archimedean / rosette-patch branches. Editor patches bypass
  viewport quantisation since they're finite.
- `tileTypeIdFor()` keys regular tiles as `"<n>"`. Irregular tiles get a
  provisional `"<n>i:provisional"` placeholder until 17.5 lifts the
  canonical-signature hash from `archive/tessellation-lab/`.
- `PatternSVG` has no clipPath plumbing — single tile + strand layer.
- `App.tsx` has no `activePresetId` state.
- `TessellationLabMode` chrome (post-17.1, post-dropdown-removal):
  header, **Editor section** (Show sample patch / Clear buttons),
  "My Tessellations" library (Save / Rename / Duplicate / Delete +
  saved-entries dropdown), Strands panel (currently inert in editor
  mode — wired at 17.6 per Q15), Display section. The standard
  tessellation Type dropdown / Scale / Reset / Info panel were removed
  in `94f651c` — Lab is editor-only.
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
None. 17.1 visually signed off on 2026-05-03; 17.2 (Design-mode shell —
boundary picker, size slider, origin picker) is the next active task.
