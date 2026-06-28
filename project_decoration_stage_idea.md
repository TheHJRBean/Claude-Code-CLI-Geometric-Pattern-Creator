---
name: Decoration stage
description: Final stage for line colours, gap fills, reintroduced strand weaving, and future image manipulation — distinct from pattern generation
type: project
originSessionId: 9e40622f-3ddd-4132-8abe-5ba69e6dbb05
---
**Status: FULL ADR-0005 LADDER DELIVERED (2026-06-10) — patch + instance + cell ("Twins") rungs shipped; ⏳ browser-verify Twins. Image tools still ahead.**

**2026-06-12 Frame border stroke + strand line styles (`060ed73`, `f8a68b6`, ⏳ verify)** — `FrameConfig.stroke` (the ADR-0004 "styling defers to Decoration" slot): toggle/width/colour in the Decoration panel, replaces the accent guide, exports as drawn; frame node dots hidden in Decoration. `StrandStyle.lineStyle` solid|double|triple|dashed|dotted: double/triple = centre-cut mask so fills show through between parallel lines (mask excludes 'none'-hidden strands); selects in Gallery Sidebar + Lab Display. ⚠ confirm mask tiles correctly through fast-path `<use>` clones. `2a2a3cb`: same five styles on the Frame border (`FrameStroke.lineStyle`, Border style select in Decoration panel, `FrameBorder` component w/ own centre-cut mask, migrateFrame validates). `d6b9df8`: Lab Display gained a Strand width slider ("Outline weight" → "Tile outline weight" — user mistook it for strand weight w/ dashed strands).

**2026-06-12 removing strand paint now HIDES the strand (`3e8f7ea`, ⏳ verify)** — user: removal left "a gap between the voids". Void fill faces touch EXACTLY at strand centrelines (proven headlessly: `scripts/repro-void-gap.mts` + `@resvg/resvg-js` devDep → `/tmp/voidgap-*.png` — useful pattern for future no-browser visual repros); the "gap" was removal reverting strands to global `strand.color`, a band painted OVER the fills. Now removal stores the **`'none'` sentinel** colour (ordinary ColourRecord; StrandLayer skips those paths); "Restore strands" button deletes the record (back to global line work); "Remove strand colour" offered even with no record. Per-strand same-colour unpaint falls back to `'*'`=`'none'` ⇒ vanishes. Model: **fills touch, strands overlay only when painted.**

**2026-06-12 curve-insensitive Void identity DELIVERED (`852f75c`, user-picked design)** — paints survive curve toggles/edits: Void signature + keys derive from the STRAIGHT field (`keyPolygon`); curved outline only renders (`pairCurvedOutlines` nearest-centroid pairing, both fast + non-fast paths). Matches how strand colours always worked. One-time break for records keyed on curved sigs. Also fixed `9459970`: frame completion tile types were missing from the Composition tile-types panel (their figures were stuck at default — "couldn't curve some gons"). ✅ user-verified 2026-06-12 ("repainted and changed curves, colours held").

**2026-06-12 perf chain (user on a FRAMED patch; strand painting + colour picker ✅ confirmed):** `175b94f` non-fast-path strand hits hoisted per-strand (entering Strands target froze — cellOrbitKey ran per SEGMENT) → `2fedc2f` √2-bucketed generation zoom (zoom rebuilt the world per tick; 2fps with 17ms frames = time-sliced deferred render) → `1936576` frame-keyed field (`frameFieldBox`: frame bbox + margin replaces the moving viewport when a frame filters ⇒ pan/zoom reuses PIC ×2/extraction/weave) + field-keyed `nonFastVoidData`/`nonFastStrandHits` memos + `keyVoids`/`colourVoids` split in resolve.ts (Paint-target switches + paints no longer re-extract). ✅ user-verified ("much better"). Residual known: frame reposition rebuilds per drag tick; whole-frame field built once even when viewing a corner.

