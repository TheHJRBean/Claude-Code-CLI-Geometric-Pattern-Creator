# Tessellation Revamp — Action Plan

**Branch:** `feat/art-deco-egypt-theme-revamp`
**Owner:** TheHJRBean
**Started:** 2026-04-25  ·  **Re-scoped:** 2026-04-26
**Status anchor:** see `SESSION_STATE.md` for current progress.

---

## Terminology (locked)

To eliminate the ambiguity that misdirected the first draft of this plan, the
project uses two distinct terms — internal code identifiers may still use the
older words, but **all UI, docs, and design discussion must use these**:

- **Tessellation** — the underlying polygon tiling. The arrangement of tiles
  (squares, hexagons, rhombi, decagons, etc.) covering the plane or a
  bounded region. Pure geometry, no decoration. *(Replaces the old word
  "tiling" in this plan.)*
- **Strand** — a line in the decorative pattern produced by Kaplan's
  Polygons-in-Contact (PIC) algorithm running over a tessellation. Strands
  are an optional overlay on top of a tessellation. *(Replaces the old word
  "line" / "PIC line" in this plan.)*

The Tessellation Lab is therefore primarily a **tessellation editor and
explorer**. Strands are a secondary overlay, off by default in Lab mode.

---

## Locked architectural decisions

These came out of the grill-me interview (2026-04-25) and the terminology
clarification (2026-04-26). They constrain every step below.

1. **Scope.** Six original ambitions, in priority order: (1) more
   tessellation presets, (2) layered mandala tessellations, (3)
   single-rosette tessellation display, (4) mix-and-combine
   tessellations, (5) preserve standard infinite tessellations,
   (6) user-editable tessellations LAST.
2. **Mandala tessellation = layered composition.** Concentric rings of
   regular polygons sharing a common centre, each ring an independent
   layer. Single-rosette display is a 1-layer mandala.
3. **Mandala layer rule = strict divisor chain.** Inner-layer fold-orders
   must divide the outer order. UI must enforce this.
4. **Mix-and-combine = region-stitching.** A central tessellation patch
   surrounded by an infinite background tessellation. v1 surfaces only the
   simplest "one central patch + one infinite background" case.
5. **Boundary behaviour (when strands are turned on).** Two modes:
   (b) strand match-up across the seam (default for compatible pairs),
   (a) hard frame (always works as a fallback).
6. **Centre+background pair handling.** Default UI surfaces only legal
   (strand-matchable) pairs. A "Show all backgrounds" toggle unlocks the
   full list; incompatible pairs auto-fall-back to hard frame with a
   tooltip. Allow-list is hardcoded, not derived at runtime.
7. **Presets first, editor last.** Steps 3–11 are all preset/engine work.
   The drag-and-drop tessellation editor is parked at Step 14+.
8. **Tessellation Lab is a separate mode** so it doesn't disturb Main.
   The Lab strips chrome to the bare minimum: tessellation picker, scale,
   reset, and a "Show strands" toggle — nothing else in v1.
9. **Tessellation-first rendering in Lab.** Lab canvas always renders the
   polygon tessellation. Strand overlay is opt-in via the "Show strands"
   toggle (off by default).

### Safe defaults applied to remaining open questions

The user asked me to take the safest option for any unanswered query.

- **Mode switcher.** A button in the existing sidebar header (top-left,
  next to the desktop collapse button) that swaps the active mode between
  "Main" and "Tessellation Lab". No URL routing change.
- **State isolation.** Lab uses its own independent `PatternConfig`
  instance; switching modes preserves both.
- **Persistence.** Lab reuses the existing JSON export/import format
  (same `PatternConfig` shape). No new save mechanism in v1.
- **Legal-pair allow-list source.** Hardcoded TypeScript table.
- **Mandala canvas centre.** Always the canvas centre (0, 0). No
  user-positioned mandala in v1.
- **Mandala layer rotation.** Each layer auto-rotates so its primary axis
  aligns with the outer layer's. No manual rotation slider in v1.
- **Region geometry.** v1 central region is always a regular polygon
  matching the centre's outer fold (16-fold centre → 16-gon region, etc.).
- **Build/CI.** Each step ends with `npm run build` (type-check + production
  build) green. Existing `*.test.ts` files keep passing.

---

