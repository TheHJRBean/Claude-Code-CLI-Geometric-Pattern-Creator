# HANDOFF — open items after the gradient-hardening session (2026-08-02)

Written at a clean milestone. `SESSION_STATE.md` is still the resume anchor and
its **NEXT** list is the menu; this file carries the working context for the
items that need a *decision* or have a trap waiting, so a cold session doesn't
have to re-derive any of it.

Nothing here is mid-flight. Tree clean, `main` pushed at `e6cff4e`, suite
**1795 green**, tsc + build clean. (Refreshed 2026-08-05 after junction
ornaments shipped and their asymmetric-field defect was fixed — that whole
feature is closed, see `SESSION_STATE.md`; the two decisions below are
unchanged. **Two live decisions: #54 below, and #32 — see the stanza
immediately after this one.**)

~~**One unverified item (2026-08-04, `65d09d9`): Decoration-Phase Undo + Clear
paint.**~~ ✅ **USER-CONFIRMED 2026-08-05** (*"undo paint and clear is
working"*). The **data-loss fix** it carried is therefore closed: on a legacy
substrate, one Ctrl+Z after one paint used to blank the canvas, because the
undo snapshot only covered the Patch and restoring a `null` Patch clears the
Lab. `HistorySnapshot` is now a `{ editor, decoration }` pair.

**2026-08-05, backlog working-through session.** Two features shipped and
headless-verified (SVG-export background `63942ed`, Gallery name filter
`2cc24e4`); **two backlog items were cancelled rather than built**, both because
the codebase had already obsoleted them (Tile-stamping — a **Tile edges** line
set with the base families off makes Tile faces ordinary Voids; the overlap-tile
Strand toggle — `d99c725` deleted the gate rather than gating it). Read
`feedback_missing_control_not_missing_feature` before picking up any remaining
backlog item: **check the item against current code first**, since two of five
evaporated on contact. One loose end, written up in `scripts/verify/README.md`:
**#34's browser pass is partial** — hosting is right, the 8-image orbit was never
entered.

**2026-08-03, Guides v1 COMPLETE — #29 + #30 shipped, browser-verified, closed
(`ffd9a6b`, `e2295b6`, `7ffcb86`).** Full write-ups are in `SESSION_STATE.md`
and on the issues; nothing about them is pending.

**⚠️ #32 (Girih preset reveal) is the user's agreed next task — and it needs a
decision before any code.** It is the last open `guides` issue. Read the issue
first; the short version:

- The ticket says of itself: *"too vague to implement yet — next step is a
  short grill/enumeration pass once v1 has been used in anger."* That pass has
  not happened.
- **The architectural fork is the real blocker.** Girih presets are **tier-3
  view-only** (`rosette-patch`, the legacy render path). There is no Patch, so
  there is nothing to hang `EditorPatch.guides` on. Either (a) tier-3 Patch
  conversion lands first — a large, separate job on the ADR-0006 convergence
  track — or (b) Guides gain a second render path over the legacy preset
  substrate. That is a product call, not an implementation detail.
- **The content does not exist.** Each preset needs a historically-correct
  Guide set authored by hand. The ticket's own plan was that the first content
  falls out of the *user* building a Girih layout with v1 — which is now
  possible for the first time, and hasn't been done.
- **Model:** the issue asks for **Fable** for the grill/enumeration pass. If a
  session opens on Opus/Sonnet, say so and ask before starting (standing rule,
  `feedback_model_recommendations`).

Sensible opening move: run the grill on the two questions above (which
substrate, and where the first Guide set comes from) rather than writing code.

**2026-08-03, #40 shipped + closed (`98c60a0`).** Picked as the next
zero-input task off the backlog pass's own scoping (below). Two independent
leak mechanisms in `emitVertexArms`, both producing "vertex-line arm ends
outside its own polygon": (1) the originally-reported α > interior-half-angle
case, fixed via an angular-betweenness test (`vertexRayEntersPolygon`) rather
than a spatial `pointInPolygon` probe — the probe was tried first and
rejected, since exactly at the boundary it flips unpredictably between
nominally-symmetric tile copies, the identical instability #51 hit on the
edge-line pairing; (2) a second leak **found while verifying the fix**, in an
asymmetric ray pairing under a per-vertex Morph field (one ray's shared
intersection point sits behind its own origin; only reachable when the two
rays at a pairing carry different effective θ). `vertexStrandsOverlap.test.ts`
needed its contact angle bumped 30°→60° on a square — 30° now legitimately
emits zero arms, the "some counts will drop, correctly" the backlog pass
anticipated. New regression suite `src/pic/vertexRayLeak.test.ts`, verified
red pre-fix. Tests 1554 green (was 1551), tsc + build clean.

**What the 2026-08-03 backlog pass changed, in one place:** 5 issues closed
as shipped+verified (#44/#45/#46/#42/#28); **#40 scoped** with a throwaway
probe (see the closed issue — the α > interior-half-angle predictor is exact
at 88/88, 20 of 26 tilings affected, and the "clamp the slider per shape"
option is **ruled out** by per-vertex partial leaks) — **now shipped, see
above**; **#34 fixed and closed** (`a8af5b2`). Only one thing there is owed
back: a browser pass on #34, written up as NEXT item 0's second half in
`SESSION_STATE.md`. Open issues now: **#54** (decision), **#52** (decision),
#41, #47, #39, #29, #30, #32.

**2026-08-03, later same day: #31 shipped + closed** (`10382c3`) — Anchor
vocabulary consolidation. CONTEXT.md's Construct/Guide/Anchor entries
already existed from ADR-0008; the Anchor entry needed #33/#34 folded in
(was still pointing at #33 as an unshipped follow-up), and the actual gap
was UI copy still saying "vertex" for Anchor pick targets. Swept
`EditorPickerOverlay` (header/aria-label/hints), `DesignPanel` Complete
prompts, `patchSelectable` validity labels. Left untouched: code
identifiers/comments, and the PIC/Figure sense of "vertex"
(`vertexContactAngle`, a Tile's own geometric vertex) — different noun
from the pick-target umbrella. Tests 1551 green, tsc clean.

---

## Item 2 (SESSION_STATE NEXT) — the 1.5° curve cliff · ✅ **DONE + VERIFIED (`a97e079`)**

Shipped as specced below: `ExtractVoidsOptions.simplifyAngleTol` +
`RENDER_SIMPLIFY_ANGLE_TOL` (0.05°), passed by `extractDecorationVoids` on the
**curved pass only**. Identity invariance is now asserted, not argued —
signatures, key outlines and areas are byte-identical to the strict extraction
while the drawn outlines differ (`src/decoration/voidCurveFidelity.test.ts`,
verified red-first, all 5 red before).

Two things the measurement pass turned up that the plan below didn't predict:

- **It was not a clean cliff on every tiling.** `3.6.3.6` at offset 0.01 kept
  **90 of 103** Voids curved and flattened 13 — the per-chord turn scales with
  edge length, so short-edged tile types crossed the threshold while long-edged
  ones in the *same field* didn't. Inconsistency within one field, not just a
  global on/off.
- **The perf worry was unfounded, and measurably so.** Point counts below the
  cliff land on exactly the values above it (4.8.8 avg 7.6 → 60.7, max 128) —
  literally the same numbers, because the flattening resolution (`SAMPLES = 8`)
  is what sets them, not the offset. Extraction time was unchanged across the
  sweep. Still worth a browser spot-check on a heavy field: that measured
  extraction, not 60-point SVG fills under a fast pan.

✅ **Browser-verified 2026-08-02** ("looks all good to me"). Nothing left here.

---

## ~~New — #55, no Frame authoring on a Gallery preset~~ · ✅ **DONE 2026-08-03 (`6ea2ba7`), issue closed**

Shipped as option 1. `FramePanel` is now substrate-agnostic (`substrate` /
`frame` / `onSetFrame` / `nRingSupported`); `LegacySubstrateControls` mounts it
against `config.frame` + `SET_GALLERY_FRAME`, clip-only (no Frame-type row, no
"Clear frame tiles", new Shape frames get `boundaryTreatment: 'clip'`). No
render change was needed — `Canvas` already clipped a non-editor tiling to
`config.frame`. Headless-verified on both substrates; the "which load path?"
question turned out not to matter.

The trace that got written at closeout held up in every particular, which is
the reusable lesson: see `feedback_missing_control_not_missing_feature` in
memory — grep an action's **call sites**, not its definition.

---

## Item 3 (SESSION_STATE NEXT) — GitHub #54, the canonical-pose split · **NEEDS A DECISION**

**Model:** Opus. Full write-up with the three options is on the issue.

Congruent instances on a curved field can pose through canonical frames whose
*rendered* boxes differ ~9% — same area, same perimeter, same shape, and
identical straight boxes. Root cause is `canonicalPose`'s tie-break
(`src/decoration/stamps.ts:106-133`) choosing among traversals that tie on the
quantised token ring.

**This is not cosmetic and it is not gradients-only.** Confirmed by probe:
`resolveVoidStamps` on 4.8.8 @0.3, one signature, 40 instances → **two different
fitted image sizes** (`121.32` and `111.52`). A stamped image renders at two
scales inside a single congruent class, in a shipped and browser-verified
feature.

Pinned (not asserted away) by *"the class-wide residual is the canonical POSE,
not the extent"* in `src/decoration/gradientCurvedGeometry.test.ts`. **If that
test starts failing because the numbers dropped, someone fixed this — delete the
test.**

My read: option 2 on the issue (chirality-symmetrised extent) is contained and
fixes gradients fully, but leaves stamps still needing the pose fix — the stamp
half genuinely requires touching the tie-break, which also underpins Void
identity. Do not start this without deciding how far it goes.

---

## Item 1 (SESSION_STATE NEXT) — 3 browser-verifies left

One pass, Decoration → Stamp, on a saved pattern **with curves on**:
`f8c1fd6` (Export all SVG ⇒ a handful of files, not ~100 — pan and re-export,
count unchanged), `428dbc8` (screen-edge partial shapes take no paint/stamp
click but still drag-pan), `296f9ac` (alternating curves flip edge to edge;
odd-length closed strands stay symmetric **by design**).

Plus a 10-second tick-off: **Stamp → Focus mode on a curved Void**. Expected
good — its Focus half read the same dropped `keyPolygon` that `4ba619d` fixed,
and the gradient Focus editor beside it is user-confirmed.

Plus `a97e079` (**gentle curves**, new): set a curve offset around **0.02–0.03**
— previously the flat-outline regime — and confirm the Void fill, the exported
stamp canvas and the Focus outline all bow with the strands instead of snapping
to the chord. `3.6.3.6` is the sharpest tell: it used to render some Voids
curved and their neighbours flat in the same field.

---

## Traps this session earned — read before touching Decoration

1. **A hand-rebuilt object literal silently drops an optional field.**
   `keyPolygon` is optional, so any site reconstructing a `VoidRegion` /
   `PaintVoid` field-by-field instead of spreading `...v` loses it and still
   type-checks. That was `4ba619d`, in `usePattern.ts`'s Paint-overlay literal,
   26 lines below an `instanceVoidFills` block that translated it correctly.
   **Grep for hand-built literals of any type carrying an optional identity
   twin.**
2. **Verifying the consumers is not verifying the feature.** Both Focus editors
   read `stampGeometry(identity, rendered)` correctly the whole time. Reading
   them "proved" the fix had landed — and it had; the data one hop upstream was
   already wrong. The user's browser pass found it in seconds. Check what the
   *first* layer emits, not just that the last one consumes it properly.
3. **A new seam only holds if the old callers are moved onto it.**
   `stampGeometry` shipped in `2d4e504`; gradients kept their own
   `canonicalPose` + `poseBBox` pair two files away and missed the fix for a
   month. When a fix establishes a seam, grep for every remaining caller of what
   it replaced, in the same commit.
4. **Measure the fix the way the feature is used.** Per-shape accuracy said the
   gradient fix was perfect; class-wide measurement (one spec seeded from
   whichever instance was clicked, rendered on all) revealed the residual that
   turned out to be a second, deeper bug (#54). An unmeasured fix would have
   been reported as a clean win.

5. **A shared test fixture must mirror production including its *tolerances*.**
   `curvedFieldFixture` reproduced `extractDecorationVoids` step for step but
   called `extractVoids` with default options — so every test built on it saw
   outlines simplified harder than the app's, and could never have caught the
   cliff. It only worked because both suites happened to use offset 0.3, above
   it. A fixture that is "the same shape as production" is not the same as one
   that is *the same call*; when you add an option to a function a fixture
   wraps, the fixture is a call site too.

Full versions live in `memory/feedback_identity_vs_geometry_outlines.md`.

---

## Environment

- Dev server: `npm run dev`, pinned to **5173** with `strictPort`. Browser
  storage is keyed to origin *including port* — a hop to 5174 shows an empty app
  (no patterns, thumbnails, dataset or bug reports) with the data unreachable
  until you return. A busy 5173 is a deliberate loud failure.
- `npx vitest run` ≈ 16 s, 1525 tests. `npx tsc --noEmit` for types.
- **One unexplained flake:** a single run reported 2 failures across 2 files;
  7 subsequent runs (4 parallel, 2 `--no-file-parallelism`, 1 post-build) were
  all green and the failing tests were never identified. Timeout is 30 s against
  a 3.3 s slowest test, so load does not explain it. **If it recurs, capture the
  file names** — that is the missing evidence.