**2026-06-11 fixes (⏳ browser-verify both):**
- **"Matching leaves a few odd voids unpainted" FIXED `f8eba74`** — congruent class split when a true edge length/angle sat ON a signature-quantisation rounding boundary (float noise rounds either way per instance). `extractVoids` now canonicalises field-wide: tolerance-congruent classes (half-snap raw-ring compare, rotation+reflection) share the lexicographically-smallest member signature; downstream scope keys inherit it. Probes `1d71ce8` (voidsSplitProbe + repHoleProbe, now regression tests) ruled out rep-coverage holes + splits on 9 default-ish fields — repro needed the user's authored patch. Residual non-fast-path edge: canonical sig = min over *present* members, so panning could in theory orphan a record if all instances of the min-variant leave the bound (fast-path reps are pan-independent → stable).
- **Strands paint-target freeze FIXED `f7bb666` + `175b94f` (2026-06-12)** — TWO halves. (a) `f7bb666`: selecting the Strands target mounted one SVG `<line>` per hit segment per visible stamp (tens of thousands of elements → tab freeze, "timed out"). Now: data-side math hit-test via one catch-all rect (≈6px screen radius, off-strand clicks fall through to pan) + single-`<path>` hover highlight (the 'All' reach used to re-mount the whole field as highlight lines too). (b) `175b94f`: user reported "still crashes" — the NON-fast-path branch (frame / vertex lines / rotated stamps) built hit data with `cellOrbitKey` (whole-chain dihedral canonicalisation) + `orbitOffset` + `reduceToOrbit` inside the per-SEGMENT loop; hoisted to per-strand (mirrors fast-path `baseStrandIds`). **Lesson: per-strand identity work must never sit in a per-segment loop — audit both fast-path AND non-fast-path branches when fixing usePattern perf.** Void hit-paths (one per void × stamp) still DOM-per-element — fine so far, candidate for same treatment if zoom-out painting ever lags. ⏳ browser-verify.

**Eye dropper added 2026-06-12 (`cf555a0`)** — native EyeDropper API button in the Paint-colour row (picks from the whole screen incl. the canvas); hidden on Firefox/Safari (no API). ⏳ browser-verify.

**Colour picker upgrade DELIVERED 2026-06-11 (`ecdccb1`)** — `src/components/ColourPicker.tsx` replaces the bare paint-colour input: 5 built-in colour themes + user theme creation (add/remove swatches, delete; localStorage `user-colour-themes` / `active-colour-theme`), validated hex entry, and Recent colours (last 10 actually *painted* with — `pushRecentColour` called at the paint dispatch sites, not on picker interaction; module store + `useSyncExternalStore`; localStorage `recent-paint-colours`). ⏳ browser-verify.

**Lacing v2 DELIVERED 2026-06-10** — shipped as a global Strand-style toggle (`strand.weave` + `weaveGap`), NOT a Decoration record: Taprats `Interlace`-style BFS 2-colouring of crossing visits (`src/strand/weave.ts`) + arc-length gap cuts in the under thread (`src/strand/wovenPathD.ts`). Works in Gallery + Builder; gaps are path breaks so Void fills show through; per-strand Decoration colours compose. ⏳ browser-verify. A future per-crossing or per-strand weave override could still live under Decoration.

**2026-06-12 angled-cut gap ends (`c7aa7f6`, ⏳ verify)** — user: shallow-angle crossings made gap ends look "extra close or extra far apart" (perpendicular round cap corners sit unevenly vs the over thread). Cuts deepened to `(width+gap)·factor` (round cap then tangent-or-behind the mitre face) + each gap end dressed with a filled **wedge quad** whose outer face runs parallel to the over thread at uniform clearance `width/2 + gap` (`weaveCapWedgeD`; `wovenPath` returns exact post-split `GapCap`s with gap-owner tracking through merges; `UnderCut` now carries crossing point + over dir). Solid line style only — dash gaps / double-triple centre mask would fight solid wedge fills, those keep the plain cut. Known degradations: factor clamp (sin<1/3) lets the cap poke slightly past the face at near-parallel crossings; face position uses the straight-line frame (same approximation as cut positions).

Cell rung (`926c0f2`+`37600c1`): `decoration/cellScope.ts` — symmetry frames from boundary outlines (no shape metadata), canonical D_n-orbit keys; Reach = Matching·Twins·Repeat·Single (voids) / All·Matching·Twins·Single (strands).

Stage 2 (2026-06-10, `076ef75`→`92d43a5`): per-target **Reach** selector — Voids: Matching (congruent) / Repeat (patch = Lattice orbit) / Single (one world Void, rendered via split `<use>` stacks so it stays under Strands); Strands: All / Matching (congruent signature via `decoration/strandGroups.ts`) / Single (patch orbit — still repeats with the Patch, periodicity preserved). `decoration/scopes.ts` = positioned keys + colour index (precedence instance>patch>sig>'*'). Same-colour repaint now toggles a record off everywhere. Per-strand strokes resolve in StrandLayer from records. Patch keys are mode-stable (orbit ring reduction). Deferred: `cell` rung (Cell-symmetry orbit), world-instance strands. See plan Step 19 "Stage 2" + SESSION_STATE 2026-06-10.

