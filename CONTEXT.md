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
A stage of the build workflow inside the Builder. The canonical sequence is **Design → Composition → Framing → Decoration**. Only Design and Composition are live today; Framing and Decoration are reserved Phase names — when they ship they slot into this order. The word "phase" carries the *sequence* of authoring even though the user can move between live phases freely.
_Avoid_: mode, tab, view (the Builder may have modes within a phase, but a phase is the higher-level stage)

**Framing** _(Phase, reserved)_:
Post-Composition Phase where the user wraps the **Composition** in a frame (n-ring, square, √2, hex, octagon, traditional). Not yet implemented — placeholder name only.

**Decoration** _(Phase, reserved)_:
Final Phase where the user assigns line colours, gap fills, and reintroduced strand weaving. Not yet implemented — placeholder name only. The future **Fill** vocabulary lives here (colour-fill of gaps), which is why the Design-phase operation is called **Complete**, not Fill.

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
