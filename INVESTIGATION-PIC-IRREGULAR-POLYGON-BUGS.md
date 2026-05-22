# PIC Irregular-Polygon Edge-Slide Bugs — Investigation 2026-05-21

**Branch:** `feat/art-deco-egypt-theme-revamp`
**Status:** MORE-FIXED 2026-05-22 (sessions 3, 4, 5).
- `ddcad24` — Bug 2 same-edge slide guard (concave polygons no longer cut strands across reflex notches). **KEEP**.
- `2632e69` — arm-length cap at polygon half-span. **Removed in session 5** (replaced by centroid V on all convex).
- `e451af0` — edge-ratio gate + per-ray fallback cap. **Removed in session 5** (fallback cap killed too many rays).
- `271168f` — drop edge-slide on uneven polygons. **Effectively removed in session 5** (replaced by always-on centroid V on convex).
- **Session 4 commit `224fdfb`** — Direction 3 centroid-routed V (uneven-convex only). **Superseded by session 5** (extended to all convex).
- **Session 5 (this commit)** — centroid V on ALL convex polygons; all arm-length caps removed. Concave polygons keep original edge-slide with same-edge guard.
- 166 tests pass.

### Net effect vs. previous session

| Tiling           | θ      | Before today | After today |
|------------------|--------|-------------|-------------|
| Floret           | 20°    | 6 segs (already dropped) | 6 segs (unchanged) |
| Floret           | 30°    | 10 segs incl. 72.2-unit fallback arms | 8 segs (fallback cap) |
| Floret           | 40°    | 10 segs incl. 63.3-unit edge-slide arms | 6 segs (uneven drop) |
| Kisrhombille     | 30-50° | 4-6 segs incl. 50-unit forward arms | 2 segs (uneven drop) |
| Kisrhombille     | 67.5°  | 6 segs incl. 27.3-unit slide | 2 segs (uneven drop) |
| Kisrhombille     | 72°    | 6 segs incl. 18.0-unit boundary slide | 2 segs (uneven drop) |
| Deltoid          | 30-50° | 5-8 segs incl. ≤25-unit slides | 2-4 segs (uneven drop) |
| Cairo            | all    | (preserved) | (preserved — even) |
| Tetrakis         | all    | (preserved) | (preserved — even) |
| Heptagonal-rosette | all    | (preserved) | (preserved — even, ratio 0.696) |
| Nonagonal-rosette | all    | (preserved by same-edge guard) | (preserved) |
| Decagonal-rosette | all    | (preserved by same-edge guard) | (preserved) |

### Open trade-off (RESOLVED 2026-05-22 session 4)

The session-3 drop left kisrhombille θ=30-72° / floret θ=40° / deltoid
θ=30-50° with sparse 2-segment figures. User feedback after visual
verification: "many of the rays disappear in the middle angles. However
it is looking a bit cleaner at least, there is less overlapping."

Session-4 fix implements **Direction 3 (centroid-routed strands)** for
convex uneven polygons. The asymmetric and both-positive-outside edge-
slide branches in `emitStarArms` no longer drop the pair — instead they
emit a V: `forwardRay.origin → polygonCenter` and `backRay.origin →
polygonCenter` (or `ray1.origin → centre, ray2.origin → centre` for
the both-positive-outside branch). Each segment uses its own ray's
side so curve rendering picks the right direction. Convex-only guard
(`isConvexPolygon(polyVertices)`) — concave uneven polygons fall
through to the original drop + per-ray fallback (already handled by
the same-edge guard for the Bug-2 nonagonal/decagonal cases).

Result vs. session 3 drop:
- Floret θ=20° / 40°: 6 segs → 10 segs (V0/V3 asym pair returns as
  V through centroid).
- Kisrhombille θ=30-72°: 2 segs → 5-7 segs (V1/V2 / V0 asym pairs
  return).
