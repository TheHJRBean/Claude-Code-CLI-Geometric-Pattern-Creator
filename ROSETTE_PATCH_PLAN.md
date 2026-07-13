# Rosette-patch figure architecture + star tilings

Status: **Steps 0–4 DONE 2026-07-13** — Step 0 spike PASSED (findings below); Steps 1–2 shipped `f42dce7` (#20/#21); Step 3 shipped `70945eb` (#22 — `src/pic/rosettePatch.ts` + tests); Step 4 shipped `09187d8` (#23 — wired into `usePattern` via the new `runPICForCategory` seam, 6 old goldens retired, smoke-tested). Next: Step 5 (#24, audit-first). Step 3 decisions: fixed-length + vertex-lines inherit runPIC semantics (shared helpers exported from `pic/index.ts`); decagonal `6.3` residual accepted as weave, also present at θ=80 (documented test exclusion).

## Step 0 findings (2026-07-13, spike run in-session, scratch file deleted per plan)

**VERDICT: construction validated — proceed to Steps 1–3.** Visual before/after:
https://claude.ai/code/artifact/1a7f53ae-b3dc-4b5d-be16-96a6233ce803

The validated construction ("v3, λ=0" in the spike) — **bisector-anchored star figure**:

For each vertex k of the polygon (winding via signed area):

1. **Interior bisector line** at V_k: `bis = normalize(toPrev + toNext)`, flipped when the
   vertex is reflex (local turn sign ≠ winding sign); straight (180°) vertices use the
   inward edge normal.
2. **Pair-A probe**: the two contact rays converging at V_k (minus-ray of prev edge,
   plus-ray of curr edge — same indexing as `pairAtVertex`) are each intersected with the
   bisector **as line∩line** (`rayRayIntersect` t-values used raw, no sign rejection).
   The pair is *converging* iff every intersection has ray-param `t2 > −ε` AND bisector
   offset `t1 > ε`.
3. **Pair-B fallback**: if pair-A isn't converging, probe the mirrored pair (plus of prev,
   minus of curr — same origins). This reproduces the classical concave-star switch
   (rhombille 120° vertices at θ=72 need it). If neither converges, use pair-A clamped ≥ 0.
4. **Tip** `T = V + bis·s` where `s = min(offset₁, offset₂)` — **min rule, not mean**
   (mean drags arms sideways on uneven vertices → crossings on kisrhombille θ≥60).
5. **Caps on s**: (a) boundary-exit distance along the bisector (skipping the two incident
   edges); (b) the centre-projection `(center−V)·bis` when positive — regular-safe since a
   regular polygon's natural tip only reaches the centre at θ=90°; (c) **reflex vertices:
   s = 0** — tip pinned AT the notch vertex (λ·sExit for λ>0 sends bowtie/gap-star tips
   across the waist → rule-invariant crossings; λ=0 cleaned every reflex case).
6. Emit 2 segments per vertex: each pair ray's `origin → T`, same `Segment` shape/tags as
   today (`kind: 'star-arm'`, per-ray `side`). Figure is closed by construction (every
   edge midpoint anchors exactly 2 arms). No `pointInPolygon`, no `t≤0` branches, no
   edge-slide, no per-ray fallback.

**Results:**
- **Kepler baseline exact**: square@67.5 (968 segs), hexagonal@60, square@45… segment-for-
  segment identical to `runPIC` (regular polygons: both offsets coincide with the natural
  pair-A tip). Exception: θ landing exactly on the collinear-ray singularity (square@45,
  triangles@60) — runPIC dedups collinear duplicates there; `rosettePatch.ts` must port
  `dedupPolygonSegments` (or equivalent) for those θ.
- **Grand matrix 106/108 clean** (12 taprats tilings × 9 θ values; clean = 0 arm crossings,
  0 tips outside, 0 non-finite, all figures closed). All plan-named cases (kisrhombille,
  floret, tetrakis, cairo@27.5, tetrakis@46) clean at every θ.
- **Concave validated** on the real reflex reproducers — nonagonal-rosette 5-gon and
  decagonal-rosette bowtie (plan originally said deltoidal-trihexagonal, which is a convex
  kite — amended). Gap-star polygons (hendecagonal 16-gon, hexadecagonal 12-gon) clean.
