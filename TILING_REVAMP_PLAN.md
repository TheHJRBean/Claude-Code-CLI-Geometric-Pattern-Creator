# Tiling Revamp — Action Plan

**Branch:** `feat/art-deco-egypt-theme-revamp` (or a dedicated `feat/tiling-revamp` once Step 1 starts)
**Owner:** TheHJRBean
**Started:** 2026-04-25
**Status anchor:** see `SESSION_STATE.md` for current progress.

This plan replaces the rough phase outline in `SESSION_STATE.md`. It is a sequence of **discrete, visible steps** ordered simplest → most complex. Every step ships a feature the user can see and exercise in the browser. Optional additions are flagged inline. The plan is **a living document — update step status (todo / in-progress / done) and revise scope as work proceeds**.

---

## Locked architectural decisions

These came out of the grill-me interview (2026-04-25). They constrain every step below.

1. **Scope.** All six original ambitions are in scope, in this priority: (1) more presets, (2) layered mandalas, (3) single-rosette display, (4) mix-and-combine, (5) preserve standard infinite tilings, (6) user-editable tilings LAST.
2. **Mandala mode = layered composition.** Multiple concentric rosettes at one centre. Single-rosette display is achieved as a 1-layer mandala. The cheap "BFS depth=0" alternative is parked as `project_mandala_cheap_path_idea.md`.
3. **Mandala layer rule = strict divisor chain.** Inner layer fold-orders must divide the outer order. UI must enforce this. Permissive variants parked as `project_mandala_common_divisor_idea.md` and `project_mandala_anchor_only_idea.md`.
4. **Mix-and-combine = region-stitching.** Spatial regions, each running a different tiling. v1 surfaces only the simplest "one central patch + one infinite background" case. Free arrangement parked as `project_free_arrangement_idea.md`.
5. **Boundary behaviour = (b) strand match-up primary, (a) hard frame as user-selectable fallback.** Forgiving overlap parked as `project_forgiving_overlap_idea.md`.
6. **Centre+background pair handling = hybrid (a)+(b) from Q6.** Default UI surfaces only legal (strand-matchable) pairs. A "Show all backgrounds" toggle unlocks the full list; incompatible pairs auto-fall-back to hard frame with an explanatory tooltip. Legal pairs come from a hardcoded allow-list — not runtime derivation.
7. **Presets first, editor last.** Steps 3–11 are all preset/engine work. The drag-and-drop tiling editor is parked at the end (Step 12+).
8. **New work lives in a separate "Tiling Lab" mode** so it doesn't disturb the existing main-mode UI. The lab strips down chrome to the bare minimum (no lacing toggle, no curve controls, no vertex-line toggle, no display tab) — just the core PIC pipeline visualised. Existing UI features can be ported into the lab later, once the lab's tiling features stabilise.

### Safe defaults applied to remaining open questions

The user asked me to take the safest option for any unanswered query. These are the defaults I'm proceeding with — flag any to revisit.

- **Mode switcher.** A button in the existing sidebar header (top-left) that swaps the active mode between "Main" and "Tiling Lab". No URL routing change.
- **State isolation.** Tiling Lab uses its own independent `PatternConfig` instance; switching modes preserves both. Won't risk corrupting an in-flight Main pattern.
- **Persistence.** Tiling Lab reuses the existing JSON export/import format (same `PatternConfig` shape) — no new save mechanism in v1.
- **Legal-pair allow-list source.** Hardcoded TypeScript table, not computed at runtime. Initial entries: `{ centre, backgrounds }` for the 7 strand-matchable centres identified in Q6.
- **Mandala canvas centre.** Always the canvas centre (0,0 in PIC coords). No user-positioned mandala in v1.
- **Mandala layer rotation.** Each layer auto-rotates so its primary axis aligns with the outer layer's. No manual rotation slider in v1.
- **Region geometry.** v1 central region is always a regular polygon matching the centre rosette's outer fold (e.g. 16-fold centre → 16-gon region; 12-fold → 12-gon). No square or circular masks in v1 — those become Step 11+ optionals.
- **Build/CI.** Each step ends with `npm run build` (type-check + production build) green. No new test framework in this revamp; existing `*.test.ts` files keep passing.

---

## Step-by-step plan

