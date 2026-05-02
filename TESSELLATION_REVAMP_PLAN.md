# Tessellation Revamp — Action Plan (v3)

**Branch:** `feat/art-deco-egypt-theme-revamp`
**Owner:** TheHJRBean
**Started:** 2026-04-25  ·  **Re-scoped:** 2026-04-26 (terminology) ·  **Restructured:** 2026-04-26 (Option B)
**Status anchor:** see `SESSION_STATE.md` for current progress.

---

## Terminology (locked)

To eliminate the ambiguity that misdirected v1 of this plan:

- **Tessellation** — the underlying polygon tiling. The arrangement of tiles
  covering the plane or a bounded region. Pure geometry, no decoration.
- **Strand** — a line in the decorative pattern produced by Kaplan's
  Polygons-in-Contact (PIC) algorithm running over a tessellation. Strands
  are an optional overlay on top of a tessellation.

Internal code identifiers may still use older words (`TILINGS`,
`lineLength`, etc.); those are deferred refactors and not user-visible.

---

## Approach (locked 2026-04-26)

**Conservative-first.** Reliability over features. The plan ships polygon
geometry end-to-end before strand rendering enters the Lab. No category
gets strand support until its tessellation engine is solid and exercised
by a preset catalogue.

**Lab-resident workflow.** Custom tessellations (mandala, composition,
future custom) live and are edited *in the Lab*. The Lab grows
specialised strand renderers per category. **There is no "promote to
Main" bridge** — the structural mismatch between Main's per-tile-type
strand model and the new categories' layer/seam-keyed strand needs makes
that bridge expensive and bug-prone. Archimedean and rosette-patch
tessellations remain Main's domain (they already work there). The Lab
absorbs anything novel.

This replaces the v2 plan's old Step 11.5 (Promote to Main) and old
Step 16 (Port Lab to Main). Both deleted.

---

## Locked architectural decisions

These came from the grill-me interview (2026-04-25), the terminology
clarification (2026-04-26), and the Option-B restructure (2026-04-26).

1. **Scope.** Six original ambitions, in priority order: more presets,
   layered mandalas, single-rosette display, mix-and-combine,
   preserve standard infinite tessellations, user-editable tessellations
   LAST.
2. **Mandala tessellation = layered composition.** Concentric rings of
   regular polygons sharing a common centre.
3. **Mandala layer rule = strict divisor chain.** Inner-layer fold-orders
   must divide the outer order. UI must enforce this. *Conservative
   choice — kept strict until proven inadequate by an actual target
   preset that can't be built under it. See Open Question MQ-1.*
4. **Mix-and-combine = region-stitching.** Single central tessellation
   patch surrounded by a single infinite background tessellation. v1
   surfaces only this simplest case.
5. **Boundary behaviour.** When strands are off, the seam is just a
   polygon outline. When strands are on (Step 13), two modes:
   (b) strand match-up across the seam (default for verified-compatible
   pairs), (a) hard frame (always works as a fallback).
6. **Centre+background pair handling.** Default UI surfaces only verified
   strand-matchable pairs. "Show all backgrounds" toggle unlocks the full
   list; incompatible pairs auto-fall-back to hard frame.
7. **Engine work first, editor last.** Steps 3–14 are engine /
   preset / persistence work. The drag-and-drop tessellation editor is
   parked at Step 17.
8. **Tessellation Lab is a separate mode** so it doesn't disturb Main.
   Lab grows over time: chrome starts minimal (Steps 1–2) and gains a
   layers panel (Step 5), composition panel (Step 7), strand controls
   (Step 11), category-specialised strand panels (Steps 12–13), and a
   library UI (Step 14). The "stripped-down" framing applies to *what
   ships in v1 of each step*, not to the whole Lab forever.
9. **Tessellation-first rendering in Lab.** Lab canvas always renders
   the polygon tessellation. Strand overlay is opt-in via the "Show
   strands" toggle (off by default). Holds across all categories.
10. **Lab-resident custom tessellations** (Option B). New tessellation
    categories (mandala, composition) and any future custom work live
    exclusively in Lab. Specialised strand renderers per category.
    No Main-mode bridge.