## Step-by-step plan

Legend: **[S]** small (≤ 1 day), **[M]** medium (1–3 days), **[L]** large
(3+ days). **(opt)** = optional addition for that step.

### Step 1 — Tessellation Lab scaffold [S] · ✅ DONE
**Visible result:** Lab toggle button in sidebar header. Clicking swaps
canvas + sidebar for a stripped-down Lab view. Toggle again returns to Main.

- Lab mode lives in `src/components/TessellationLabMode.tsx`
- Independent `PatternConfig` per mode (Main state preserved on toggle)
- Lab canvas reuses `Canvas` with overlay flags driven by Lab toggles

**Acceptance:** can switch back and forth between Main and Lab without
losing the Main mode's current pattern.

---

### Step 2 — Port existing tessellations into Lab [S] · ✅ DONE
**Visible result:** Lab's "Tessellation" dropdown lists all 16 existing
tessellations (grouped by fold-symmetry). Selecting one renders the polygon
tessellation; strands are off by default. A Scale slider, "Reset to default
angle" button, and an Info panel (vertex config / fold / category) appear
once a tessellation is chosen. A "Show strands" toggle in a Display section
turns the strand overlay on for inspection.

- Wire dropdown to `SYMMETRY_GROUPS` / `TILINGS`
- Apply `defaultConfig` on selection (via existing `SET_TILING_TYPE`)
- Lab canvas: `showTileLayer={true}`, `showLines={showStrands}`

**Acceptance:** every existing tessellation renders identically in Lab vs
Main when both use defaults.

---

### Step 3 — Hexadecagonal-rosette tessellation (16-fold) [S]
**Visible result:** new tessellation "Hexadecagonal Rosette" appears under
"16-fold" in the Lab dropdown. Selecting it renders a 16-gon centre
surrounded by a thin-rhombus ring and square fillers — the polygon
arrangement underlying the central rosette of Examples A / C / D.

- Add `'hexadecagonal-rosette'` entry to `tilings/index.ts`
  (vertex config `[16, 4]` — verify against research §2.5)
- Tile types: 16-gon centre, thin rhombus ring, square fillers
- Add to `SYMMETRY_GROUPS` as fold-16
- Default contact angle 78.75° (Bahia Palace canonical) lives in the
  tessellation's `defaultConfig` so when the user does turn strands on the
  pattern looks right
- Append to `RESEARCH-TILING-CONFIGURATIONS.md` working log
- (opt) Add a 14-fold rosette while we're here

**Acceptance:** with strands off, the polygon tessellation matches the
underlying tile arrangement of Example A's centre. With strands on, the
visible PIC pattern matches Example A's central rosette.

---

### Step 4 — Tessellation preset catalogue [S–M]
**Visible result:** new "Presets" dropdown at the top of the Lab sidebar
lists named historical tessellations. Selecting one loads a complete
`PatternConfig` snapshot — tessellation, scale, default per-tile contact
angles. (Strand overlay state stays as the user has set it.)

- Catalogue file `state/labPresets.ts` exporting
  `Record<string, PatternConfig>`
- Initial 8–12 entries, best-effort matches to research §2.2 + Examples A
  / B / C / D centres:
  - Alhambra Court (4.8.8)
  - Khatem Sulemani frame (4.8.8)
  - Sultan Hassan Star (hexadecagonal)
  - Bahia Palace 16-fold (hexadecagonal)
  - Decagonal Girih (decagonal-rosette)
  - Topkapi Hexagonal (hexagonal)
  - Trihexagonal Strapwork (3.6.3.6)
  - 4.6.12 Star (4.6.12)
- Lab sidebar: dropdown above tessellation selector, "Load preset" button
- (opt) "Save current as preset" — defer to a later step

**Acceptance:** user can produce 8+ distinct historical tessellations by
selecting presets only.

---

### Step 5 — Layered mandala tessellation engine v1 [M]
**Visible result:** new entry in the Lab "Tessellation" dropdown:
**"Layered Mandala"** (separate category). Selecting it reveals a "Layers"
panel where the user picks an outer fold-order (4/6/8/10/12/16) and adds
1–4 inner layers. Inner-layer fold-order dropdowns are filtered by the
strict divisor rule (e.g. outer 16 → inner ∈ {1, 2, 4, 8, 16}). Each layer
has a scale slider. Canvas renders the stack of regular polygon rings, all
centred at canvas origin. With strands off, the user sees only the polygon
rings; with strands on, each ring becomes a rosette.