- **Sole residual**: decagonal-rosette convex hexagon `6.3` at θ ∈ {67.5, 72} — adjacent
  vertex tips interleave (172 crossings). λ/rule-invariant. Carry into Step 3 as a known
  tuning item (candidates: mutual-trim polish pass, or accept — crossings render as weave).

**Step 3 implementation notes:** helpers needed = signedArea/winding, reflex test,
interiorBisector, boundaryExitDist; everything else reuses `computeContactRays` +
`rayRayIntersect`. Fixed-length (`autoLineLength: false`) and vertex-lines paths were NOT
spiked — Step 3 must decide whether to inherit runPIC behaviour for those or extend the
construction.

## Context

The Gallery's irregular Laves tilings (kisrhombille, floret-pentagonal, deltoidal-trihexagonal, cairo-pentagonal, tetrakis-square, rhombille, N-gonal-rosette variants — all generated via `src/tilings/tapratsTiling.ts`, `category: 'rosette-patch'`) share the *same* generic PIC figure-construction (`runPIC` in `src/pic/index.ts`) as regular Archimedean tilings. That generic construction solves for figure geometry via ray-ray intersection, which has no clean answer on irregular polygons — producing two degenerate cases ("asymmetric pair": a ray points backward; "outside-polygon": the intersection point falls outside the tile). A `figureRouting: 'auto'|'edge'|'centroid'` config field (never exposed in UI) gates a fallback for both, but it's an acknowledged stopgap that surfaces the tradeoff rather than resolving it.

The fix, per prior project research (RESEARCH-TILING-CONFIGURATIONS.md §10-11) and Craig Kaplan's original Taprats reference implementation: irregular/rosette tilings should use a **bespoke, constructed** star-figure (built directly from the tile geometry, no ray-intersection, no degenerate cases by construction) instead of the generic solve. Building this also unlocks three new historically-named Gallery tilings (David's, Kepler's, Archimedes' Star) as a special case of the same machinery, and lets the long-parked `pic/index.ts` branch-ladder refactor ride along once the irregular-polygon-specific branches it exists for are no longer load-bearing.

This is flagged as the hardest geometry work on the roadmap (~2-3 weeks). The plan below sequences it as 6 independently-shippable steps, front-loading a throwaway geometry spike before committing to any permanent abstraction, and separating "build the new figure constructor" from "flip usePattern over to it" so a regression has a small, revertible diff.