### Safe defaults applied to remaining open questions

- **Mode switcher.** Button in the existing sidebar header (top-left,
  next to the desktop collapse button). No URL routing.
- **State isolation.** Lab uses its own `PatternConfig` instance; Main
  state is preserved across mode toggles.
- **Persistence.** Lab reuses the existing JSON `saveJSON` / `loadJSON`
  format until Step 14 introduces the localStorage library.
- **Mandala canvas centre.** Always (0, 0). No user-positioned mandala
  in v1.
- **Mandala layer rotation.** Each layer auto-rotates so its primary
  axis aligns with the outer layer's. No manual rotation slider in v1.
- **Region geometry.** v1 central region is always a regular polygon
  matching the centre's outer fold (16-fold centre → 16-gon region).
- **Build/CI.** Each step ends with `npm run build` (type-check +
  production build) green. Existing `*.test.ts` files keep passing.

---

## Open question registry

These are decisions deferred to the step that *actually needs them*. Do
not pre-resolve. When a step's "Open question" block fires, surface it
to the user; do not silently pick.

| ID    | Question                                                                 | Decide at  |
|-------|--------------------------------------------------------------------------|------------|
| MQ-1  | Mandala layer rule — does any target preset require relaxing strict divisor to common-divisor? | Step 5     |
| CG-1  | Composition relative scale between centre and background — user slider, auto-fit, or fixed-ratio per pair? | Step 7     |
| FS-1  | Composition frame stroke — colour / weight / on-off — minimum UI? | Step 7     |
| LX-1  | Lab strand controls (archimedean / rosette-patch) — same surface as Main, or trimmed Lab variant? | Step 11    |
| MS-1  | Mandala strand renderer — per-layer contact angle only, or per-layer × per-tile-type? | Step 12    |
| CS-1  | Composition strand-match allow-list — provenance verification gate before any pair ships. | Step 13    |
| ID-1  | Visual identity / divergence between Main and Lab once both decorate. Decide policy when divergence becomes visible. | Step 11+   |

---

## Step-by-step plan

Legend: **[S]** small (≤ 1 day), **[M]** medium (1–3 days), **[L]** large
(3+ days). Status: ✅ done · 🟡 code-complete pending sign-off · ⏳ todo.

### Phase A — Tessellation engines (polygons only)

#### Step 1 — Tessellation Lab scaffold [S] · ✅
Lab toggle in sidebar header. Independent `PatternConfig` per mode.
Switching modes preserves both states.

#### Step 2 — Port existing tessellations into Lab [S] · ✅
Lab dropdown lists all 16 existing tessellations grouped by fold-symmetry.
Selecting one renders the polygon tessellation; "Show strands" toggle
optionally overlays the strand pattern. Scale slider, "Reset to defaults"
button (note: re-dispatches `SET_TILING_TYPE`, which reloads the full
`defaultConfig`, not just the contact angle — label corrected to match),
Info panel.

> **Carry-over fix:** the button currently says "Reset to default angle"
> but reloads the whole default config. Rename to **"Reset to defaults"**
> when next touched. Tracked as a small follow-up; not blocking.

#### Step 3 — Hexadecagonal-rosette tessellation (16-fold) [S] · ✅
**Visible:** new tessellation "Hexadecagonal Rosette" appears under
"16-fold" in the Lab dropdown. Renders the polygon arrangement
underlying the central rosette of historical 16-fold examples.

- Add `'hexadecagonal-rosette'` entry to `tilings/index.ts`
  (vertex config `[16, 4]` — verify against `RESEARCH-TILING-CONFIGURATIONS.md` §2.5)
- Tile types: 16-gon centre, thin rhombus ring, square fillers
- Add to `SYMMETRY_GROUPS` as fold-16
- Default contact angle 78.75° in `defaultConfig`
- Append findings to `RESEARCH-TILING-CONFIGURATIONS.md` working log

**Acceptance:** strands off, polygon arrangement matches the underlying
tile arrangement of a known 16-fold example. Strands on, the visible PIC
pattern matches that example's central rosette.

