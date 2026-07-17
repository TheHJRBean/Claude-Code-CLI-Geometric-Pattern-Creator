# Pattern Morph — Spec (v1)

**Status:** Grilled + signed off 2026-07-17. Decisions in `docs/adr/0009-morph-boundaries.md`; vocabulary in `CONTEXT.md` (**Morph**, **Morph Boundary**). Idea provenance: memory `project_pattern_morph_idea.md`.

A **Morph** spatially interpolates Figure-recipe parameters across the canvas of a Builder Composition. The start state is the Patch's ordinary `figures` map; the user adds one or more **Morph Boundaries** — draggable lines (Linear mode) or rings (Radial mode) — each carrying its own per-Tile-type values that the pattern reaches at that position. Parameters blend piecewise between consecutive stops, so an intermediate Boundary lets a pattern morph out and back.

## Scope

- **v1:** angles only — `contactAngle`, plus `vertexContactAngle` where vertex lines are decoupled. All other recipe fields (lengths, toggles, curves) are held from the start recipe.
- **Later (schema-ready now):** full `FigureConfig` interpolation — manual `lineLength`, curve control points. Stops store partial-overlay objects so this needs no migration.
- **Phase 2 (deferred, separate effort):** topology morph — the underlying Tiling transitions between Configurations.
- Builder-only, configured from the **Composition Phase onwards**. Design Phase renders bare Tiles and is unaffected. The Gallery renders whatever a save carries (a saved morph must render faithfully in `faithfulRender.ts`).

## Data model

Top-level on `PatternConfig` (mirrors `figures` / `frame`; absent ⇒ no morph):

```ts
interface MorphConfig {
  enabled: boolean
  mode: 'linear' | 'radial'
  // Linear: origin + unit direction; t grows along dir from origin.
  // Radial: origin = centre; t grows with distance.
  origin: { x: number; y: number }        // world/Patch space
  direction?: { x: number; y: number }    // linear only, unit vector
  easing: 'linear'                        // reserved; only 'linear' in v1
  // Ordered by position ascending. position = world-space distance from
  // origin (along direction for linear, radially for radial).
  boundaries: MorphBoundary[]
}

interface MorphBoundary {
  id: string
  position: number                        // world-space distance from origin
  // Partial overlay per tileTypeId; v1 reads contactAngle/vertexContactAngle.
  figures: Record<string, Partial<FigureConfig>>
}
```

Field evaluation at a world point `p`:

- Linear: `d = dot(p − origin, direction)`; Radial: `d = |p − origin|`.
- `d ≤ boundaries[0].position` → start recipe (the plain `figures` map applies **at the origin side**; the first Boundary is the first stop *away* from pure-start).
- Between consecutive stops → piecewise-linear blend of the two stops' effective values (a stop's effective value = start value overridden by its overlay).
- `d ≥ last.position` → last stop's values. (Clamped band — beyond the span the pattern is pure first/last stop; the morph is a controllable band, not viewport-relative.)

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
- **Add Boundary** button; a list of stops, each expandable to per-Tile-type end-angle sliders. A new Boundary is pre-filled from the *effective values at its position* (so adding one changes nothing until dragged).
- On canvas: the origin/centre and direction arrow are draggable handles; each Boundary renders as a faint draggable line (Linear) / ring (Radial).
- Selecting a Boundary on canvas summons a **transient position slider docked at the bottom of the screen** — present only while a Boundary is selected.
- Morph edits are Composition-phase actions: **not** in the Design undo allowlist (`DESIGN_MODE_ACTIONS`), same footing as figure/strand tuning.
- Boundaries/handles are overlays: excluded from exports via the existing `data-export="exclude"` mechanism, hidden outside the Composition+ phases as appropriate.

## Interactions with existing features

- **Decoration:** accepted degradation — under a morph almost every Void is geometrically unique, so Congruent-scope Fill degrades to per-void manual painting; Strand colour + weave work unchanged. Documented, not gated. Recovery idea captured separately: Decoration box-select (memory `project_decoration_box_select_idea.md`).
- **Frame:** clips as usual; no special interaction expected (verify Frame-scoped completion Tiles pick up per-edge θ like any world-space Tile).
- **Guides / guideTiles:** world-space Tiles run through the same per-edge θ evaluation — no special casing.
- **Save/load:** `morph` validated at load alongside `frame`; absent in every existing save (additive, no migration).

## Slices

1. **Engine** — `MorphConfig` schema + validation, field evaluation (linear/radial, stops, clamp), per-edge θ in `computeContactRays` + `runPIC` threading, fast-path opt-out, **probe suite first**. (Model: Fable — touches fragile PIC branches.)
2. **UI** — sidebar Morph section, on-canvas Boundary/handle overlays, transient bottom position slider, export exclusion, reducer actions. (Model: Sonnet, over the slice-1 primitives.)
3. **Follow-up (later)** — full-capability interpolation: manual `lineLength`, curve control points; easing curves. (Model: Opus.)