- Deltoid θ=30-50°: 2-4 segs → 4-8 segs.
- Cairo / Tetrakis: unchanged (even polygons, edge-ratio gate keeps
  them on the original edge-slide path).
- Nonagonal / decagonal: unchanged (even by edge ratio; same-edge
  guard catches the concave reflex cases).

### Session-end (2026-05-22)

User asked for closing notes — has NOT visually verified today's four
commits yet. To resume:

1. `npm run dev` (http://localhost:5173/).
2. Spot-check the affected tilings: `kisrhombille`, `floret-pentagonal`,
   `deltoidal-trihexagonal`, `heptagonal-rosette`, `nonagonal-rosette`,
   `decagonal-rosette`, `cairo-pentagonal`, `tetrakis-square`. Sweep
   the contact-angle slider on each.
3. Specific to compare against before this session:
   - **Kisrhombille θ=72°** — used to show an 18-unit slide visibly
     running along the polygon's long edge; now just two short arms
     from V0 inside pair-A. Sparser but no slide.
   - **Floret θ=40°** — used to show two long 63-unit forward arms
     spanning the pentagon; now a clean 6-segment star.
   - **Deltoid θ=30-50°** — sliders that used to flip between regimes
     now stable at sparse 2-4-segment patterns.
4. Decide the next direction:
   - "Looks good, ship it" → close out the project memory.
   - "Too sparse, fill it back in" → implement Direction 3 (centroid-
     routed strands). Sketch in this memo's Follow-up directions.
   - "Some specific case still wrong" → run `npx vitest run
     src/pic/probe.test.ts --reporter=verbose` for per-θ data; the
     probe diagnoses where each emission is coming from.

Related memory: `~/.claude/projects/-home-harryjrh-Geometric-Pattern-Creator/memory/project_pic_irregular_polygon_bugs.md`.

---

## What changed in working tree (NOT committed)

`src/pic/index.ts` — `clipSegmentToPolygon` now returns `{ point, edgeIdx }`. Both edge-slide branches in `emitStarArms` (asymmetric and both-positive-outside) check `clipEdge === backRay.edgeIndex` before drawing the slide; if not, emit only the forward arm and let the back ray fall through to per-ray fallback.

`src/pic/pipeline.test.ts` — added regression test for the nonagonal-rosette 5-gon at θ=54°: no star-arm > 60% of polygon diameter. Pre-fix the worst was 49.3 units (64% of 76.6); post-fix the worst is 39.7 units (52%).

`src/pic/probe.test.ts` — diagnostic test (always passes) that logs per-vertex pair-A status + per-θ runPIC segment lengths for the affected tilings. Run with `npx vitest run src/pic/probe.test.ts --reporter=verbose`.

All 152 tests pass with the change in place, including the Cairo asymmetric-slide regression at θ=27.5°.

---

## Empirical findings

### Tilings probed
Affected (per user 2026-05-21): `floret-pentagonal`, `deltoidal-trihexagonal`, `kisrhombille`, `heptagonal-rosette` (Bug 1: snap-in/out on convex acute-vertex polygons); `nonagonal-rosette`, `decagonal-rosette` (Bug 2: cross-polygon slide on concave reflex-vertex polygons).
Reference (aesthetic per user): `cairo-pentagonal`, `tetrakis-square`.

### Visual reproducers (pre-fix screenshots)
`docs/bug-pictures/` holds 11 "before" PNGs captured 2026-05-21 (pre-session-3 state):
- Deltoid (`delt tri 40.PNG`, `delt tri 50.PNG`, `Delt tri 60.PNG`)
- Floret-pentagonal (`floret pen 20.PNG`, `floret pen 36.5.PNG`, `floret pent 60.PNG`)
- Kisrhombille (`kisrombille 40.PNG`, `kisrombille 60+.PNG`, `kidrombille 60.PNG`)
- Girih bowtie (`girih bowtie 31.PNG`, `girih bowtie 70.PNG`) — out-of-scope of the current production tilings; useful for the parked star-tilings / Taprats rosette-patch work.
After the session-5 centroid V + arm-length-cap removal, these should be revisited in-browser to confirm whether the visible artifacts are gone.

### Slide lengths (asymmetric branch)

| Tiling | θ | arm len | slide len | slide / diameter |
|---|---|---|---|---|
| Cairo V0/V4 | 27.5° | 40.3 | 3.2 | 4% |
| Tetrakis V0/V2 | 46° | 25.0 | 0.4 | 1% |
| Tetrakis V0/V2 | 60° | 25.9 | 6.7 | 9% |
| Floret V0/V3 | 20° | 67.4 | 1.6 | 1% |
| Floret V0/V3 | 40° | 63.3 | 3.0 | 2% |
| Deltoid V1/V3 | 30° | 28.9 | 0.0 | 0% |
| Deltoid V1/V3 | 40° | 32.6 | 6.5 | 11% |
| Kisrhombille V0/V1 | 30° | 50.0 | 0.0 | 0% |
| Kisrhombille V0/V1 | 40° | 56.5/44.0 | 11.3/7.6 | 8-15% |
| Heptagonal-rosette V1/V2 | 30° | 40.0 | 4.8 | 6% |
| Nonagonal-rosette V2 (concave) | 54° | 161.1 | (cross-tile cut) | — |
| Decagonal-rosette V2/V5 (concave) | 67.5° | 303 | (cross-tile cut) | — |

### Key observations

1. **Slide length alone is NOT the discriminator.** Floret's slides (1.6-3.0 units) are smaller than Tetrakis's at θ=60° (6.7 units). User sees floret as bad and Tetrakis as good.

2. **The visible artifact on Bug 1 is the FORWARD ARM, not the slide.** Floret V0 at θ=20°: arm = 67.4 units on a 132-diameter polygon = 51% of diameter. The arm reaches near the boundary, then a tiny slide caps it. User's wording: "rays continuing through to the edge" — they're noticing the arm, not the slide.

3. **The snap-in/out symptom is real.** Floret across θ: at 20° / 40° asymmetric (slides fire); at 30° ALL vertices are invalid (per-ray fallback fires); at 50° onwards all-inside (normal pair-A). The strand STRUCTURE changes between regimes — that's the visible "snap."

4. **Cairo also has regime transitions** (V0/V4 asym → invalid → inside; V1/V3 inside → invalid → inside across the same θ sweep) but the user accepts Cairo. So pure regime-change isn't the discriminator.

5. **Bug 2 (concave) is independently severe.** Nonagonal V2 at θ=54° natural meeting is 146 units past centroid; arm runs 161 units. Same-edge guard in working tree catches the cross-tile case (49.3 → 39.7 unit worst segment).

### What the same-edge guard does and doesn't do
- ✅ Catches the nonagonal-rosette / decagonal-rosette cross-polygon slides (Bug 2 headline).
- ✅ Preserves Cairo, Tetrakis, and all other working tilings.
- ❌ Does NOT touch Bug 1 (the affected slides are correctly on the adjacent edge).

This is why the user "didn't see improvements" — the visible Bug 1 artifacts are unchanged, even though Bug 2's worst pathology is fixed.

---

## Three candidate redesigns for Bug 1

### Option A — Drop asymmetric pairs entirely (user-suggested baseline)

In the asymmetric branch (`result.t1 <= EPSILON || result.t2 <= EPSILON`), do nothing. Don't emit forward arm, don't slide. Both rays fall through to per-ray fallback (Kaplan trim).

**Pros:** simplest change. Removes the "running through to the edge" forward arm. Smooth in the sense that the asymmetric and invalid regimes both rely on per-ray fallback (same structure).

**Cons:** breaks the recent Tetrakis fix (commit `64cdc42`). Per-ray fallback for Tetrakis 45° vertices produces short stubs that get dropped by the `ORPHAN_MIN_LEN_FRACTION` check. The strand would have small gaps at those vertices — exactly the symptom `64cdc42` repaired.

Mitigation: keep the asymmetric branch but ONLY emit when slide length is below a small fraction of polygon shortest-edge. Threshold-tunable.

### Option B — Polygon-level pair-type consistency

Inspect all vertices' pair-A status first. If MAJORITY are inside, use pair-A across the polygon, but skip emission entirely at any non-inside vertex (no forward arm, no slide, no fallback). If majority are outside/asym, switch the entire polygon to pair-B (concave star) — single coherent figure type per polygon per θ.

**Pros:** strand structure is uniform across the polygon. No mix of "some vertices star, others edge-slide." Smoother visual.

**Cons:** loses some figure detail. Per-tile-type figure renders consistently but may look "empty" near acute vertices. Has to handle the case where pair-B also fails.

### Option C — Centroid-routed strands at problem vertices

When the pair-A meeting is asymmetric or outside, instead of clipping to the boundary, bend the strand through the polygon centroid (or a point on the inradius circle). Forward ray runs to interior point, then turns to back ray's edge midpoint.

**Pros:** strand stays inside the polygon. No boundary slides at all. Visually clean chord-pair.

**Cons:** more code. Geometric subtleties (which interior point? smooth transition into normal pair-A regime?). May look chunky if the routing point is too far from the natural ray paths.

---

## Recommendation

**Option B (polygon-level pair consistency) for Bug 1**, layered on top of the working-tree same-edge guard for Bug 2.

Reasoning:
- Bug 1 is fundamentally a "mixed pair selection looks inconsistent" issue, not a slide-length issue. Polygon-level consistency directly addresses the user's "shape consistency" wording.
- Preserves Cairo (all 4 long-edge vertices are inside, so the polygon stays on pair-A; the 1 asym vertex's contribution is dropped — slight aesthetic change to Cairo's 4-fold caps but coherent).
- Preserves Tetrakis (V1 inside, V0/V2 asym → polygon uses pair-A only at V1, drops V0/V2; per-ray fallback fills in if needed). Need to verify Tetrakis still has continuous strands across tile boundaries after this — the slide was specifically added to close strand gaps at tile-tile borders.

Open question for the user before implementing:
1. Is Bug 2 (cross-tile slide on concave polygons) actually visible to you? The same-edge guard fix is sound but you didn't see improvement — was that because you didn't look at nonagonal/decagonal rosettes, or because the artifact wasn't obvious?
2. For Bug 1, which option appeals: A (drop & fall back, may leave small gaps), B (polygon-level consistency, may shrink figures), or C (route through interior, more design work)?
3. Should we treat acute-vertex polygons (floret apex, deltoid apex, kisrhombille) the same as concave-reflex polygons (nonagonal V2, decagonal V2/V5)?

---

## How to apply next session

1. Read this memo + the project memory `project_pic_irregular_polygon_bugs.md` first.
2. Re-run `npx vitest run src/pic/probe.test.ts --reporter=verbose` for fresh probe data.
3. Pick from **Follow-up directions** below.
4. Implement behind no flag (single-path is preferred — feature flags will be confusing).
5. Update / extend `src/pic/pipeline.test.ts` with regression coverage.
6. Visual check in browser at the affected (tiling, θ) pairs before commit.

---

## Follow-up directions (session 3+)

User said "it looks better although none are fixed." So the partial fix is on the right track but not aggressive enough. Three sharper approaches, ordered by how invasive they are:

### Direction 1 — Tighten the threshold

The current cap is at `armLen > halfSpan` (= 0.5 × diameter). Candidates:
- `0.47 × diameter` drops floret θ=40° (0.48) but Cairo θ=27.5° sits at 0.465 — close to false-positive territory.
- `0.45 × diameter` drops floret θ=40° + drops the Cairo regression — would need to relax the Cairo test (or accept regressing Cairo's asymmetric slide).
- `0.40 × diameter` catches more (kisrhombille θ=72° at 0.41) but regresses Cairo (0.46) and is risky.

Run the probe after each threshold change. Decide based on the worst-borderline-case acceptance.

### Direction 2 — Polygon-level coherent emission (was "Option B")

Inspect every vertex's pair-A status BEFORE per-vertex emission. If any vertex is non-inside, drop emission at every non-inside vertex (no arm, no slide, no per-ray fallback). Inside vertices emit normally.

Risk: regresses Cairo at θ=27.5° (V0/V4 asymmetric → would drop those). Cairo regression test asserts 8+ origin keys and strand pieces > 5 length — likely fails.

Mitigation: keep the per-ray fallback for inside-vertex-dominated polygons (drop only edge-slide emissions, not the inside ones). That's essentially what the current arm-cap does just with a smoother threshold.

### Direction 3 — Centroid-routed strands (was "Option C")

When pair-A meeting is outside the polygon, route the strand through the polygon centroid (or a point on the inradius circle) instead of clipping to the boundary. Forward ray → centroid → back ray's edge midpoint.

This is the cleanest visual result but requires:
- Selecting the routing point (centroid? inradius circle? midpoint of arms' bisector?).
- Smooth blending into normal pair-A regime as θ approaches the boundary threshold.
- Handling concave polygons (centroid may lie outside the polygon — use centroid clipped to polygon interior, or use a different anchor).

Substantial design work. Best done after Directions 1 and 2 are exhausted.

### Direction 4 — Hybrid (recommended starting point)

Combine:
- Keep the current arm-cap (catches the worst cases).
- Add a secondary rule: **if pair-A meeting is outside the polygon AND polygon has only one or two "inside" vertices, switch the entire polygon to pair-B (concave star).** This catches the "all degenerate" case (e.g. floret θ=30° where all pair-A meetings are degenerate) coherently.
- Cap the per-ray fallback's nearest-crossing search to a fraction of the polygon's halfSpan (currently it's just inradius * 0.25). Prevents fallback from re-introducing long arms via Kaplan trim.

### Probe data quick-reference (re-run for fresh numbers)

| Tiling           | θ      | Vertex / status          | Arm / halfSpan / ratio | Verdict        |
|------------------|--------|--------------------------|------------------------|----------------|
| Floret           | 20°    | V0/V3 asym               | 67.4 / 66.2 / 1.02     | dropped (good) |
| Floret           | 40°    | V0/V3 asym               | 63.3 / 66.2 / 0.96     | emits (still bad) |
| Deltoid          | 30°    | V1/V3 asym               | 28.9 / 28.9 / 1.00     | borderline drop |
| Deltoid          | 40°    | V1/V3 asym               | 32.6 / 28.9 / 1.13     | dropped (good) |
| Kisrhombille     | 30°    | V0/V1 asym               | 50.0 / 50.0 / 1.00     | borderline drop |
| Kisrhombille     | 40°    | V0/V1 asym               | 56.5 / 50.0 / 1.13     | dropped (good) |
| Kisrhombille     | 72°    | V1/V2 asym               | 41.4 / 50.0 / 0.83     | emits (still bad) |
| Heptagonal       | 30°    | V1/V2 asym               | 40.0 / 39.1 / 1.02     | dropped (good) |
| Cairo            | 27.5°  | V0/V4 asym               | 40.3 / 43.3 / 0.93     | preserved      |
| Tetrakis         | 46-60° | V0/V2 asym               | 25.0 / 35.4 / 0.71     | preserved      |
| Nonagonal        | 54°    | V2 concave reflex        | (cross-tile, fixed)    | preserved      |
| Decagonal        | 67.5°  | V2/V5 concave reflex     | (cross-tile, fixed)    | preserved      |