> **Note (2026-04-27):** Implemented with a single `4` tile-type id
> covering both the rhombus ring and any square fillers, because the
> BFS in `archimedean.ts` keys polygons by `String(sides)` and does not
> distinguish ring rhombi from corner squares. Splitting them visually
> would require custom `tileTypeId` assignment in the BFS — deferred
> until a strand renderer (Phase B) actually needs it. Awaiting visual
> sign-off in the browser.

#### Step 4 — Tessellation preset catalogue [S–M] · ✅
**Visible:** "Presets" dropdown at the top of the Lab sidebar lists
named tessellations. Selecting one loads a complete `PatternConfig`
snapshot (tessellation type + scale + per-tile contact angles).

- Catalogue file `state/labPresets.ts`
- v1 entries are **tessellation-named only** — drop strand-pattern names
  like "Khatem Sulemani" until those become composable in later steps.
  Initial 6–8: `Square (4,4)`, `Square-Octagon (4.8.8)`,
  `Hexagonal (6,3)`, `Trihexagonal (3.6.3.6)`, `Truncated Hex (4.6.12)`,
  `Triakis Trunc Hex (3.12.12)`, `Decagonal Rosette`,
  `Hexadecagonal Rosette` (added in Step 3).
- Lab sidebar: dropdown above tessellation selector, "Load preset" button

**Acceptance:** user can produce 6+ distinct tessellations by selecting
presets only.

#### Step 5 — Layered mandala tessellation engine v1 [M] · ✅
**Visible:** new entry "Layered Mandala" in the Lab "Tessellation"
dropdown. Layers panel: pick outer fold-order (4/6/8/10/12/16) and add
1–4 inner layers. Inner-layer fold dropdowns filtered by the strict
divisor rule. Each layer has a scale slider. Canvas renders the stack
of regular polygon rings, all centred at canvas origin.

- New tessellation category `'mandala'` in `TilingDefinition`
- New module `tilings/mandala.ts`:
  `MandalaConfig = { outerFold, layers: [{ fold, scale }] }` →
  `Polygon[]`. *Note: contact-angle field deliberately omitted at this
  step — strand rendering for mandala arrives in Step 12.*
- Strict-divisor validation in the UI (disable invalid options)
- Auto-rotation: each layer's primary axis aligned with outer
- Sidebar: new "Layers" panel UI (only when "Layered Mandala" is
  selected)

**Open question MQ-1 (decide at this step):** does any target preset
from Step 6 actually require relaxing strict divisor to common-divisor?
Build the strict-divisor engine first; if a target preset breaks under
it, surface MQ-1 to the user before loosening.

**Acceptance:** can build a 16+8+4 mandala by clicking three dropdowns;
the polygon rings visibly nest and align before strands are turned on.

> **Post-Step-5 polish (2026-04-27, commit `46dd7c5`):** three bugs
> surfaced on first use:
> - **Lab state was lost on mode toggle** because the Lab held its own
>   `useReducer` and unmounted on flip — fixed by lifting `PatternConfig`,
>   `showStrands`, and `activePresetId` up to `App.tsx`. New
>   `state/labDefaults.ts` exports `LAB_DEFAULT_CONFIG`.
> - **Header title overlapped the absolutely-positioned mode + theme
>   toggle buttons** — fixed by bumping the h1 `marginTop` to 48 px.
> - **Mandala rendered tiny and not centred** because it places polygons
>   at world `(0, 0)` while the camera defaulted to viewBox `(0, 0)–(w, h)`.
>   `usePanZoom` now accepts `initialX/Y`; `Canvas` seeds them to `-size/2`
>   so world origin sits at canvas centre. The reducer also bumps `scale`
>   from 100 → 250 px on first entry to mandala mode (mandala uses scale
>   as outer-ring radius), and the Lab slider max is 600 for mandala.

#### Step 6 — Mandala preset catalogue [S] · ✅
**Visible:** Step 4 Presets dropdown gains a "Mandalas" sub-section with
3–5 prebuilt layered tessellations. *Strict-divisor only at this step;
if MQ-1 fires, the preset list shrinks rather than the rule loosens.*