- New tessellation category `'mandala'` in `TilingDefinition`
- New module `tilings/mandala.ts`: takes
  `MandalaConfig = { outerFold, layers: [{ fold, scale, contactAngle }] }`,
  returns `Polygon[]`
- Layer construction: each layer is a regular n-gon centred at origin,
  scaled per the layer's `scale`; rosette decoration uses the layer's
  `contactAngle` only when strands are on
- Strict-divisor validation in the UI (disable invalid options)
- Auto-rotation: each layer's primary axis aligned with outer
- Render path: existing PIC pipeline runs once per layer; outputs
  concatenated. Tessellation polygons concatenated likewise.
- Sidebar: new "Layers" panel UI (only visible when "Layered Mandala" is
  selected)

**Acceptance:** can build a 16+8+4 mandala by clicking three dropdowns; the
polygon rings visibly nest and align even before strands are turned on.

---

### Step 6 — Mandala preset catalogue [S]
**Visible result:** the Step 4 Presets dropdown gains a "Mandalas"
sub-section with 4–6 prebuilt layered tessellations.

- Add mandala entries to `labPresets.ts`
- Each preset is a complete `PatternConfig` with `tiling.type === 'mandala'`
  and a fully-specified `MandalaConfig`
- Initial mandalas:
  - "Sultan Hassan Layered" (16 + 8 + 4)
  - "Hagia Sophia Disc" (12 + 6 + 3)
  - "Octagonal Mandala" (8 + 4 + 2)
  - "Decagonal Mandala" (10 + 5)

**Acceptance:** at least 4 mandala presets render correctly (polygons +
strand-on view both look right).

---

### Step 7 — Region-stitching v1, hard-frame only [M]
**Visible result:** new tessellation category **"Composition"** in the
dropdown. Selecting it reveals a "Centre" picker (any single tessellation)
and a "Background" picker (any single tessellation). The canvas renders the
central tessellation clipped to a regular polygon region matching the
centre's fold (16-gon for 16-fold etc.), surrounded by the background
tessellation clipped to the canvas viewport minus that region. A visible
frame line is drawn at the boundary. **Polygons match cleanly within each
region; no strand-matching yet — both sides are clipped at the frame.**

- New tessellation category `'composition'` in `TilingDefinition`
- New module `tilings/composition.ts`: takes
  `CompositionConfig = { centre, background, regionRadius }`, runs each
  tessellation independently, masks each polygon set to its region, draws
  a frame
- SVG `clipPath` for the central region (regular polygon)
- SVG `clipPath` (inverted) for the background — entire viewport minus the
  central region
- Frame stroke as a separate SVG `<polygon>` overlay
- Lab sidebar: "Composition" panel with two tessellation pickers +
  region-radius slider

**Acceptance:** can compose 16-fold-rosette centre + 4.8.8 background, see
clean frame between them. Works whether strands are on or off (strands
just stop at the frame).

---

### Step 8 — Strand match-up boundary mode + hybrid pair filter [L]
**Visible result:** the Composition panel gains a "Boundary" toggle:
**"Match strands across boundary" (default) / "Hard frame"**. When "Match"
is selected (and strands are on):
- Background dropdown is filtered to tessellations strand-compatible with
  the selected Centre.
- Strands at the seam connect smoothly: a strand exiting the central
  region continues into a background-tessellation strand at the same point
  and angle.

A "Show all backgrounds" toggle below the Background dropdown unlocks the
full list. Picking an incompatible pair from the unlocked list silently
flips the boundary mode to "Hard frame" with a tooltip:
*"Strands cannot match cleanly between {centre} and {background}; using
Hard frame instead."*

- Hardcoded allow-list `state/strandMatchablePairs.ts`:
  ```ts
  export const STRAND_MATCHABLE: Record<string, string[]> = {
    'square':                 ['square', '4.8.8'],
    '4.8.8':                  ['square', '4.8.8'],
    'hexagonal':              ['hexagonal', '3.12.12', '4.6.12'],
    '3.12.12':                ['hexagonal', '3.12.12'],
    '4.6.12':                 ['hexagonal', '4.6.12'],
    'hexadecagonal-rosette':  ['square', '4.8.8'],
    // 5/7/9/10/11-fold centres: no entry → always hard frame
  }
  ```
