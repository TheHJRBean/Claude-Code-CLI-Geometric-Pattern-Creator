# Grill-with-docs prep — Rosette-patch figure fold

> **State file.** Prepared 2026-06-17 so a fresh session can run the
> `/grill-with-docs` session cold. This is the input the grill walks; it is **not**
> the plan itself — the plan crystallises *during* the grill and lands in CONTEXT.md /
> a new ADR / the idea memory as decisions resolve.

## How to run this (cold start)

1. Read this file top to bottom.
2. Read the doc surfaces in §3 (CONTEXT.md Pattern vocab + ADR-0001…0005 + RESEARCH §2).
3. Read the canonical idea memory: `memory/project_star_tilings_gallery_idea.md`
   (the "Broader fold" + "Folded in" sections are the source of truth for scope).
4. Invoke **`/grill-with-docs`** and walk the decision tree in §4 **one question at a
   time**, recommending an answer for each (the recommendations are pre-drafted below —
   challenge them, don't just accept them). Update CONTEXT.md / draft ADR-0006 inline as
   each branch resolves, per the skill.
5. When the tree is resolved, the output is: (a) updated CONTEXT.md term(s), (b) ADR-0006
   draft, (c) a sharpened plan written back into the idea memory + `TESSELLATION_REVAMP_PLAN.md`.

## 1. Subject (one line)

Replace **generic PIC** with **constructed rosette figures** for the irregular tilings
where generic PIC degenerates (the `rosette-patch` Laves family), permanently closing the
borderline-emission bug family, retiring the `figureRouting` stopgap, and shipping the
David/Kepler/Archimedes star tilings as clean special cases of the same machinery. The
deferred thermo-nuclear **PIC branch-ladder reframe** is folded in here (user decision
2026-06-17): once the irregular tilings leave generic PIC, the ladder's irregular-tile
branches become *dead code to delete*, not behaviour to preserve — which dissolves the
preserve-vs-fix gate that blocked the standalone reframe.

## 2. Draft architectural sketch (to be challenged)

From the idea memory, condensed — **everything here is a proposal, not a decision**:

- New `src/pic/rosettePatch.ts` consumes per-tiling rosette-figure data + the existing
  Taprats tiling block and emits `Segment[]` directly, **skipping `pic/index.ts::runPIC`**
  for these tilings.
- `usePattern` branches on tiling identity to choose generic PIC vs the rosette path. The
  existing branch point is `usePattern.ts:897` (`def.category === 'rosette-patch'`) — today
  that only selects the *polygon* generator (`tapratsTiling`); figures still fall through to
  generic `runPIC`. The fold extends this branch to also select the figure source.
- Rosette-figure data (n arms = rosette order, inner/mid/outer radius ratios, contact
  parameter) lives **alongside** the Taprats data block in `tapratsTiling.ts` (co-located
  with `t1`/`t2`/affines).
- Construction follows RESEARCH §2.1 (three concentric circles, Dₙ symmetry). Open: port
  Taprats' code vs. derive from the documented construction.
- Generic PIC stays for Archimedean / k-uniform tilings where it works without degeneracy.
- Star tilings (David/Kepler/Archimedes over 3⁶/4⁴/6³) become further rosette-patch entries.

## 3. Doc surfaces the grill challenges against

| Surface | Relevant content | Pointer |
| --- | --- | --- |
| `CONTEXT.md` → **Figure** | _"rosette (was previously a Figure type; **removed** — see project history)"_ — **direct terminology conflict** with reintroducing "rosette figures". | CONTEXT.md:78-81 |
| `CONTEXT.md` → **Figure recipe** (`FigureConfig`) | Current recipe = `contactAngle`, `lineLength`, edge/vertex toggles, curve config, **`figureRouting`**. Rosette figures need different params. | CONTEXT.md:82-84 |
| `CONTEXT.md` → **Contact Ray** | Generic PIC's parametric ray. Constructed rosette figures don't emit Contact Rays — does the term's scope narrow? | CONTEXT.md:74-76 |
| `tilings/index.ts` | `category: 'rosette-patch'` already exists (3 entries: pentagonal/heptagonal/nonagonal rosette). `TilingDefinition` is where a `figureSource` flag would live. | index.ts:63,79,97 |
| `pic/index.ts` | The `emitStarArms`/`pairAtVertex` branch ladder — which branches are exclusively serving soon-to-be-rosette tilings (edge-slide / asymmetric / centroid-V)? | — |
| `pic/runPIC.characterization.test.ts` | The Chunk-7 **golden fingerprint** (12-case matrix) — must stay green for the *remaining* generic-PIC set; the matrix likely *shrinks* as irregular tilings leave. | — |
| ADR-0001…0005 | Format reference + precedent. No existing ADR governs figure construction → ADR-0006 candidate. | docs/adr/ |
| RESEARCH §2.1–2.3, §3.5 | The geometric rosette construction (3 circles, Dₙ), joining rosettes of two orders, Lee's construction. | RESEARCH-TILING-CONFIGURATIONS.md:111-160 |

## 4. Decision tree (grill walks these in order; recommendation per branch)

**A. Trigger / scope — which tilings route to the rosette path?**
Rec: a new explicit `figureSource: 'pic' | 'rosette'` on `TilingDefinition` (not implicit
on `category`), defaulted by category but per-tiling overridable. Keeps generic PIC the
default; makes the routing auditable. → resolve before B.

**B. Figure construction — port Taprats vs derive from RESEARCH §2.1?**
Rec: **derive** from the documented 3-circle construction (we own it, no port friction);
use Taprats only as a reference for default contact parameters.

**C. Rosette-figure data location.**
Rec: co-locate with the Taprats data block in `tapratsTiling.ts` per tiling.

**D. Pipeline branch point + Builder scope.**
Rec: Gallery-only in v1 (the irregular Laves live in Gallery); Builder/editor rosette
figures deferred. Branch at `usePattern.ts:897`, extended to select figure source.

**E. `figureRouting` toggle fate.**
Rec: **keep the field** (still meaningful for any *generic-PIC* irregular tile) but rosette
tilings ignore it. Add a migration/validation note for saved patterns that set
`figureRouting` on a now-rosette tiling (silently inert, not an error). Full removal only
once *every* irregular tiling is on the rosette path.

**F. `FigureConfig` shape for rosette params.**
Rec: extend `FigureConfig` (optional rosette params, or a discriminated `kind`) — grill to
decide DU vs optional fields. Watch the `tileTypeId` signature hash (Chunk-13 dependency).

**G. The folded-in branch-ladder reframe.**
Rec: enumerate which `emitStarArms`/`pairAtVertex` branches *only* serve now-rosette
tilings (asymmetric / outside edge-slide / centroid-V) → **delete** them once those tilings
leave generic PIC. This turns the gated "preserve-vs-fix" reframe into a clean deletion;
the golden fingerprint is re-baselined on the *shrunken* generic-PIC matrix. This is where
the Wave-E "latent PIC bugs fixed" headline finally lands.

**H. Terminology (do this inline, early).**
Rec: keep **`rosette-patch`** for the tiling category; introduce **Rosette Figure** as a
*Figure kind* and **rewrite** the CONTEXT.md Figure entry that says rosette was "removed"
(it's being reintroduced with a precise, different meaning — a constructed Figure, not the
old removed Figure type). Resolve "rosette" the noun vs "rosette-patch" the category vs the
old removed type so the glossary is unambiguous.

**I. ADR-0006?**
Rec: **yes** — passes all three tests (hard to reverse: a second figure pipeline; surprising
to a future reader; real trade-off vs continuing to patch generic PIC). Title candidate:
_"Constructed rosette figures for irregular tilings (vs generic PIC)."_

**J. Test strategy.**
Rec: golden fingerprint stays for the generic-PIC set (re-baselined smaller); new
characterization fingerprint for rosette output; visual before/after screenshots on the
borderline tilings (kisrhombille / floret / deltoid / heptagonal-rosette).

**K. Sequencing.**
Rec: (1) one pilot tiling end-to-end behind the `figureSource` flag; (2) migrate remaining
irregular Laves + delete the now-dead PIC branches (= the reframe); (3) ship
David/Kepler/Archimedes as new rosette-patch entries.

## 5. Terminology landmines (call out the instant they surface)

- **"rosette"** — three live meanings collide: the *removed* Figure type (CONTEXT.md:80),
  the **`rosette-patch`** tiling category (code, live), and the **reintroduced constructed
  figure** (this fold). Must be disambiguated in CONTEXT.md before any code.
- **"Figure" vs "Contact Ray"** — rosette figures are *constructed*, not solved by
  ray-intersection, so they emit no Contact Rays. Does "Figure" stay the umbrella term
  across both construction methods? (Rec: yes — Figure is method-agnostic; the construction
  method is an implementation detail of the Figure kind.)
- **"figureRouting"** — the toggle is a *stopgap that surfaces the trade-off*; the fold's
  whole point is that it stops being needed. Don't let the grill quietly bless it as
  permanent.

## 6. Likely doc outputs

- **CONTEXT.md**: rewritten **Figure** entry (rosette no longer "removed"); new/clarified
  **Rosette Figure** term; possible narrowing note on **Contact Ray**; `FigureConfig` recipe
  entry updated for rosette params.
- **ADR-0006**: constructed rosette figures vs generic PIC.
- **Idea memory** `project_star_tilings_gallery_idea.md`: status RAW → SCOPED, with the
  resolved decision tree.
- **`TESSELLATION_REVAMP_PLAN.md`**: a new Step (rosette figure pipeline) with the §4-K
  sequencing.

## 7. Cold-start recipe (if THIS session ended before the grill ran)

```
1. git log --oneline -5        # confirm this prep commit is present
2. Read GRILL_PREP_ROSETTE_FOLD.md (this file)
3. Read memory/project_star_tilings_gallery_idea.md
4. Read CONTEXT.md §"Pattern — PIC output vocabulary" + docs/adr/0001..0005
5. Invoke /grill-with-docs and walk §4 one question at a time.
```

Nothing is committed as a decision yet — the grill has not run. All of §4 is a **proposal
to be challenged**, not a settled plan.
