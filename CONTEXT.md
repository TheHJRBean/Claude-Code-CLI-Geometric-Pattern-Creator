# Geometric Pattern Creator

A React + TypeScript app that generates traditional Islamic geometric patterns via Kaplan's Polygons-in-Contact (PIC) method, with an interactive editor for authoring custom tessellations.

## Language

### App — workspaces

**Gallery**:
The default app workspace — a curated picker for predefined **Compositions** built on Archimedean tilings (square, hex, 4.8.8, etc.). The user picks a Composition, tunes its parameters, and exports. The user toggles between Gallery and **Lab** at the top level.
_Avoid_: main, home, default mode, classic mode

**Lab**:
The entire workflow space outside Gallery where building / experimentation happens. Currently contains the **Builder**; structured to host more exploratory tools in future. Has the subtitle "Exploratory Workspace".
_Avoid_: editor (reserved for the code namespace `src/editor/`), tessellation lab (when used as the umbrella; "Tessellation Lab" still names the current Builder screen header until refactor lands)

### Lab — tools and modes

**Builder** _(UI label)_:
The current tool inside the Lab — the tessellation-authoring surface. In code this lives under the `Editor` namespace (`src/editor/`, `EditorPatch`, `EditorTile`…). The visible label users see in the Lab is "Builder".
_Avoid_: tessellation editor, patch editor; in code, keep the existing `Editor` prefix for now

**Phase** _(Builder concept)_:
A stage of the build workflow inside the Builder. The canonical sequence is **Design → Composition → Decoration**. Only Design and Composition are live today; Decoration is a reserved Phase name — when it ships it slots after Composition. (Framing was once a reserved Phase here; it has been demoted to a persistent **Frame** overlay that spans both live phases — see ADR-0003 amendment.) The word "phase" carries the *sequence* of authoring even though the user can move between live phases freely.
_Avoid_: mode, tab, view (the Builder may have modes within a phase, but a phase is the higher-level stage)

**Frame**:
A finite, bounded region — a **persistent overlay**, not a Phase — that wraps the **Composition**, turning the otherwise-unbounded tiled field into a presentable artifact. The Frame is live across both **Design** and **Composition** (and read later by **Decoration**); the pattern clips to its outline in both. A Frame is centered and parameter-driven (size / aspect / rotation) and has a *type* — either it follows whole repeat units (an n-ring of neighbouring **Patch** stamps; boundary = the outline of the stamped block) or it imposes a geometric shape (square, √2 rectangle, hexagon, octagon, pentagon). The Frame's region is what the **Decoration** Phase fills (ADR-0003). The Frame is structural only: it defines the region and border *geometry*, while all border *styling* (colour, width, weave) belongs to **Decoration**. There is a single noun — *Frame* — distinguished by its type; the variants are not separate families.

A Shape-type Frame also acts as a **completion boundary**, but with no bespoke operation: its edge exposes **Frame nodes** (spaced one seed `edgeLength` apart, including corners) that become clickable targets in the ordinary **Complete** mode. The user completes tiles *out to* the frame by picking frame nodes together with interior vertices; a Complete that touches a frame node stores its Tile **frame-scoped** (world space, on `frame.completedTiles`), so it sits at the edge without repeating under the **Lattice**, and PIC runs over it so **Strands** flow to the frame edge. Whatever isn't completed is hard-**clipped** at the outline. The n-ring type has no gap, so it never completes — it only clips.
_Avoid_: crop, mask, clip, window (those are mechanisms or metaphors, not the noun); "Tiling frame" / "Shape frame" (rejected — one noun, Frame, with a type); bare "node" (use **Frame node** for the seed-spaced division points); "Framing phase" (the Frame is a persistent overlay, not a Phase)

**Decoration** _(Phase, reserved)_:
Final Phase where the user assigns line colours, gap fills, and reintroduced strand weaving. Not yet implemented — placeholder name only. The future **Fill** vocabulary lives here (colour-fill of gaps), which is why the Design-phase operation is called **Complete**, not Fill. **Builder-only**: Decoration is the third Builder Phase and its data lives on `editor.decoration`. The **Gallery** is *not* decorated — it keeps the single global **StrandStyle** (`PatternConfig.strand`) as its only "look" control. (This resolves the older idea-memo framing of Decoration as a universal Gallery+Builder finishing stage — rejected; it is a Builder Phase.) Its two Stage-1 targets are **Strand colour** and **Void Fill**, each with an independent **Grouping scope**. Decoration is **style-only**: strand *geometry* (contact angle, line length, curve, **Figure recipe**) is **frozen** here — those edits live in **Composition**. Only colour changes; **Voids** stay stable (their congruent signatures are the keys that **Fill** colours attach to, so geometry must not move under them). To reshape a strand, **phase-switch** back to Composition; re-entering Decoration re-extracts Voids and colours persist for surviving signatures. A **Frame** is the *preferred* bound (it gives a clean exportable artifact) but is **not required** — absent a Frame, the **Void** arrangement is computed over the current viewport (the identity-keyed colours stay stable as you pan). This relaxes ADR-0003's "Decoration needs the Frame as its region" — see the ADR-0003 amendment.
_Avoid_: "finishing stage" / "post-generation pipeline" as if it wraps the Gallery — Decoration is scoped to the Builder

