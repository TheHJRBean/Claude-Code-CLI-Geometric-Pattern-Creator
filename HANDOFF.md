# HANDOFF — open items after the gradient-hardening session (2026-08-02)

Written at a clean milestone. `SESSION_STATE.md` is still the resume anchor and
its **NEXT** list is the menu; this file carries the working context for the
items that need a *decision* or have a trap waiting, so a cold session doesn't
have to re-derive any of it.

Nothing here is mid-flight. Tree clean, `main` pushed at `a97e079`, suite
1530 green, tsc + build clean.

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
