# Pattern Morph — Spec (v1)

**Status:** Grilled + signed off 2026-07-17; **slice 1 (Engine, #37) shipped same day** — `pic/morph.ts` field evaluation, per-edge θ variants in `pic/stellation.ts`, `runPIC` threading, load validation, fast-path opt-out, probe suite `pic/morphProbe.test.ts`. **Slice 2 (UI, #38) shipped + browser-verified 2026-07-17** — sidebar Morph section, on-canvas draggable stops/handles, transient bottom slider, reducer actions; zero engine changes. **Origin model (#48) shipped + browser-verified 2026-07-29** — Boundaries became **Morph Origins** with a per-Origin **Reach** and **Sides**; see §Origin model. Slice 3 (#39) open. Decisions in `docs/adr/0009-morph-boundaries.md`; vocabulary in `CONTEXT.md` (**Morph**, **Morph Origin**). Idea provenance: memory `project_pattern_morph_idea.md`.

A **Morph** spatially interpolates Figure-recipe parameters across the canvas of a Builder Composition. The start state is the Patch's ordinary `figures` map; the user adds one or more **Morph Origins** — draggable lines (Linear mode) or rings (Radial mode). Each Origin's own line/ring holds the live base recipe and blends to its own per-Tile-type target values over its **Reach**, on whichever **Sides** it is set to.

## Origin model (amended 2026-07-29, #48)

The user asked to "increase the distance from the boundary over which the morph takes place". Under the previous model the only lever was dragging a stop further out, which also moved where its values took effect. Each stop is now a self-contained ramp instead of a link in a shared chain:

- the Origin's line/ring holds the **live base recipe** (the ordinary Composition angle sliders),
- its `figures` overlay is the **target**, reached at `position ± reach` and clamped beyond,
- `sides` picks which side(s) the ramp extends into; the other side stays at the base recipe.

```
BOTH SIDES                          RIGHT SIDE ONLY
target ───╮             ╭───        target                 ╭───
           ╲           ╱                                  ╱
base        ╰────◉────╯             base  ────────◉──────╯
        P-r     P     P+r                         P     P+r
```

The blend is therefore continuous at the Origin in every case, and **Reach is literally "the distance over which the morph takes place"**.

Where several Origins could apply, the one whose **ramp is least advanced** at that point wins — smallest `|d − position| / reach`, among Origins whose active side faces the point. There is no blending between Origins and no compounding: one Origin governs each point outright (user decision 2026-07-29). Where no Origin's active side faces a point, the base recipe applies unchanged.

### Auto-fit and territory (#49)

Comparing the *ramp parameter* rather than raw distance is what makes reach **claim territory**: two Origins hand over where their ramps meet, at `gap · rA / (rA + rB)` from A, so an Origin with 3× its neighbour's reach governs 3× as much of the gap. Equal reaches collapse this to the midpoint.

`MorphOrigin.autoReach` (on by default for newly added Origins) resolves each side's reach live as **half the gap to the adjacent Origin on that side**, so neighbouring ramps meet exactly midway with no clamped plateau between them and no overlap — and the handover lands on the midpoint. It falls back to the stored `reach` on a side with no neighbour, and re-fits automatically as Origins are dragged. Switching it off freezes the resolved value into `reach` so the render doesn't jump.

Two consequences worth stating plainly:

- **Meeting halfway is smooth when adjacent targets are similar** (`base → T → base` is continuous). Two adjacent Origins with very different targets still step at the handover — that is inherent to one-Origin-governs-each-point, not something auto-fit can remove.
- **Freezing an asymmetric auto Origin loses a side.** When the two neighbours sit at different distances the Origin resolves to two different reaches, and one stored number cannot preserve both; the reducer keeps the **tighter** of the two (the side actually fitted to a neighbour, and the one that can never overshoot into a neighbour's territory).

This replaces the implicit-stop-at-0 machinery entirely: base is now simply the value everywhere no Origin reaches, so the ordinary sliders stay live without a special case. *History:* #37 first shipped CSS-gradient semantics with no implicit stop, which made one Boundary apply uniformly and left the base sliders inert; 2026-07-18 added an implicit stop at position 0 carrying the start recipe; #48 generalised that into a per-Origin ramp with an explicit Reach and Sides.

## Scope

- **v1:** angles only — `contactAngle`, plus `vertexContactAngle` where vertex lines are decoupled. All other recipe fields (lengths, toggles, curves) are held from the start recipe.
- **Later (schema-ready now):** full `FigureConfig` interpolation — manual `lineLength`, curve control points. Stops store partial-overlay objects so this needs no migration.
- **Phase 2 (deferred, separate effort):** topology morph — the underlying Tiling transitions between Configurations.
- Builder-only, authored in the **Composition Phase only** (amended 2026-07-18 — originally "Composition onwards"): the Decoration Phase **freezes** the Morph like Strand geometry (ADR-0005 idiom) — the morphed field still renders, but the overlay + sidebar section hide. Design Phase renders bare Tiles and is unaffected. The Gallery renders whatever a save carries (a saved morph must render faithfully in `faithfulRender.ts`).

## Data model

Top-level on `PatternConfig` (mirrors `figures` / `frame`; absent ⇒ no morph):

```ts
interface MorphConfig {
  enabled: boolean
  mode: 'linear' | 'radial'
  // The AXIS reference point — where `position` is measured from. Named
  // `axisOrigin` so it doesn't collide with the per-stop Morph Origins.
  // Labelled "Axis" (linear) / "Centre" (radial) in the UI.
  axisOrigin: { x: number; y: number }    // world/Patch space
  direction?: { x: number; y: number }    // linear only, unit vector
  easing: 'linear'                        // reserved; only 'linear' in v1
  origins: MorphOrigin[]                  // ordered by position ascending
}

type MorphSides = 'both' | 'negative' | 'positive'   // UI: Both/Left/Right or Both/Inside/Outside

interface MorphOrigin {
  id: string
  position: number                        // world-space distance from axisOrigin
  reach: number                           // distance the blend runs over; 0 = hard step
  autoReach?: boolean                     // #49 — fit to half the gap to each neighbour
  sides: MorphSides                       // which side(s) the blend extends into
  // Partial overlay per tileTypeId — the TARGET, reached at `reach`.
  // v1 reads contactAngle/vertexContactAngle.
  figures: Record<string, Partial<FigureConfig>>
}
```

Field evaluation at a world point `p`:

- Linear: `d = dot(p − axisOrigin, direction)`; Radial: `d = |p − axisOrigin|`.
- Resolve each candidate's reach via `originReach` (honours `autoReach`).
- Pick the Origin with the smallest `u = |s| / reach` **among those whose active side faces `d`** (`s = d − position`; `both` always, `negative` iff `s ≤ 0`, `positive` iff `s ≥ 0`). Restricting the contest to active sides matters — an Origin that only morphs to its left must not shadow a further Origin that really does morph the point on its right.
- None ⇒ the base recipe, unchanged.
- Otherwise clamp `u` to 1 and the value is `base·(1−u) + target·u`. A `reach` of 0 is a hard step: base exactly on the line, target either side of it. A zero-reach Origin is fully advanced the instant you leave its line, so it claims no territory against a neighbour that has any reach — but a lone one still governs.

**Legacy saves.** `readMorphConfig` accepts both the current `{ axisOrigin, origins }` and the pre-#48 `{ origin, boundaries }`. A legacy boundary `i` at `P_i` whose predecessor sat at `P_{i−1}` (`P_0 = 0`, the old implicit stop) becomes an Origin at `position = P_{i−1}` reaching `|P_i − P_{i−1}|` toward it. **Exact for a single boundary** — by far the common case; **approximate for chains of 2+**, since each converted Origin restarts from base where the old chain accumulated stop to stop. Deliberate: blending between Origins was explicitly ruled out, so an exact chain conversion isn't expressible.

World-space means pan/zoom never changes the pattern and the field saves deterministically. Under the Lattice, each stamped Patch copy sees a different `t` — that is the point.

## Geometry engine (the crux)

**θ is evaluated per edge midpoint, not per polygon** (ADR-0009 §2). `computeContactRays(poly, θ)` (`src/pic/stellation.ts`) gains a per-edge variant: for each edge, evaluate `t` at the edge midpoint in world space and derive that edge's θ from the morph field. A shared edge has one midpoint ⇒ both polygons emit rays at the same θ there ⇒ Strands stay straight through every contact point by construction. Bending is absorbed at star tips.

Consequences inside PIC:

- Polygons under a morph have **asymmetric θ across their edges**. Pair-A tip intersections still exist for gradient-scale differences, but the edge-slide / pair-selection branches of `emitStarArms` + `pairAtVertex` are the fragile part of the pipeline — build the **probe suite first**: sweep linear + radial gradients over the square/hex/triangle defaults *and* the known-nasty cases (tetrakis right-triangle, irregular convex completions), assert no double-emission, no leaked rays, no short-stub storms.
- Auto line-length and snap computations that assume one θ per tile type need auditing where they intersect the morph path.
- The morph disables perf fast-paths that assume per-tile-type uniformity (the `<use>` stamping Lever A path) — morphed rendering is compute-bound like multi-cell Composition, and every polygon's Figure is genuinely unique.
- Vertex lines: when decoupled, `vertexContactAngle` interpolates through the same field.

## UI

Composition-Phase sidebar gains a **Morph section**:

- Enable toggle + mode picker (Linear / Radial).
- **Add Origin** button; a list of Origins, each expandable to **Position**, **Reach** (with a per-Origin **Auto — meet neighbours halfway** toggle that disables the slider while on), a **Sides** toggle (Both / Left / Right in Linear, Both / Inside / Outside in Radial) and per-Tile-type "*angle at reach*" sliders. The reach readout shows both sides when auto-fit resolves them differently (`400 / 300`). A new Origin is pre-filled from the field's current effective value **at the far end of its ramp**, so adding one changes nothing until edited — with no other Origins that is simply the base recipe, a flat and invisible addition.
- On canvas: the axis point/centre and direction arrow are draggable handles; each Origin renders as a faint draggable line (Linear) / ring (Radial), plus a **dashed reach extent** at `position ± reach` on each active side marking where the target is fully reached. The extent is a read-only annotation — `reach` is edited on the sliders, so the line stays a pure position handle.
- Selecting an Origin on canvas summons a **transient bar docked at the bottom of the screen** carrying Position, Reach and Sides — present only while an Origin is selected.
- Morph edits are Composition-phase actions: **not** in the Design undo allowlist (`DESIGN_MODE_ACTIONS`), same footing as figure/strand tuning.
- Origins/handles/extents are overlays: excluded from exports via the existing `data-export="exclude"` mechanism, hidden outside the Composition+ phases as appropriate.

## Interactions with existing features

- **Decoration:** accepted degradation — under a morph almost every Void is geometrically unique, so Congruent-scope Fill degrades to per-void manual painting; Strand colour + weave work unchanged. Documented, not gated. Recovery idea captured separately: Decoration box-select (memory `project_decoration_box_select_idea.md`).
- **Frame:** clips as usual; no special interaction expected (verify Frame-scoped completion Tiles pick up per-edge θ like any world-space Tile).
- **Guides / guideTiles:** world-space Tiles run through the same per-edge θ evaluation — no special casing.
- **Save/load:** `morph` validated at load alongside `frame`; absent in every existing save (additive, no migration).

## Slices

1. **Engine** — `MorphConfig` schema + validation, field evaluation (linear/radial, stops, clamp), per-edge θ in `computeContactRays` + `runPIC` threading, fast-path opt-out, **probe suite first**. (Model: Fable — touches fragile PIC branches.)
2. **UI** — sidebar Morph section, on-canvas Boundary/handle overlays, transient bottom position slider, export exclusion, reducer actions. (Model: Sonnet, over the slice-1 primitives.)
3. **Follow-up (later)** — full-capability interpolation: manual `lineLength`, curve control points; easing curves. (Model: Opus.)