- `labPresets.ts` mandala entries with full `MandalaConfig`
- Initial: `Octagonal (8+4+2)`, `Hexagonal (12+6+3)`,
  `Sultan Hassan (16+8+4)`, `Decagonal (10+5)`

**Acceptance:** at least 3 mandala presets render correctly with strands
off; with strands on, polygons still render correctly even though the
mandala-aware strand renderer (Step 12) isn't shipped yet — strands fall
back to per-tile-type rendering and *should look broken*. That's OK at
this step; Step 12 fixes it.

#### Step 7 — Region-stitching v1, hard-frame only [M] · ✅
**Visible:** new tessellation category "Composition" in the dropdown.
Centre picker (any single tessellation) + Background picker (any single
tessellation). Canvas renders the central tessellation clipped to a
regular polygon region matching the centre's fold; the background
tessellation fills the viewport minus that region. A frame line is
drawn at the boundary.

- New tessellation category `'composition'` in `TilingDefinition`
- New module `tilings/composition.ts`: takes
  `CompositionConfig = { centre, background, regionRadius, frameStyle }`
- SVG `clipPath` for the central region (regular polygon)
- Inverted `clipPath` for the background
- Frame stroke as a separate SVG `<polygon>` overlay
- Lab sidebar: "Composition" panel — two pickers + region-radius slider
  + minimum frame-style controls (FS-1 below)

**Open question CG-1 (decide at this step):** when centre and background
have different natural scales, who decides the relative scale? Options:
(a) one scale slider per side, (b) auto-fit (centre's circumradius =
integer number of background tile-edges), (c) fixed-ratio per pair from
a hardcoded table. Conservative default: (a) two sliders, no auto-fit.
Surface CG-1 if user wants smarter behaviour.

**Open question FS-1 (decide at this step):** frame stroke surface area.
Conservative minimum: a frame on/off toggle and a single colour swatch
that defaults to `var(--accent)`. No weight slider. If the user wants
more, surface FS-1.

**Acceptance:** can compose `hexadecagonal-rosette` centre + `4.8.8`
background, see clean polygon match within each region and a visible
frame at the seam. Strand-match isn't shipped yet (Step 13); strands
turned on at this step show both halves' strands clipped at the frame.

#### Step 8 — Composition preset catalogue (hard-frame) [S] · ✅
**Visible:** Presets dropdown gains a "Compositions" sub-section. All
hard-frame at this step.

- 3–4 entries: `16-in-4.8.8`, `12-in-Hexagonal`, `16-in-Square`,
  `10-in-Hexagonal`

**Acceptance:** at least 3 composition presets render with hard frames.

---

### Phase B — Strand rendering in Lab

#### Step 9 — Lab polish [S] · ✅
- Persist last-used Lab tessellation + scale to localStorage
- Tessellation outline weight slider in Display section
- Optional fill-on-hover for tile types

#### Step 10 — Lift `FigureControls` into a shared component [S–M] · ⏳
**Visible:** no behavioural change in Main. Internal refactor only.

- Extract `FigureControls` from `Sidebar.tsx` into
  `components/strands/FigureControls.tsx`
- Component takes a generic `dispatch` and a generic `figures` map; no
  hardcoded coupling to Main's reducer
- Existing Main usage: identical render, identical wiring
- Pre-req for Step 11

**Acceptance:** Main's strand controls render and behave identically
before/after the lift. `npm run build` green.

#### Step 11 — Strand controls in Lab for archimedean / rosette-patch [M] · ⏳
**Visible:** Lab's Display section gains a "Strands" panel using the
shared `FigureControls`. Active only for `archimedean` and
`rosette-patch` categories. Mandala / composition show a "Specialised
strand renderer pending — see Step 12 / Step 13" placeholder.

- Reuse `state/reducer.ts` actions for figure-config edits — Lab's
  reducer is the same module
- Strand toggle stays the entry point: turning it off hides the panel

**Open question LX-1 (decide at this step):** same controls as Main, or
trimmed for Lab? Conservative default: same controls, identical surface
— no need to re-decide what already works in Main. Surface LX-1 if user
prefers a trimmed variant.

