# HANDOFF — open items after the gradient-hardening session (2026-08-02)

Written at a clean milestone. `SESSION_STATE.md` is still the resume anchor and
its **NEXT** list is the menu; this file carries the working context for the
three items that need a *decision* or have a trap waiting, so a cold session
doesn't have to re-derive any of it.

Nothing here is mid-flight. Tree clean, `main` pushed at `a2dab56`, suite
1525 green, tsc + build clean.

---

## Item 2 (SESSION_STATE NEXT) — the 1.5° curve cliff · **NEEDS A YES/NO**

**Model:** Opus. Small change, wide blast radius — the decision is the hard part.

### What happens

`extractVoids` runs `simplifyCollinear` at a fixed **1.5°** tolerance on every
extracted face (`src/decoration/voids.ts:364`). On a curved field that
simplification is applied to the *rendered* outline too, so a gentle curve is
discarded wholesale. Measured on 4.8.8, un-cut Voids only:

| curve offset | Voids keeping a curved outline |
|---|---|
| 0.02, 0.05 | **0 / 59** |
| 0.055 → 0.3 | **59 / 59** |

A sharp cliff between 0.05 and 0.055 (consistent with a fixed angle tolerance).
Below it the strands still render bowed while the Void fill, its exported stamp
canvas and both Focus editors all go straight-edged.

### Why it is wrong, precisely

The 1.5° simplification is **correct for the identity outline** — its stated job
(`voids.ts:361-363`) is to stop a T-junction vertex on a straight edge splitting
a congruent class, which is what made "Matching leaves a few odd voids
unpainted". It is **wrong for the rendered outline**, which exists only to be
drawn.

The two are already cleanly separated downstream: `pairCurvedOutlines`
(`voids.ts:489-497`) takes `polygon` from the CURVED extraction and both
`keyPolygon` **and** `signature` from the STRAIGHT one. So identity is derived
entirely from the straight pass — relaxing simplification on the curved pass
alone cannot move a signature.

### Proposed change

1. Add an option to `ExtractVoidsOptions` (`voids.ts:47`), e.g.
   `simplifyAngleTol?: number`, defaulting to the current 1.5°, and pass it to
   the `simplifyCollinear` call at `voids.ts:364`.
2. In `extractDecorationVoids` (`src/hooks/usePattern.ts:234-239`) pass a tight
   tolerance (or 0) for the **curved** extraction only — line 237. Leave the
   straight extraction on the default.

### Check before committing to it

- **Perf.** Rendered Void outlines below the cliff go 6 → ~48 points. That is the
  same cost fields just above the cliff already pay, so it is not a new regime —
  but `project_decoration_stage_idea` has a whole perf chain around Void
  painting; re-read it and spot-check a heavy field.
- **`pairCurvedOutlines` matching is unaffected** — it matches on centroid
  distance and area ratio (`voids.ts:471-480`), neither of which moves when the
  vertex count changes. Confirmed by reading, not by test.
- **Do not touch** `simplifyCollinear` at `voids.ts:531` or `:605`, or the
  default at `:560`. Those are identity paths.

### Test it red-first

`src/decoration/curvedFieldFixture.ts` gives you a real curved field in one
call. A test at offset 0.03 asserting `polygon.length > keyPolygon.length`
fails today and passes after. Sweep offsets — the cliff is the interesting part.

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
