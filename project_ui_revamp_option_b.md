---
name: project_ui_revamp_option_b
description: "Agreed UI revamp plan (Option B — Workspace Shell); Pass 1 = tokens + top bar, inspector deferred"
metadata: 
  node_type: memory
  type: project
  originSessionId: 05f105eb-13a3-4f66-9a6c-097932dce529
---

UI/UX review (2026-06-18) led to an agreed revamp: **Option B — Workspace Shell**.

**Decided scope (user choices):**
- Pass 1 = rollout steps **1–2 only**, then stop for review:
  1. Design tokens + typography in `styles.css` — `--font-display/body/mono`, type scale `--fs-*`, formalize 4/8 spacing; bump sub-10px text for legibility.
  2. Persistent **top bar** (~52px, full width above rail+canvas): wordmark, **Gallery | Lab segmented switcher** (real active state, replaces the cramped 9px `ModeToggleButton`), active pattern name + "modified" dot, theme toggle, **Export menu** (moves Export out of the sidebar scroll).
- **Inspector = fast-follow** (NOT pass 1): design the shell as a grid that can grow a **3rd right column**; build the inspector later. It shows properties of the current selection (tile type → FigureControls, Builder edge/section/vertex → placement picker, Decoration strand/void → colour+scope).
- Deferred later passes: (3) de-dupe Gallery↔Lab shared controls + regroup left rail into a `Strands` parent absorbing Figures/Curves/Routing/Thickness; (4) Inspector.

**Why Option B:** biggest problems found were (a) two workspaces hidden behind a tiny text toggle, (b) one long flat 9-section accordion with no pipeline hierarchy, (c) Gallery & Lab re-implement the same controls and drift, (d) inlined font literals + sub-12px text, (e) hover-only `title=` tooltips.

**Key de-dup targets (file-level):** `FieldLabel` is redefined 3× (`Sidebar.tsx`, `lab/labShared.tsx`, `ConfigLibraryPanel.tsx`); `ExportBtn` (Sidebar) == `LabExportButton` (labShared); strand width/style/lacing coded twice (Gallery "Strand Thickness" + Lab "Display"); `segmentedButtonStyle` is Lab-only, promote to shared. `ConfigLibraryPanel` is already shared between modes — the precedent to follow. Proposed new homes: `src/components/TopBar.tsx`, `src/components/ui/` (shared primitives), `src/components/Inspector.tsx` (phase 2). `App.tsx` currently returns `TessellationLabMode` early — wrap both modes in one shell instead.

**Keep the aesthetic:** Art Deco × Egypt theme (lotus dividers, octa-stars, stepped-pyramid border, sandstone edge, diamond slider thumbs) is a deliberate asset — refine, don't remove; move the fan motif/pyramid border into the top bar.

**Pass 1 SHIPPED `1974c30` (2026-06-18)** on `main` — tsc + 573 vitest + build green; ⏳ browser-verify.
- New `src/components/TopBar.tsx` (brand, Gallery|Lab segmented switcher, contextual title, theme toggle, Export dropdown menu). Rendered **per-mode** (App for Gallery, TessellationLabMode for Lab) inside a `.app-shell` flex-column — avoids hoisting refs/handlers and keeps the Lab's history-wrapped dispatch intact.
- styles.css: `:root` tokens (`--font-display/body/mono`, `--fs-*`, `--sp-*`, `--topbar-height`) + `.app-shell` / `.top-bar` / `.workspace-switcher` / `.export-menu` styles. Tokens defined but inline-style literals NOT yet migrated (that's the pass-3 de-dup job).
- Removed from both sidebar headers: theme toggle, mode toggle (`ModeToggleButton` now dead but still exported in labShared), Gallery wordmark H1. Removed both Export sidebar sections (`ExportBtn` deleted; `LabExportButton` now dead-exported).
- Known minor regression: loading JSON via the top-bar menu no longer resets Gallery's My-Patterns `activePatternId` highlight (was wired through the old sidebar Load button). Low severity.

**Pass 3 SHIPPED `d891494` (2026-06-18)** — de-dup + Strands regroup; tsc + 573 vitest + build green; ⏳ browser-verify.
- New `src/components/ui/`: `FieldLabel`, `Toggle`, `StrandStyleControls`. FieldLabel was defined 3× — `lab/labShared` now re-exports it (`export { FieldLabel } from '../ui/FieldLabel'`) so all lab/ imports are unchanged; Sidebar + ConfigLibraryPanel import from ui directly.
- `StrandStyleControls` replaces the width/style/lacing/weave-gap block duplicated in Gallery "Strand Thickness" + Lab "Display".
- Gallery rail: Figures + Strand-style + Figure-routing + Curves merged into ONE collapsible `Strands` Section (key `strands`) with a lightweight `SubHeading` sub-group divider (secondary colour, distinct from accent SectionTitle). Routing + Curves stay gated behind Show advanced. Old collapse keys (figures/curves/figureRouting/lineThickness) now orphaned in localStorage (harmless).
- Removed dead `ModeToggleButton` + `LabExportButton` from labShared.
- Type bumps via tokens: SectionTitle 10→11 (`--fs-section`), segmentedButtonStyle 9→10 (`--fs-micro`).
- A `SegmentedControl` *component* was NOT created — `segmentedButtonStyle` helper already de-dups the styling; deferred. Many inline 9px buttons (library Save/Rename/Delete, Clear, undo/redo, New patch) still un-bumped — deferred.

NEXT (deferred, await go-ahead): Pass 4 = right-side Inspector (needs canvas→selection plumbing; shell grid already accommodates a 3rd column). Optional polish: SegmentedControl component, bump remaining inline 9px buttons, re-wire My-Patterns activeId reset on top-bar Load JSON.