**Open question ID-1 (decide at this step):** Lab and Main now both
decorate archimedean tessellations. Visible divergence policy?
Conservative default: Lab and Main render identically because they share
the strand component. If divergence appears, treat as a bug.

**Acceptance:** in Lab with strands on, picking `4.8.8` and tuning the
contact angle behaves indistinguishably from Main.

#### Step 12 — Specialised mandala strand renderer [M] · ⏳
**Visible:** turning strands on while a Layered Mandala is selected
produces the expected concentric rosettes. Per-layer contact-angle
control inside the Layers panel.

- New module `tilings/mandala/strand.ts`
- Per-layer contact-angle field added to `MandalaConfig.layers[i]`
- Renderer dispatches PIC pipeline once per layer, using per-layer
  contact angle (not per-tile-type)

**Open question MS-1 (decide at this step):** per-layer contact angle
only, or per-layer × per-tile-type? Conservative default: per-layer
only. Surface MS-1 if a layer needs differentiated tile-type angles.

**Acceptance:** Step 6's `Sultan Hassan (16+8+4)` preset, with strands
on, produces three nested concentric rosettes that look right.

#### Step 13 — Composition strand renderer + match-up boundary mode [L] · ⏳
**Visible:** the Composition panel gains a "Boundary" toggle:
*Match strands across boundary* (default for verified pairs) /
*Hard frame*. When "Match" is selected and strands are on, strands
crossing the seam connect smoothly.

- New module `tilings/composition/strand.ts`
- Background dropdown filtered to verified-compatible centres
- "Show all backgrounds" toggle unlocks the full list; incompatible
  pairs silently fall back to hard frame with a tooltip

**Open question CS-1 (gate this step — do not start without):**
the strand-match allow-list MUST be analytically verified pair-by-pair
before any of it ships. Speculative pairs ship as hard-frame fallbacks,
not as match-up entries. Surface CS-1 to the user at the start of this
step with the verification status of each candidate pair.

**Acceptance:** at least one verified pair (e.g.
`hexadecagonal-rosette` centre + `4.8.8` background, *if verified*)
renders with strands crossing the seam smoothly. Unverified pairs
default to hard frame.

---

### Phase C — Persistence

#### Step 14 — Lab-local library [M] · ⏳
**Visible:** Lab sidebar gains "Save", "Rename", "Delete", "Duplicate"
controls. A "My tessellations" section in the tessellation dropdown
lists saved entries. **Library is Lab-only — no surfacing in Main.**

- New module `state/customTessellations.ts`:
  ```ts
  interface SavedTessellation {
    id: string                // uuid
    name: string
    createdAt: number
    config: PatternConfig
    sourceCategory:
      | 'archimedean' | 'rosette-patch' | 'mandala' | 'composition'
  }
  ```
  Stored in localStorage under `lab-tessellations-v1`. Schema-versioned.
- Existing JSON `saveJSON` / `loadJSON` remain canonical for sharing as
  files
- Quota / corruption: catch quota errors, surface to user, never crash;
  failed JSON.parse on load → entry skipped + console warning

**Acceptance:** save 3 tessellations across categories, reload browser,
all three persist. Delete one; it's gone.

---

### Optional / Future steps (parked)

These appear after Step 14. Reorder by demand at that point.

- **Step 15 (opt) — k-uniform tessellation generator.** Generalise
  `tilings/archimedean.ts` BFS to handle multiple vertex orbits.
- **Step 16 (opt) — Quasi-periodic generators.** Penrose P3, Ammann–
  Beenker, Stampfli/Socolar. New `category: 'quasiperiodic'`.
- **Step 17 (opt) — User-editable tessellations.** Drag-and-drop polygon
  placement, vertex-config editor. Persistence via the Step 14 library.
- **Step 18 (opt) — Girih substitution tile set.** Lu & Steinhardt 2007
  fivefold system. Combines with Step 16 for Darb-i-Imam-style patterns.

### Future ideas (already in memory)
- `project_mandala_cheap_path_idea.md` — BFS depth=0 single-rosette mode
- `project_mandala_common_divisor_idea.md` — permissive layer rule (this
  is the natural answer to MQ-1 if strict divisor proves too tight)