---
**Earlier status: STAGE-1 DELIVERED (2026-06-06) — "functioning broadly as intended" (user).**

Stage 1 shipped (Steps 19.0–19.3, see `TESSELLATION_REVAMP_PLAN.md` + `SESSION_STATE.md`): Decoration Phase in the Builder switcher; Paint mode (Off · Voids · Strands) with bucket cursor, congruent-group hover highlight, click-to-Fill; "Colour all Voids" / "Colour all strands" bulk; strand-colour override; undo. Voids = global strand-arrangement faces (`src/decoration/voids.ts`, spatial-grid broad-phase), congruent shape-signature grouping, collinear-robust. Fills tile the whole field via the periodic fast-path (cloned fragment, **multi-cell supported**) — no per-view extraction. Perf chain `c68ef85`→`6cd5ca1`. Remaining: first-paint one-time lag; curved zoomed-out; multi-cell composition seam double-check; Stages 2+ below (Patch/Cell/Instance scopes, lacing v2, image tools).

---
**Status: SCOPED (Stage-1 model grilled 2026-06-06 → CONTEXT.md + ADR-0005 + ADR-0003 amendment)**

Decisions locked (see `docs/adr/0005-decoration-void-and-grouping.md` + CONTEXT entries Void / Fill / Grouping scope / Paint mode):
- **Builder-only Phase** (data on `editor.decoration`); Gallery NOT decorated — keeps global `StrandStyle`. (Rejected: universal Gallery+Builder finishing stage — the framing below is superseded.)
- Two targets: **Strand colour** + **Void Fill**. A **Void** = a bounded face of the *global* strand arrangement (can span tiles; 4-tile background = ONE Void), NOT per-tile clipped.
- **Grouping scope** ladder, independent per target: Congruent → Patch → Cell(symmetry) → Instance; one `{scope,key,colour}` record, identity-keyed (pan-stable). **Stage 1 = Congruent only** for both.
- Bound = **Frame preferred but NOT required**; viewport fallback works because keys are identity not position (relaxes ADR-0003 → amended).
- Interaction = **Paint mode** (Paint tool, bucket cursor, active colour); click applies to the whole congruent group; faint affected-group highlight on hover (perf-gated; else on first click).
- **Strand colour** = new `editor.decoration` record that *overrides* `StrandStyle.color` for Builder render (StrandStyle stays Gallery default/fallback).

**OPEN (biggest risk, deferred):** global Void face-extraction algorithm (planar arrangement / half-edge over all Rays incl. Bézier curves) — current pipeline only emits per-polygon `Segment[]`. Also deferred: lacing/weaving v2, default palette, Patch/Cell/Instance rungs.

--- original capture (some framing superseded above) ---

A dedicated "Decoration" stage that runs **after** pattern generation (and after the Framing stage — see sibling idea). Purpose: turn the geometric pattern into a finished visual by adding colour, fills, weaving, and other surface treatments.

Initial scope to capture:
- **Line colour control** — per-strand or per-region colour pickers; not just the global stroke colour we have today.
- **Gap fills** — fill the polygonal gaps between strands with colour / pattern / gradient.
- **Strand weaving (reintroduced)** — current lacing/weaving implementation should be **removed first** (per existing `feedback_lacing.md` memory: "lacing has never worked"), then redesigned and reintroduced cleanly inside this stage.
- **Future image manipulation tools** — placeholder; not scoping now. Examples could include textures, blur/glow, paper backgrounds, export-time effects.

**Why:** The current app conflates geometry and decoration — colour and weaving live as ad-hoc options on top of the generator instead of as a discrete finishing stage. Splitting decoration off makes the geometry pipeline cleaner, gives weaving a chance to be done properly, and creates a clear extension point for future visual-effect tools.

**How to apply:**
- Add a `decoration` block to `PatternConfig` (optional). Frontend stage sits last in the pipeline: Pattern → Framing → Decoration → Export.
- **Step 1 — remove existing lacing/weaving:** the current implementation is broken (see `feedback_lacing.md`); rip it out before adding the new stage so we're not fighting old code.
- **Step 2 — line colour:** extend strand model so each strand (or strand class) carries a colour; UI is a panel listing strand groups with swatches.
- **Step 3 — gap fills:** identify polygonal gaps in the pattern (interior cells bounded by strand segments) and let the user paint them.
- **Step 4 — strand weaving v2:** redesign over/under from scratch as a property of the decoration stage, not the geometry pass.
- **Step 5+ — image manipulation:** parked; capture as sub-ideas when scoped.
- Pair with the Framing stage so the two together form the post-generation finishing pipeline.