Legend: **[S]** small (≤ 1 day), **[M]** medium (1–3 days), **[L]** large (3+ days). **(opt)** = optional addition for that step.

### Step 1 — Tiling Lab scaffold [S]
**Visible result:** new "Tiling Lab" button appears in the sidebar header. Clicking it swaps the main canvas + sidebar for a stripped-down lab view: blank canvas, single "Tiling" dropdown (empty for now), nothing else. Click the button again to return to Main mode.

- Add `TilingLabMode.tsx` component (renders own canvas + own minimal sidebar)
- Add a top-level `mode: 'main' | 'lab'` state in `App.tsx`
- Mode toggle button in the existing sidebar header
- Lab mode imports the existing `Canvas` component but with all overlay layers (lacing, curves, control-points) disabled
- (opt) Persist last-used mode to `localStorage`

**Acceptance:** can switch back and forth between Main and Lab without losing the Main mode's current pattern.

---

### Step 2 — Port existing tilings into Lab [S]
**Visible result:** the Lab's tiling dropdown lists all 16 existing tilings (grouped by fold-symmetry, same as Main). Selecting one renders the chosen tiling in the lab canvas with default contact angles, no other controls.

- Wire the Lab's dropdown to `SYMMETRY_GROUPS` / `TILINGS`
- Apply each tiling's `defaultConfig` on selection
- Lab canvas renders only `Segment[]` from the PIC pipeline — no lacing pass, no curve handles
- (opt) Add a "Reset to default angle" button per selected tiling

**Acceptance:** every existing tiling renders identically in Lab vs Main when both use default settings.

---

### Step 3 — Add hexadecagonal-rosette (16-fold) [S]
**Visible result:** new tiling "Hexadecagonal Rosette" appears under "16-fold" in the dropdown. Selecting it renders a 16-fold rosette patch — matches Example A / C / D centre.

- Add `'hexadecagonal-rosette'` entry to `tilings/index.ts`: vertex config `[16, 4]` (or `[16, 4, 4]` — verify against research §2.5)
- Tile types: 16-gon centre, thin rhombus ring, square fillers
- Default contact angle: 78.75° (Bahia Palace canonical)
- Add to `SYMMETRY_GROUPS` as fold-16
- Append to `RESEARCH-TILING-CONFIGURATIONS.md` working log
- (opt) Add a 14-fold rosette while we're here

**Acceptance:** rendered output visually matches the central rosette of Example A.

---

### Step 4 — Bonner pattern-family preset selector [S]
**Visible result:** below each per-figure contact-angle slider in Lab mode, a small "Family" segmented control with 3 options: **Acute / Median / Obtuse**. Clicking one snaps the contact angle to a canonical value for the family (per-tiling-defined). The slider stays user-overridable.