Prerequisite (done): Gallery↔Lab convergence epic (tickets #1-#8, all closed) — new star-tiling presets land into the unified Lab surface rather than the legacy Gallery.

## Step 0 — Spike: validate the bespoke construction by hand (throwaway, not shipped)

Write a scratch script (outside `src/`, deleted at the end of this step — do not commit it) that constructs an n-armed star figure directly from tile geometry (no ray-ray intersection): for each edge, derive the two contact rays as today, but define each arm's endpoint as a function of that edge's own rays and the adjacent edge's rays, well-defined for any convex or concave simple polygon — no `t≤0` check, no "is this point inside the polygon" check.

Validate against:
- **Kepler's Star** (square base, θ=67.5°, regular octagon gap) — must reproduce today's `square@67.5` output exactly. Safest case, confirms baseline correctness.
- At least three irregular tilings whose comments in `pic/index.ts` document today's degenerate branches: **kisrhombille**, **floret-pentagonal**, **tetrakis-square** — across contact-angle bands that currently trigger `edge`-routing or asymmetric-pair fallbacks (cairo@27.5, tetrakis@46).
- At least one **concave** tile type (check `TAPRATS_DATA` in `tapratsTiling.ts` — deltoidal-trihexagonal or similar) — a construction that only works on convex tiles leaves exactly the failure mode this epic exists to fix.

**Exit criterion:** written confirmation (can just be the next PR's description) that the construction matches Kepler's Star bit-for-bit/within tolerance AND produces closed, non-self-intersecting figures on the irregular + concave cases. If it doesn't hold up, stop and re-scope before Step 3 — this is the epic's real risk gate.

No files shipped, no test-suite impact.

## Step 1 — David's Star (fast, free win, decoupled from geometry risk)

Research already confirms David's Star (star-of-triangles over 3⁶, θ=60°) is bit-identical to the existing `3.6.3.6` preset. Add it as a second named registry entry in `src/tilings/index.ts` (alias or duplicate — check whether the project has a convention for "same geometry, different display name" before choosing; may touch `src/editor/presetShelf.ts` tiering/dedup).

**Why first:** zero geometry risk, validates the "historically-named star tiling as a Configuration/preset" plumbing (naming, Gallery card, `presetConversion.isConvertiblePreset`) fully decoupled from Step 0's harder validation. Can ship in parallel with or before Step 0.

**Tests:** no change to `runPIC.characterization.test.ts` (same archimedean path as existing cases). Add a small registry/preset-resolution test confirming the new entry's output matches `3.6.3.6`. `tapratsTiling.test.ts` untouched.

## Step 2 — Kepler's Star (flagship content, ships under the *existing* pipeline)

Add star-of-squares over 4⁴ as a named Gallery entry, θ=67.5° baked into `defaultConfig`, through the **existing** `generateTiling`/`runPIC` archimedean path — at 67.5° the gap octagon is regular, fully convex, PIC-safe under today's code with zero new figure-construction logic.

**Files:** `src/tilings/index.ts` (new `TILINGS['keplers-star']` entry), possibly `src/editor/presetShelf.ts`.

**Tests:** add one new case (`keplers-star@67.5`) to `runPIC.characterization.test.ts`'s `CASES`/`GOLDEN`, following the file's existing "captured on `main` @ `<sha>`" comment convention. Purely additive, no removals.

## Step 3 — Build `src/pic/rosettePatch.ts` (additive, not wired in yet)

Using Step 0's validated construction, implement `runRosettePIC(polygons: Polygon[], config: PatternConfig): Segment[]` — same signature shape as `runPIC`, **must emit the exact same `Segment` shape and `kind`/`side` tagging** (`src/types/geometry.ts`: `from`, `to`, `edgeMidpoint`, `polygonCenter`, `polygonId`, `polygonSides`, `tileTypeId`, `kind: 'star-arm'|'vertex-line'`, `side?: 'plus'|'minus'`) so `src/strand/buildStrands.ts` and the Decoration layer keep working unmodified — this is a hard interop constraint (see Risks). `usePattern.ts` is **not** touched yet.

**Files:**
- `src/pic/rosettePatch.ts` (new)
- `src/pic/rosettePatch.test.ts` (new) — degenerate-case coverage across all rosette-patch tilings at a spread of contact angles (including previously-degenerate bands), a property-based closed/non-self-intersecting-strand check, and an explicit interop test that runs output through `buildStrands` and asserts strand closure/continuity (not just segment counts).

**Tests:** `runPIC.characterization.test.ts` and `tapratsTiling.test.ts` — zero changes, must stay green untouched (this step doesn't touch either file's subject matter).

## Step 4 — Wire it into `usePattern`, retire the old rosette golden cases

In `usePattern.ts` (~line 896-906), branch `rosette-patch` category to `runRosettePIC` instead of `runPIC`; `archimedean` category unchanged. Own reviewable PR, separate from Step 3, so a regression has a small revertible diff.

**Files:**
- `src/hooks/usePattern.ts` — the branch change.
- `src/pic/runPIC.characterization.test.ts` — retire the 6 existing taprats/rosette golden cases (`cairo@27.5`, `floret@40`, `floret@40-edge`, `kisrhombille@72`, `nonagonal@54`, `tetrakis@46`) with a dated comment explaining coverage moved to `rosettePatch.test.ts` — keeping them here would either silently stop testing the live path or need duplicating. File shrinks to 7 cases (6 archimedean + Kepler's Star).
- Add integration coverage (e.g. in the existing `pic/pipeline.test.ts` or a `usePattern`-level test) asserting the category branch dispatches to the right function.

**Verification:** smoke-test every rosette-patch Gallery tiling end-to-end via the `run` skill before merging.

## Step 5 — Remove `figureRouting`, shrink the `pic/index.ts` branch-ladder

**First, audit** (do not skip): grep every live config — Gallery presets, Lab defaults, and check whether Lab-authored custom/irregular polygons route through `runPIC` (archimedean category) — the branch-ladder comments mention it also handles "user-authored Lab polygons whose vertex angles fall outside the PIC contact-angle range," not just taprats tilings. If archimedean-category figures can still hit these branches for real reasons, the branch-ladder itself must stay (only the rosette-patch-specific need for it goes away); only remove `figureRouting` if the audit confirms no live path still depends on the `edge`/`centroid` distinction.

Then: do the parked code-quality item — named-case policy table replacing the ordered-if ladder, extract `pushSegment`/centroid-V helpers, dedupe the triplicated pair-A/B probe — against the now-shrunk code, and remove the `figureRouting` field end-to-end if the audit clears it.

**Files:**
- `src/pic/index.ts` — branch-ladder refactor + `figureRouting` param removal from `emitStarArms`/`pairAtVertex`.
- `src/types/pattern.ts`, `src/state/reducer.ts`, `src/state/configValidation.ts` — remove `FigureRouting` type/field/action/validation (if audit clears it).
- Audit + update any fixture referencing `figureRouting`: `src/editor/presetConversion.test.ts`, `src/generator/randomPattern.ts`, `src/pic/pipeline.test.ts`, `src/pic/vertexStrandsOverlap.test.ts`, `src/pic/vertexStrandsPeriodic.test.ts`, `src/state/configValidation.test.ts`, `src/state/figureMutations.test.ts`, `src/strand/computeCurves.test.ts` — distinguish "incidentally sets the field in a fixture" (safe to drop) from "asserts on routing behavior" (needs real judgment).

**Tests:** the remaining 7 `runPIC.characterization.test.ts` cases are the refactor's acceptance gate — must stay bit-identical (pure preserve-the-fingerprint refactor, now safe since it's post-fold). `tapratsTiling.test.ts` stays untouched throughout the whole epic — confirms it was never coupled to figure-construction internals.

## Step 6 (optional, deferred if expensive) — Archimedes' Star

Most speculative of the three: star-of-hexagons over 6³, needs hexagons modeled as 12-gons with collinear vertices, may need a tolerance/epsilon probe for near-duplicate vertices. Run its own Step-0-style scratch spike *after* Step 5 lands, to determine whether it fits the unchanged archimedean `runPIC` path (like Kepler's) or needs the bespoke `rosettePatch.ts` constructor. Do not commit to a path before spiking. Treat as explicitly out of critical path — if the spike reveals nontrivial new tolerance-handling work, re-scope it as its own follow-up rather than letting it stall the epic (Steps 1-5 fully deliver the architectural fix plus 2 of 3 Gallery items on their own).

## Risks / open questions carried into the work

1. **`Segment` interop is the hardest hidden constraint.** `buildStrands.ts` and Decoration consume `Segment[]` structurally (point-key + angle continuity) and via `kind`/`side` tags that drive curve/weave logic — Step 3's tests must verify this contract directly (strand closure via `buildStrands`), not just eyeball rendered output.
2. **`figureRouting` may still be load-bearing for Lab-authored irregular polygons**, not just taprats tilings — Step 5's audit is not optional.
3. **Golden-fingerprint discipline** — `runPIC.characterization.test.ts`'s header comment explicitly warns against silent re-blessing; every edit in Steps 2, 4, 5 needs a dated, reasoned comment matching the file's existing style.
4. **Naming/dedup convention** for David's/Kepler's Star vs. existing entries needs confirming before Step 1 (alias vs. duplicate registry entry).
5. **Archimedes' Star scope creep** — isolated to Step 6, explicitly deferrable.

## Verification

- `npx vitest run` after each step — full suite must stay green (or shrink/grow deliberately per the notes above).
- `npx tsc --noEmit` after each step.
- Manual smoke test via the `run` skill after Step 4 (pipeline cutover) — visually confirm every rosette-patch Gallery tiling still renders correctly, and after Steps 1/2/6 — confirm new Gallery entries render and are selectable.
- Commit + push after each step per project convention (each step is independently shippable).

## Model recommendation

Fable for Step 0 (geometry spike) and Step 3 (bespoke construction) — the hardest reasoning work. Sonnet is fine for Steps 1, 2, 4, 5, 6 (registry plumbing, wiring, refactor, audits).