**Phase-switch**:
The act of moving between phases (e.g. Design → Composition). The cross-cutting verb. Replaces the older code term "flip". Triggers like auto-complete are named after the destination phase ("auto-complete on phase-switch to Composition").
_Avoid_: flip, toggle, switch (use the full "phase-switch" — bare "switch" is overloaded)

**Design** _(Phase)_:
The Builder phase where the user authors **Tiles** into **Cells** of a **Patch**. Click-to-place, Complete, delete, symmetry-aware editing all happen here.
_Avoid_: design mode (drop the suffix), authoring mode, build mode

**Composition** _(Phase)_:
The Builder phase where the **Patch** is composed into the rendered tiled output. The user sees the full **Composition** (output) here and tunes PIC settings (contact angle, figures, lacing) without mutating Tiles.
_Avoid_: strand editor, strand mode, preview mode, render mode

### Tiling — substrate vocabulary

**Tiling**:
The polygon coverage of the plane — bare polygons, no PIC strands. The geometric substrate that PIC runs over. Produced in two ways:
- In the Gallery: by the BFS generator over an Archimedean **Configuration** seed.
- In the Builder: by stamping a **Patch** across the canvas via a **Lattice**.

Distinct from **Composition** (Tiling + Strands rendered).
_Avoid_: tessellation (deprecated alias — kept only as an informal synonym; not in code or canonical prose)

**Lattice**:
The translation basis that stamps a **Patch** across the canvas to produce the **Tiling**. Cell vectors live in `compositionLatticeStamps` / `editorLatticeStamps`. Standard math term.
_Avoid_: grid, tiling vectors, repeat basis

**Archimedean**:
The family of edge-to-edge tilings whose vertices are all transitive (same vertex configuration at every vertex). The current Gallery generator handles this family. Literature term — keep as-is.

### Pattern — PIC output vocabulary

The Polygons-in-Contact (PIC) pipeline produces the rendered pattern from the **Tiles** of a **Patch**. The hierarchy, from atomic piece outward:

**Ray**:
The atomic, trimmed line piece visible in the rendered pattern — one straight (or curved) stroke. Inside a polygon, several Rays assemble into a **Figure**. Across polygons, Rays chain into **Strands**. The user-facing word; tools and sliders that "adjust strands" almost always operate at the Ray level — UI labels should clarify this.
_Avoid_: line, segment (legacy code names — both fold into Ray), stroke

**Contact Ray**:
The pre-trim parametric ray emanating from a polygon edge at ±(π/2 − θ) in `pic/stellation.ts`. Trimmed to its nearest intersection to become a **Ray**. Code-internal term only; not user-facing.
_Avoid_: contact line, ray (without "contact" — bare "Ray" refers to the trimmed visible piece)

**Figure**:
The motif rendered inside *one polygon* — the star/rosette assembled from that polygon's Rays. Kaplan's PIC term. Per-polygon scope: every polygon of the same tile type renders the same Figure, but each polygon has its own Figure instance.
_Avoid_: star, motif (acceptable casual synonyms but use "Figure" in code and CONTEXT.md), rosette (was previously a Figure type; removed — see project history)

**Figure recipe** _(code: `FigureConfig`)_:
The per-tile-type configuration that drives all Figures of a given tile type (`contactAngle`, `lineLength`, edge/vertex line toggles, curve config). Keyed by `tileTypeId`. Distinct from the rendered Figure — the recipe is shared across all polygons of one tile type; the Figure is one polygon's render.
_Avoid_: figure config (in conversation; the type name `FigureConfig` stays in code), figure settings

**Strand**:
A chain of linked **Rays** that runs across polygons in the rendered pattern. Strands are what the eye follows as continuous interlaced lines. Distinct from a Ray (atomic piece) and from a Figure (per-polygon assembly).
_Avoid_: line, polyline, path (when referring to the linked output)