- Add `bonnerFamily?: 'acute' | 'median' | 'obtuse'` field to `FigureConfig` (optional, doesn't break existing patterns)
- Per-tiling family→angle table in `tilings/bonnerFamilies.ts` (new file)
- Lab sidebar UI: segmented control above the angle slider
- Two-point family deferred to Step 5 (it's an engine change, not a preset)

**Acceptance:** flipping families on the 4.8.8 tiling produces three visibly distinct star styles.

---

### Step 5 — Two-point figure subFamily (star-and-cross) [M]
**Visible result:** "Family" selector now has a fourth option: **Two-Point**. With 4.8.8 tiling + two-point family, the canvas shows the classic khatem-sulemani 8-pointed-star + 4-pointed-cross strapwork (Example B).

- Extend `FigureConfig`: `bonnerFamily` enum gains `'two-point'`; add `contactPoints?: number` (1 = current, 2 = star-and-cross)
- `pic/stellation.ts` emits two contact rays per polygon edge instead of one when `contactPoints === 2`
- Trim/intersect logic should "just work" with double the rays — verify
- Per-tiling default contact angles for two-point family added to the table from Step 4

**Acceptance:** 4.8.8 + two-point output visually matches Example B.

---

### Step 6 — Curated preset catalogue [S–M]
**Visible result:** new "Presets" dropdown at the top of the Lab sidebar lists named historical patterns. Selecting one loads a complete `PatternConfig` snapshot — tiling, all figures, family choices.

- Catalogue file `state/labPresets.ts` exporting `Record<string, PatternConfig>`
- Initial 8–12 entries (best-effort matches to research §2.2 + Examples A, B, C, D centres):
  - Alhambra Court (4.8.8 acute)
  - Khatem Sulemani (4.8.8 two-point)
  - Sultan Hassan Star (hexadecagonal acute)
  - Bahia Palace 16-fold (hexadecagonal median)
  - Decagonal Girih (decagonal-rosette median)
  - Topkapi Hexagonal (hexagonal acute)
  - Trihexagonal Strapwork (3.6.3.6 two-point)
  - 4.6.12 Star (4.6.12 median)
- Lab sidebar: dropdown above tiling selector, "Load preset" button
- (opt) "Save current as preset" — defer to a later step

**Acceptance:** user can produce 8+ distinct historical patterns by selecting presets only.

---

### Step 7 — Layered mandala engine v1 [M]
**Visible result:** new entry in the "Tiling" dropdown: **"Layered Mandala"** (separate category). Selecting it reveals a "Layers" panel where the user picks an outer fold-order (4/6/8/10/12/16) and adds 1–4 inner layers. Inner-layer fold-order dropdowns are filtered by the strict divisor rule (e.g. outer 16 → inner ∈ {1, 2, 4, 8, 16}). Each layer has a scale slider. Canvas renders the stack of rosettes, all centred at canvas origin.

- New tiling category `'mandala'` in `TilingDefinition`
- New module `tilings/mandala.ts`: takes `MandalaConfig = { outerFold, layers: [{ fold, scale, contactAngle }] }`, returns `Polygon[]`
- Layer construction: each layer is a regular n-gon centred at origin, scaled per the layer's `scale`, decorated with its own rosette figure
- Strict-divisor validation in the UI (disable invalid options in the dropdown)
- Auto-rotation: each layer's primary axis aligned with outer
- Render path: existing PIC pipeline runs once per layer; outputs concatenated
- Sidebar: new "Layers" panel UI (only visible when "Layered Mandala" tiling is selected)

**Acceptance:** can build a 16+8+4 mandala by clicking three dropdowns; bands visibly align.

---

### Step 8 — Mandala preset catalogue [S]
**Visible result:** the Step 6 Presets dropdown gains a "Mandalas" sub-section with 4–6 prebuilt layered compositions (Example A / C / D mandala-style stacks).

- Add mandala entries to `labPresets.ts`
- Each preset is a complete `PatternConfig` with `tiling.type === 'mandala'` and a fully-specified `MandalaConfig`
- Initial mandalas:
  - "Sultan Hassan Layered" (16+8+4)
  - "Hagia Sophia Disc" (12+6+3)
  - "Octagonal Mandala" (8+4+2)
  - "Decagonal Mandala" (10+5)
- (opt) Add a 16+8+8-offset mandala — requires the anchor-only rule, parked

**Acceptance:** at least 4 mandala presets render correctly.

---

### Step 9 — Region-stitching v1, hard-frame only [M]
**Visible result:** new tiling category **"Composition"** in the dropdown. Selecting it reveals a "Centre" picker (any single tiling) and a "Background" picker (any single tiling). The canvas renders the central tiling clipped to a regular polygon region matching the centre's fold (16-gon for 16-fold etc.), surrounded by the background tiling clipped to the canvas viewport minus that region. A visible frame line is drawn at the boundary. **No strand-matching yet — both sides are clipped at the frame.**

- New tiling category `'composition'` in `TilingDefinition`
- New module `tilings/composition.ts`: takes `CompositionConfig = { centre: TilingConfig, background: TilingConfig, regionRadius: number }`, runs each tiling independently, masks each to its region, draws frame
- SVG `clipPath` for the central region (regular polygon)
- SVG `clipPath` (inverted) for the background — entire viewport minus the central region
- Frame stroke as a separate SVG `<polygon>` overlay
- Lab sidebar: "Composition" panel with two tiling pickers + region-radius slider

**Acceptance:** can compose 16-fold-rosette centre + 4.8.8 background, see clean frame between them.

---

### Step 10 — Strand match-up boundary mode + hybrid pair filter [L]
**Visible result:** the Composition panel from Step 9 gains a "Boundary" toggle: **"Match strands across boundary" (default) / "Hard frame"**. When "Match" is selected:
- The Background dropdown is filtered to only tilings strand-compatible with the selected Centre (the hybrid-Q6 default).
- Strands at the seam connect smoothly: a strand exiting the central region continues into a background-tiling strand at the same point and angle.

A small "Show all backgrounds" toggle below the Background dropdown unlocks the full list. Picking an incompatible pair from the unlocked list silently flips the boundary mode to "Hard frame" and shows a tooltip: "Strands cannot match cleanly between {centre} and {background}; using Hard frame instead."

- Hardcoded allow-list `state/strandMatchablePairs.ts`:
  ```ts
  export const STRAND_MATCHABLE: Record<string, string[]> = {
    'square': ['square', '4.8.8'],
    '4.8.8': ['square', '4.8.8'],
    'hexagonal': ['hexagonal', '3.12.12', '4.6.12'],
    '3.12.12': ['hexagonal', '3.12.12'],
    '4.6.12': ['hexagonal', '4.6.12'],
    'hexadecagonal-rosette': ['square', '4.8.8'],
    // 5/7/9/10/11-fold centres: no entry → always hard frame
  }
  ```
- Strand-matching algorithm (in `tilings/composition.ts`): when both sides share an edge length and contact angle, generate strand endpoints at boundary edges in both tilings; pair them by spatial proximity; render as a single continuous PIC segment crossing the seam
- UI: hybrid filter as described above, plus the auto-fallback tooltip

**Acceptance:** 16-fold-centre + 4.8.8-background renders with strands crossing the seam smoothly. 10-fold-centre + hexagonal-background auto-falls-back to hard frame with the tooltip showing.

---

### Step 11 — Composition preset catalogue [S]
**Visible result:** the Presets dropdown gains a "Compositions" sub-section with 4–6 named region-stitched patterns.

- Add composition entries to `labPresets.ts`
- Initial compositions:
  - "16-in-4.8.8 (Sultan Hassan)" — strand-matched
  - "12-in-Hexagonal (Topkapi)" — strand-matched
  - "16-in-Square (Bahia Palace)" — strand-matched
  - "10-in-Hexagonal (framed)" — hard-frame fallback example
- (opt) Square or circular region-mask alternative — currently locked to regular-polygon mask

**Acceptance:** at least 4 composition presets render correctly with their respective boundary modes.

---

## Optional / Future steps (parked)

These appear after Step 11. Reorder by demand at that point.

### Step 12 (opt) — k-uniform tiling generator
Generalise `tilings/archimedean.ts` BFS to handle multiple vertex orbits. Unlocks the 20 2-uniform tilings. Expands the Centre/Background dropdowns. Architectural change to `neighborSides.ts`.

### Step 13 (opt) — Quasi-periodic generators
Penrose P3 (5/10-fold), Ammann–Beenker (8-fold), Stampfli/Socolar (12-fold). New `category: 'quasiperiodic'`. Unlocks 10-fold-in-anything strand match-up (currently always hard-frame). New substitution-based tile generator beside the BFS one.

### Step 14 (opt) — Girih substitution tile set
Lu & Steinhardt 2007 fivefold system. New `category: 'girih'`. Pre-decorated tile set with edge-matching adjacency. Combines with Step 13 to produce Darb-i-Imam-style patterns.

### Step 15 (opt) — User-editable tilings (the final ambition)
Drag-and-drop polygon placement, vertex-config editor, save/load custom tilings. Likely a separate page/route inside Tiling Lab. Persistence via `localStorage` + JSON export/import.

### Step 16 (opt) — Port Lab features back into Main mode
Once the Lab's tiling features are stable, port the new tiling categories (mandala, composition) into Main mode so they integrate with lacing, curves, vertex lines, etc.

### Future ideas (already in memory)
- `project_mandala_cheap_path_idea.md` — BFS depth=0 single-rosette mode
- `project_mandala_common_divisor_idea.md` — permissive layer rule
- `project_mandala_anchor_only_idea.md` — most permissive layer rule
- `project_free_arrangement_idea.md` — drag-and-drop multi-tiling canvas
- `project_forgiving_overlap_idea.md` — third boundary mode

---

## Working log

- **2026-04-25** — Plan drafted from grill-me interview. Steps 1–11 sequenced; optionals 12–16 parked. Awaiting user kick-off on Step 1.