- Strand-matching algorithm (in `tilings/composition.ts`): when both sides
  share an edge length and contact angle, generate strand endpoints at
  boundary edges in both tessellations; pair them by spatial proximity;
  render as a single continuous PIC segment crossing the seam
- UI: hybrid filter as described above, plus the auto-fallback tooltip

**Acceptance:** 16-fold-centre + 4.8.8-background renders with strands
crossing the seam smoothly. 10-fold-centre + hexagonal-background
auto-falls-back to hard frame with the tooltip showing.

---

### Step 9 — Composition preset catalogue [S]
**Visible result:** the Presets dropdown gains a "Compositions" sub-section
with 4–6 named region-stitched tessellations.

- Add composition entries to `labPresets.ts`
- Initial compositions:
  - "16-in-4.8.8 (Sultan Hassan)" — strand-matched
  - "12-in-Hexagonal (Topkapi)" — strand-matched
  - "16-in-Square (Bahia Palace)" — strand-matched
  - "10-in-Hexagonal (framed)" — hard-frame fallback example
- (opt) Square or circular region-mask alternative — currently locked to
  regular-polygon mask

**Acceptance:** at least 4 composition presets render correctly with their
respective boundary modes.

---

### Step 10 — Lab polish [S]
**Visible result:** small ergonomic improvements once the engine work is
in place.
- Persist last-used Lab tessellation + scale to localStorage
- Tessellation outline weight slider in Display section
- Optional fill-on-hover for tile types (helps editor work in Step 14)

**Acceptance:** Lab feels like a finished prototype workspace.

---

### Step 11 — Strand decoration controls in Lab [M]
**Visible result:** the Lab's "Display" section gains a "Strands" panel
that mirrors a trimmed subset of Main's per-figure controls (contact
angle, edge / vertex strands, optional curve strands). This is when Lab
users start producing finished decorated patterns end-to-end without
leaving the Lab.

- Reuse `FigureControls` from `Sidebar.tsx` but only when "Show strands"
  is on
- Per-tessellation default angles still come from each tessellation's
  `defaultConfig`
- (opt) Bonner family selector (Acute / Median / Obtuse) per tile type —
  small per-tessellation family→angle table in `tilings/bonnerFamilies.ts`

**Acceptance:** user can pick a tessellation, turn strands on, tune
contact angle / edge-vertex behaviour, and export — all from Lab.

---

### Step 11.5 — Promote a custom Lab tessellation into Main mode [M]
**Visible result:** in the Tessellation Lab's sidebar, a "**Send to Main**"
button (and matching "Save to library" affordance) appears once the user
has a non-empty tessellation selected. Clicking it stores the current
tessellation under a user-supplied name in a "My tessellations" library.
On returning to Main mode, the tessellation dropdown gains a new
**"Custom"** group at the top listing those saved entries; selecting one
loads it into the Main `PatternConfig` exactly like a built-in
tessellation, with all of Main's strand controls (lacing, curves, edge /
vertex strands, exports) immediately available.

This is the bridge that makes the Lab's tessellation work pay off in
Main: anything the user composes in the Lab — a layered mandala, a
region-stitched composition, a custom 16-fold rosette — becomes a
first-class citizen in Main without copy-pasting JSON.

- **Persistence layer.** New module `state/customTessellations.ts`:
  ```ts
  export interface SavedTessellation {
    id: string                // uuid
    name: string              // user-supplied
    createdAt: number         // Date.now()
    config: PatternConfig     // full snapshot incl. tiling + figures
    sourceCategory:
      | 'archimedean' | 'rosette-patch' | 'mandala' | 'composition'
  }
  ```
  Stored in localStorage under `custom-tessellations-v1`. Schema-versioned
  so future migrations are safe.