**Void**:
A region of the rendered **Composition** enclosed by **Strands** — a bounded face of the strand arrangement (the planar graph the Rays form). The thing the **Decoration** Phase **Fill**s with colour. Strictly distinct from a Design-phase *gap* (the un-tiled area inside a **Cell** that **Complete** fills with **Tiles**) — different concept, different operation, deliberately a different word so "gap" and "Void" never collide. Two Voids are **similar** when they are **congruent** (same shape + size); the Stage-1 "colour all similar Voids" control fills every congruent Void together. (Lattice/symmetry-orbit grouping is a later, stricter refinement — not Stage 1.)
_Avoid_: gap (reserved for the Design/Complete tile-gap), cell/region/interstice (rejected — the canonical noun is **Void**), background (the canvas backdrop is `StrandStyle.background`, not a Void)

**Fill** _(Decoration operation)_:
The Decoration-Phase operation that colours a **Void**. The name was reserved for exactly this since ADR-0002 (which is why the Design-phase tile-gap operation is **Complete**, not Fill). Fill colours Voids; it never adds geometry. The companion operation that colours **Strands** is **Strand colour** (extends the existing global `StrandStyle.color` down the **Grouping scope** ladder). Both are scoped independently — see **Grouping scope**. Both are applied through **Paint mode**.
_Avoid_: "paint a Void" / "paint" as a bare synonym for the Void operation (the operation is **Fill**); colour-fill (casual ok); complete (that's the Design tile operation)

**Paint mode** _(Decoration interaction)_:
The Decoration interaction mode the user enters by selecting the **Paint tool** (signalled by a bucket cursor) with an *active colour* set. Clicking a target applies the active colour to that target's whole **Grouping scope** group — performing a **Fill** when the target is a **Void** and a **Strand colour** when it is a **Strand**. The affected group is shown with a faint **affected-group highlight** before commit (on hover if performant, else on first click). "Paint" names the *mode*; it is **not** a synonym for the **Fill** operation.
_Avoid_: paint bucket / fill tool (UI nicknames ok, but the canonical mode is **Paint mode**, the canonical Void operation is **Fill**)

**Grouping scope** _(Decoration)_:
The rung that decides how many targets share one colour, on a coarse→fine ladder: **Congruent** (every same-shape target, anywhere) → **Patch** (targets at the same position within the **Patch** repeat unit, i.e. the **Lattice** orbit) → **Cell** (targets within a **Cell**, grouped by that Cell's **symmetry** orbit) → **Instance** (one specific target, no grouping). **Strand colour** and **Void Fill** each carry their **own independent** Grouping scope (e.g. Congruent strands over per-Cell Voids). Stage 1 shipped **Congruent** for both; Stage 2 (2026-06-10) added **Patch** for both and **Instance** for Voids behind a per-target **Reach** selector (UI labels: Matching / Repeat / Single for Voids; All / Matching / Single for Strands — a "Single" strand is its Patch orbit, so the pattern stays periodic). **Cell** remains reserved. Implementation-wise every rung is just a different identity *key* on one shared `{ scope, key, colour }` record — and because the key is *identity*, not world position, colours stay stable as the field pans (which is what lets Decoration run over a viewport bound, not only a **Frame**).
_Avoid_: granularity / level / tier (use "scope"); "per-class" (ambiguous — name the rung)

**Lacing**:
The over/under interlace effect rendered on top of **Strands** to give the woven appearance. Standard term in Islamic-geometry literature. The current implementation is non-functional; lacing will be removed and reintroduced under the **Decoration** phase. Reserved term — kept in CONTEXT.md because the word is unambiguous and load-bearing in the literature.
_Avoid_: weaving, interlace, braiding (acceptable casual synonyms but use "Lacing" in code and CONTEXT.md)

### Builder — operations

**Complete**:
The Design operation that fills gaps around placed **Tiles** with regular polygons (or irregular fallbacks). Runs on click or automatically on switch to **Composition** mode (auto-complete). Tiles produced this way have `source: 'completed'`. The word "fill" is intentionally reserved for the future Decoration stage's colour-fill operation; tooltips should clarify that Complete refers to filling gaps with **Tiles**, not colour.
_Avoid_: fill, auto-fill, resolve, tessellate

### Lab — structural hierarchy

From outermost rendering concept down to the smallest user-placed shape:

**Composition** (output):
The rendered tiled output — the **Patch** repeated across the canvas, seen in the Composition mode. Same word as the mode name: you're *in* the Composition mode, looking at *the* Composition.
_Avoid_: tiling output, layout result

**Configuration**:
The named tessellation family, identified by its vertex notation (e.g. `"4.8.8"`, `"3.6.3.6"`, `"6.6.6"`). The literature alias is **vertex configuration** — use that when precision matters. Both the **Gallery** and the **Builder** reference Configurations:
- In the Gallery, a Configuration drives the BFS polygon generator to tile the plane.
- In the Builder, a Configuration identifies a multi-cell **Patch**'s layout (e.g. octagon + square for `"4.8.8"`).

Configuration is stored only on multi-cell Builder Patches; single-cell Patches have no Configuration field (their Cell shape implicitly identifies the tessellation).
_Avoid_: boundary configuration, layout, arrangement, pattern family

**Patch**:
One repeat unit of the **Composition**. Always contains one or more **Cells**. This is what the user designs into.
_Avoid_: boundary composition, repeat, unit

**Cell**:
One polygon within a **Patch** (e.g. the octagon or square in 4.8.8, or the lone square in a single-cell Patch). Carries the **Tiles** authored against it, plus its own shape, size, rotation, and symmetry settings.
_Avoid_: BoundaryTile, sub-tile

**Boundary**:
The closed perimeter of a **Cell** as geometry — the outline the user clicks on, snaps to, or builds inward from. Refers to the curve, not the Cell itself.
_Avoid_: outline (when used to mean the polygon), edge (an edge is one side, a boundary is the whole closed loop)

**Tile**:
A polygon the user places (or that auto-complete produces) inside a **Cell**. Always refers to the interior, user-placed scale.
_Avoid_: piece, shape (when referring to user-placed polygons)

**Seed Tile**:
The auto-placed starter **Tile** the editor drops into a Cell so the user has something to build from. Identified by `source: 'seed'`.
_Avoid_: origin tile, initial tile, auto tile

**Tile source**:
Where a Tile came from. One of `'seed'` (auto-placed starter), `'placed'` (user-placed), or `'completed'` (produced by the Complete operation). The field on a Tile is `source`.
_Avoid_: origin (reserved for the geometric `(0,0)` point), provenance

## Relationships

- A **Composition** is a **Tiling** with **Strands** rendered on top, seen in the Builder's Composition Phase
- A **Tiling** is a **Patch** stamped across the canvas via a **Lattice** (Builder), or generated from a **Configuration** by BFS (Gallery)
- A **Patch** contains one or more **Cells**; multi-cell Patches also carry a **Configuration**
- A **Cell** has a **Boundary** (its closed perimeter) and carries zero or more **Tiles**
- A **Tile** has a `source` of `'seed'`, `'placed'`, or `'completed'`
- A **Strand** is a chain of **Rays** across polygons; one polygon's Rays assemble into a **Figure**
- A **Figure** is driven by a per-tile-type **Figure recipe** (`FigureConfig`)
- **Lacing** is the over/under interlace effect rendered on top of Strands (reserved — current implementation removed; returns under Decoration)

## Example dialogue

> **Dev:** "When the user is in the **Design** phase of the **Builder**, editing the square **Cell** of a `4.8.8` **Patch**, the **Tiles** they place go into that Cell's interior — right?"
> **Domain expert:** "Yes. And when they **phase-switch** to **Composition**, what they see is the **Composition**: the whole Patch (octagon Cell + square Cell, both with their Tiles) tiled across the canvas per the `4.8.8` **Configuration**, with **Strands** rendered on top by chaining each polygon's **Rays** through PIC. The strand-adjustment sliders mostly operate at the Ray level even though they're labelled 'strand' — that's a UI tooltip we owe."

## Flagged ambiguities

- "tile" previously meant both interior user-placed polygons AND the cell-scale polygons of a multi-shape composition (`BoundaryTile`) — resolved: **Tile** is the interior scale; the cell-scale concept is a **Cell**.
- "composition" was previously used for the multi-cell data structure (`BoundaryComposition`) — resolved: that role belongs to **Patch**; **Composition** is reserved for the rendered tiled output.
- "configuration" and "composition" were used interchangeably in prose — resolved: **Configuration** is the named template (e.g. `"4.8.8"`), **Composition** is the rendered output, **Patch** is the data structure for one repeat.
- Single-cell vs multi-cell Patches use a uniform recursive shape: every Patch has at least one Cell. The legacy "single-shape EditorPatch with `tiles[]` directly" form is being migrated to always carry a Cell layer.
- "origin" previously meant both "the auto-placed centre tile" (`EditorTileOrigin = 'origin' | ...`) and the geometric world origin — resolved: the auto-placed Tile is a **Seed Tile** with `source: 'seed'`; **origin** means the geometric `(0,0)` point only.