- `project_mandala_anchor_only_idea.md` — most permissive layer rule
- `project_free_arrangement_idea.md` — drag-and-drop multi-tessellation
  canvas
- `project_forgiving_overlap_idea.md` — third boundary mode

---

## Working log

- **2026-04-25** — Plan v1 drafted from grill-me interview, under wrong
  terminology assumption.
- **2026-04-26 (am)** — Terminology corrected (tessellation = polygons,
  strand = PIC line). Plan rewritten as v2.
- **2026-04-26 (pm)** — Critical review surfaced 17 issues. v2 of the
  plan promoted custom tessellations into Main, which proved
  structurally awkward. User picked Option B: keep custom tessellations
  in Lab end-to-end with specialised strand renderers per category.
  Plan rewritten as v3:
  - Old Step 11.5 (Promote to Main) deleted.
  - Old Step 16 (Port Lab to Main) deleted.
  - New Phase B in Lab: lift `FigureControls` (Step 10), enable strand
    controls in Lab for known-good categories (Step 11), specialised
    mandala renderer (Step 12), specialised composition renderer with
    strand-match (Step 13).
  - New Phase C: Lab-local library (Step 14, replaces v2 Step 11.5's
    persistence work but with no Main-mode bridge).
  - Open questions consolidated into a single registry, deferred to the
    step that actually needs them rather than pre-resolved.
  - Conservative defaults applied (strict divisor kept, two-slider
    composition scale, minimal frame UI, allow-list gated on
    verification, library Lab-only).
- **2026-04-27** — Steps 3, 4, and 5 shipped (`a43b787`, `3b209e2`,
  `304100a`). Post-Step-5 polish (`46dd7c5`) lifted Lab state to App,
  fixed title overlap, and centred the canvas on world origin to fix
  the mandala layout. Steps 1–5 visually signed off by user; Step 6
  awaiting green light.
- **2026-05-02** — Step 6 shipped. Four mandala presets added
  (`Octagonal 8+4`, `Hexagonal 12+6+3`, `Sultan Hassan 16+8+4`,
  `Decagonal 10+5`). Preset dropdown grouped via `<optgroup>` into
  "Tessellations" and "Mandalas". MQ-1 evaluation: strict divisor
  was sufficient for the three multi-layer targets; Octagonal's
  nominal `2` ring is below the polygon engine's n≥3 floor (not a
  divisor issue), so the preset shrank to `8+4` per plan guidance.
  MQ-1 remains deferred — no target preset has yet forced
  common-divisor.
- **2026-05-02** — Step 7 shipped. New composition category +
  `tilings/composition.ts` engine + `<clipPath>`-based per-region
  rendering in `PatternSVG`. CG-1 resolved as (a) two scale sliders;
  FS-1 resolved as (a) on/off + colour. Auto-fit / fixed-ratio and
  weight / dash / inset / contrast variants parked as `/idea` memory
  entries. Strands turned on at this step show both halves' strands
  hard-clipped at the seam — strand-match across boundary arrives in
  Step 13.
- **2026-05-02** — Step 8 shipped. Four composition presets added
  (`16-in-4.8.8`, `12-in-Hexagonal`, `16-in-Square`, `10-in-Hexagonal`).
  Lab Preset dropdown gains a third optgroup "Compositions". Visuals
  work but aren't yet pleasing — sign-off accepted, refinement
  deferred (likely covered by Step 13 strand-match and/or the parked
  CG-1/FS-1 expansion ideas).
- **2026-05-02** — Step 9 shipped. `state/labDefaults.ts` now exports
  `loadLabState`/`saveLabState` against `lab-state-v1` localStorage
  key (envelope: `{ config, showStrands, outlineWidth, fillOnHover }`).
  App seeds Lab state from `loadLabState()` on boot and persists on
  every change via `useEffect`. `TileLayer` now accepts
  `outlineWidth` (default 0.8) and `fillOnHover` (default false);
  hover state is local. Lab Display section gains an Outline weight
  slider (0.2–4 px) and a "Fill tile on hover" toggle. Phase A
  (engine work) complete — Phase B (strand rendering) starts at
  Step 10.