- **Lab → Main flow.**
  1. Lab "Save to library" button: prompts for a name (pre-filled with
     the source tessellation's label + suffix), writes to localStorage.
  2. Optional "Send to Main" shortcut: saves AND switches to Main mode
     with the new tessellation pre-selected.
- **Main mode integration.**
  - `tilings/index.ts` exports a runtime-merged registry: built-in
    `TILINGS` + saved entries from localStorage.
  - `SYMMETRY_GROUPS` gets a synthetic group `{ fold: 0, label: 'Custom',
    tilings: [savedIds] }` rendered first when non-empty.
  - Selecting a custom entry dispatches `LOAD_CONFIG` (existing reducer
    case) with the saved `config`, so Main's reducer / Sidebar / Canvas
    work unchanged.
- **Library management UI** (small, in both Main and Lab tessellation
  pickers):
  - Rename, delete, duplicate.
  - Show source category + creation date as secondary text.
- **Edge cases.**
  - A saved composition or mandala references engine modules that must
    exist at load time. If a saved entry references a category not yet
    implemented (e.g. `'composition'` saved from a future build, opened
    in an older one), show a tooltip and disable selection rather than
    crash.
  - Saving from Main mode is a v2 concern — for v1, library writes only
    happen from Lab.
- **Export/import compatibility.** Reuse the existing JSON
  export/import (`saveJSON` / `loadJSON`) so a saved tessellation can be
  shared as a file too. The library is just a localStorage cache; the
  JSON is canonical.

**Acceptance:**
1. From Lab, build any non-trivial tessellation (e.g. a 16+8+4 mandala
   from Step 5 or a 16-in-4.8.8 composition from Step 7), click "Save to
   library", give it a name.
2. Switch to Main mode. The tessellation dropdown shows a new "Custom"
   group at the top with that entry.
3. Selecting it renders the saved tessellation in Main with full strand
   controls available — and Main mode's existing patterns are preserved
   (no clobbering).
4. Reload the browser; saved entries persist.
5. Delete the entry from the library UI; it disappears from both Lab and
   Main dropdowns.

---

## Optional / Future steps (parked)

These appear after Step 11. Reorder by demand at that point.

### Step 12 (opt) — k-uniform tessellation generator
Generalise `tilings/archimedean.ts` BFS to handle multiple vertex orbits.
Unlocks the 20 2-uniform tessellations.

### Step 13 (opt) — Quasi-periodic generators
Penrose P3 (5/10-fold), Ammann–Beenker (8-fold), Stampfli/Socolar (12-fold).
New `category: 'quasiperiodic'`. Substitution-based tile generator.

### Step 14 (opt) — User-editable tessellations
Drag-and-drop polygon placement, vertex-config editor, save/load custom
tessellations. Likely a separate page/route inside Lab. Persistence via
localStorage + JSON export/import.

### Step 15 (opt) — Girih substitution tile set
Lu & Steinhardt 2007 fivefold system. New `category: 'girih'`.
Pre-decorated tile set with edge-matching adjacency. Combines with
Step 13 to produce Darb-i-Imam-style patterns.

### Step 16 (opt) — Port Lab features back into Main mode
Once the Lab's tessellation features are stable, port the new categories
(mandala, composition) into Main mode so they integrate with lacing,
curves, etc.

### Future ideas (already in memory)
- `project_mandala_cheap_path_idea.md` — BFS depth=0 single-rosette mode
- `project_mandala_common_divisor_idea.md` — permissive layer rule
- `project_mandala_anchor_only_idea.md` — most permissive layer rule
- `project_free_arrangement_idea.md` — drag-and-drop multi-tessellation canvas
- `project_forgiving_overlap_idea.md` — third boundary mode

---

## Working log

- **2026-04-25** — Plan drafted from grill-me interview. Originally Steps
  1–11 sequenced under the assumption "tiling = strand pattern".
- **2026-04-26** — Terminology corrected: tessellation = polygons, strand
  = PIC line. Plan rewritten end-to-end. Lab UI updated to render
  tessellation by default with a "Show strands" toggle. Step ordering
  preserved where the work was tessellation-first; the old Step 4
  (Bonner-family selector) and Step 5 (two-point figure) collapsed into
  Step 11 — strand-only work, deferred until tessellation engine is solid.
- **2026-04-26** — Added **Step 11.5: Promote a custom Lab tessellation
  into Main mode**. Bridges the Lab's tessellation work into Main's
  strand workspace ("tiling lab" in user terminology = Main mode) via a
  localStorage-backed library + synthetic "Custom" group in the Main
  tessellation dropdown.
