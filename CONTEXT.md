# Geometric Pattern Creator

A React + TypeScript app that generates traditional Islamic geometric patterns via Kaplan's Polygons-in-Contact (PIC) method, with an interactive editor for authoring custom tessellations.

## Language

### App — workspaces

**Gallery**:
The saved-patterns **browser** (ADR-0006, convergence flip) — a read-only showcase over the merged library (`pattern-library-v1`), *not* an authoring surface. A thumbnail grid of clean overlay-free renders; click a card for a pan/zoom detail view (the finished artifact — editor saves show decorated + framed, legacy saves render their BFS/Taprats path with their Gallery Frame and carry a `sourceCategory` badge). Per-card **rename / duplicate / delete / export-JSON**; **"Edit in Lab"** hands a save into the Lab to author (editor saves verbatim, tier-1 legacy presets convert one-way). There is **no tuning sidebar** — the former parameter/figure/frame controls live in the Lab. An empty Gallery points the user to the Lab. The user toggles between Gallery and **Lab** at the top level; internal `AppMode` value `'main'` + the `app-mode` localStorage key are unchanged (Q9).
_Avoid_: main, home, default mode, classic mode; "picker" / "tuner" (the Gallery no longer tunes — it browses)

**Lab**:
The **default** authoring workspace (a fresh profile opens here; a returning user's persisted choice is respected) — the workflow space where building / experimentation happens. Contains the **Builder**; **presets** load here as editable **Patches** via the Presets shelf (ADR-0006). Structured to host more exploratory tools in future. Has the subtitle "Exploratory Workspace".
_Avoid_: editor (reserved for the code namespace `src/editor/`), tessellation lab (when used as the umbrella; "Tessellation Lab" still names the current Builder screen header until refactor lands)

**Generator** _(ADR-0007)_:
The third top-level mode alongside Gallery and Lab — a random-pattern slot machine and taste-dataset collector. Samples a random look over a shipped preset substrate, shows one finished pattern at a time, and records a single 0–10 rating per sample (drag-to-release slider, auto-advance; Space skips, F flags broken) into a durable dataset (IndexedDB + JSONL export) for a future ML taste model. Offers **Save to library** and **Open in Lab** on the current sample. Colour and Frame are frozen in v1 (later "presentation loops" rate them independently on fixed geometry).
_Avoid_: Studio, Rate mode, randomizer; "suggest mode" (that's the future ML arc, not v1)

### Lab — tools and modes

**Builder** _(UI label)_:
The current tool inside the Lab — the tessellation-authoring surface. In code this lives under the `Editor` namespace (`src/editor/`, `EditorPatch`, `EditorTile`…). The visible label users see in the Lab is "Builder".
_Avoid_: tessellation editor, patch editor; in code, keep the existing `Editor` prefix for now

**Presets shelf**:
The Lab-sidebar section (above My Tessellations) holding one read-only card per shipped catalogue tiling (`TILINGS`) — since the convergence flip this is where presets are *picked*; the Gallery only browses saves. Clicking a card mints a fresh working config: **tier-1** presets (every Archimedean entry, incl. David's and Kepler's Star) convert to a fully editable **Patch**; **tier-3** presets (`rosette-patch` — the Laves/rosette tilings and Archimedes' Star) load the legacy config and are badged **View only** (tunable θ/strands, no Patch editing) pending the irregular-tile Patch encoder. Code: `editor/presetShelf.ts` + `PresetShelfPanel.tsx` (ADR-0006).
_Avoid_: "Gallery preset" / "pick in the Gallery" (pre-flip language — presets live on the shelf; code identifiers keep the legacy `preset` naming); catalogue/template (casual ok, the canonical noun is **preset**)

**Phase** _(Builder concept)_:
A stage of the build workflow inside the Builder. The canonical sequence is **Design → Composition → Decoration**. Only Design and Composition are live today; Decoration is a reserved Phase name — when it ships it slots after Composition. (Framing was once a reserved Phase here; it has been demoted to a persistent **Frame** overlay that spans both live phases — see ADR-0003 amendment.) The word "phase" carries the *sequence* of authoring even though the user can move between live phases freely.
_Avoid_: mode, tab, view (the Builder may have modes within a phase, but a phase is the higher-level stage)

**Frame**:
A finite, bounded region — a **persistent overlay**, not a Phase — that wraps the **Composition**, turning the otherwise-unbounded tiled field into a presentable artifact. The Frame is live across both **Design** and **Composition** (and read later by **Decoration**); the pattern clips to its outline in both. A Frame is centered and parameter-driven (size / aspect / rotation) and has a *type* — either it follows whole repeat units (an n-ring of neighbouring **Patch** stamps; boundary = the outline of the stamped block) or it imposes a geometric shape (square, √2 rectangle, hexagon, octagon, pentagon). The Frame's region is what the **Decoration** Phase fills (ADR-0003). The Frame is structural only: it defines the region and border *geometry*, while all border *styling* (colour, width, weave) belongs to **Decoration**. There is a single noun — *Frame* — distinguished by its type; the variants are not separate families.

A Shape-type Frame also acts as a **completion boundary**, but with no bespoke operation: its edge exposes **Frame nodes** (spaced one seed `edgeLength` apart, including corners) that become clickable targets in the ordinary **Complete** mode. The user completes tiles *out to* the frame by picking frame nodes together with interior vertices; a Complete that touches a frame node stores its Tile **frame-scoped** (world space, on `frame.completedTiles`), so it sits at the edge without repeating under the **Lattice**, and PIC runs over it so **Strands** flow to the frame edge. Whatever isn't completed is hard-**clipped** at the outline. The n-ring type has no gap, so it never completes — it only clips.
_Avoid_: crop, mask, clip, window (those are mechanisms or metaphors, not the noun); "Tiling frame" / "Shape frame" (rejected — one noun, Frame, with a type); bare "node" (use **Frame node** for the seed-spaced division points); "Framing phase" (the Frame is a persistent overlay, not a Phase)

**Decoration** _(Phase, reserved)_:
Final Phase where the user assigns line colours, gap fills, and reintroduced strand weaving. Not yet implemented — placeholder name only. The future **Fill** vocabulary lives here (colour-fill of gaps), which is why the Design-phase operation is called **Complete**, not Fill. **Builder-only**: Decoration is the third Builder Phase and its data lives on `editor.decoration`. Preset-path / legacy configs are *not* decorated — they keep the single global **StrandStyle** (`PatternConfig.strand`) as their only "look" control (the Gallery browser just renders whatever a save carries). (This resolves the older idea-memo framing of Decoration as a universal Gallery+Builder finishing stage — rejected; it is a Builder Phase.) Its two Stage-1 targets are **Strand colour** and **Void Fill**, each with an independent **Grouping scope**. Decoration is **style-only**: strand *geometry* (contact angle, line length, curve, **Figure recipe**) is **frozen** here — those edits live in **Composition**. Only colour changes; **Voids** stay stable (their congruent signatures are the keys that **Fill** colours attach to, so geometry must not move under them). To reshape a strand, **phase-switch** back to Composition; re-entering Decoration re-extracts Voids and colours persist for surviving signatures. A **Frame** is the *preferred* bound (it gives a clean exportable artifact) but is **not required** — absent a Frame, the **Void** arrangement is computed over the current viewport (the identity-keyed colours stay stable as you pan). This relaxes ADR-0003's "Decoration needs the Frame as its region" — see the ADR-0003 amendment.
_Avoid_: "finishing stage" / "post-generation pipeline" as if it wraps the Gallery — Decoration is scoped to the Builder

**Phase-switch**:
The act of moving between phases (e.g. Design → Composition). The cross-cutting verb. Replaces the older code term "flip". Triggers like auto-complete are named after the destination phase ("auto-complete on phase-switch to Composition").
_Avoid_: flip, toggle, switch (use the full "phase-switch" — bare "switch" is overloaded)

**Design** _(Phase)_:
The Builder phase where the user authors **Tiles** into **Cells** of a **Patch**. Click-to-place, Complete, delete, symmetry-aware editing all happen here.
_Avoid_: design mode (drop the suffix), authoring mode, build mode

**Construct** _(Design-Phase mode, ADR-0008)_:
The Design-Phase tool mode where **Guides** are drawn and edited. Sits beside Place and Complete in the Tool toggle, mutually exclusive. Its toolbar (Guide tool = line / circle / divided circle, angle-step preset, snap toggle) appears only in-mode.
_Avoid_: construction mode, guide mode, draw mode

**Guide** _(ADR-0008)_:
A drawn construction element — compass-and-straightedge-style scaffolding on the Builder canvas. Variants: **Guide line** (two clicks; slice 1) and **Guide circle** (centre + radius; slice 2). A **divided Guide circle** is a Guide circle carrying `divisions` n > 0, which exposes **2n** equal division Anchors round the rim (the rosette scaffold, RESEARCH §2.1) — the "Divided" tool just pre-seeds n. Circles are closed (no `extend`); their ticks are spaced along the **arc**, and their size is set free-hand or via popup presets (×√2, tile-edge relative). Guides expose **Anchors** and produce **Tiles** via Place/Complete — never pattern lines (PIC stays the single rendering engine). Each Guide has a **stamp** toggle (default off): off = one-off world-space, on = Patch-relative, repeating in every **Lattice** stamp. Stamp state is shown by fixed system colour (violet = stamping, slate blue = not); no user-pickable Guide colours in v1. Guides persist with the Patch (`editor.guides`), are hidden by default in Composition behind an overlay toggle, and are always stripped from exports. "Construction line" survives as the informal/literature synonym only.
_Avoid_: construction line (in UI/code — canonical is Guide line); scaffold (casual ok); colliding with **Ray** / **Strand** / **Contact Ray**

**Anchor** _(ADR-0008, umbrella term)_:
ANY single point pickable for tile placement or Complete, app-wide: exposed vertices, **Frame nodes**, boundary-section points, neighbour vertices, and Guide anchors (kinds: intersection — incl. Guide×Tile-edge/Boundary — tick, manual, plus endpoints/centre/divisions). Consolidates flows that each named their points differently. Guide anchors are pickable in **Complete** as of slice 3 (#28): a Complete built off a **non-stamping** Guide anchor is stored world-space in `patch.guideTiles` (never repeats under the **Lattice**), a **stamping** one becomes an ordinary Cell Tile; **free-standing** Anchor-only Completes are allowed. Anchor→**Place** wiring (single-n-gon vertex placement) is the follow-up #33.
_Avoid_: pick target / node / point as canonical nouns (casual ok, umbrella term is Anchor)

**Composition** _(Phase)_:
The Builder phase where the **Patch** is composed into the rendered tiled output. The user sees the full **Composition** (output) here and tunes PIC settings (contact angle, figures, lacing) without mutating Tiles.
_Avoid_: strand editor, strand mode, preview mode, render mode

### Tiling — substrate vocabulary

**Tiling**:
The polygon coverage of the plane — bare polygons, no PIC strands. The geometric substrate that PIC runs over. Produced in two ways:
- On the **preset path**: by the BFS generator over an Archimedean **Configuration** seed, or by a Taprats data block for `rosette-patch` presets. This path serves the Lab's **Presets shelf** (view-only tiers), legacy saves rendered in the Gallery viewer, and the **Generator** — the Gallery itself no longer generates anything.
- In the Builder: by stamping a **Patch** across the canvas via a **Lattice**.

Distinct from **Composition** (Tiling + Strands rendered).
_Avoid_: tessellation (deprecated alias — kept only as an informal synonym; not in code or canonical prose)

**Lattice**:
The translation basis that stamps a **Patch** across the canvas to produce the **Tiling**. Cell vectors live in `compositionLatticeStamps` / `editorLatticeStamps`. Standard math term.
_Avoid_: grid, tiling vectors, repeat basis

**Archimedean**:
The family of edge-to-edge tilings whose vertices are all transitive (same vertex configuration at every vertex). The preset BFS generator (`tilings/archimedean.ts`) handles this family; non-Archimedean presets (`category: 'rosette-patch'`) go through Taprats data blocks instead. Literature term — keep as-is.

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
The rung that decides how many targets share one colour, on a coarse→fine ladder: **Congruent** (every same-shape target, anywhere) → **Patch** (targets at the same position within the **Patch** repeat unit, i.e. the **Lattice** orbit) → **Cell** (targets within a **Cell**, grouped by that Cell's **symmetry** orbit) → **Instance** (one specific target, no grouping). **Strand colour** and **Void Fill** each carry their **own independent** Grouping scope (e.g. Congruent strands over per-Cell Voids). Stage 1 shipped **Congruent** for both; Stage 2 (2026-06-10) added **Patch** for both, **Instance** for Voids, and **Cell** for both (UI label **Twins** — the clicked target plus its rotation/mirror twins under the host Cell's dihedral symmetry, per repeat) behind a per-target **Reach** selector (UI labels: Matching / Twins / Repeat / Single for Voids; All / Matching / Twins / Single for Strands — a "Single" strand is its Patch orbit, so the pattern stays periodic). The full ladder now ships; resolution precedence (fine wins): Instance > Patch > Cell > Congruent. Implementation-wise every rung is just a different identity *key* on one shared `{ scope, key, colour }` record — and because the key is *identity*, not world position, colours stay stable as the field pans (which is what lets Decoration run over a viewport bound, not only a **Frame**).
_Avoid_: granularity / level / tier (use "scope"); "per-class" (ambiguous — name the rung)

**Lacing**:
The over/under interlace effect on **Strands** that gives the woven appearance. Standard term in Islamic-geometry literature. Shipped 2026-06-10 as a **Strand style** toggle (`strand.weave` + `weaveGap`), available everywhere Strands render (Gallery + Builder), following Taprats' Interlace: crossings come from the full planar arrangement — shared chain points **and** transversal mid-edge intersections (how vertex-line Strands cross edge-line Strands); over/under alternates along each thread and opposes across each crossing (BFS 2-colouring, `src/strand/weave.ts`); the under thread breaks with a gap cut around the crossing (`src/strand/wovenPathD.ts`) — a path break, not a paint-over, so Void fills show through. The non-functional legacy two-pass renderer this replaces was removed in Phase 6 of the context refactor.
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
The named tessellation family, identified by its vertex notation (e.g. `"4.8.8"`, `"3.6.3.6"`, `"6.6.6"`). The literature alias is **vertex configuration** — use that when precision matters. Both the **preset path** and the **Builder** reference Configurations:
- On the preset path (Presets shelf / legacy saves / Generator), a Configuration drives the BFS polygon generator to tile the plane.
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
- A **Tiling** is a **Patch** stamped across the canvas via a **Lattice** (Builder), or generated from a **Configuration** by BFS / a Taprats block (preset path)
- A **Patch** contains one or more **Cells**; multi-cell Patches also carry a **Configuration**
- A **Cell** has a **Boundary** (its closed perimeter) and carries zero or more **Tiles**
- A **Tile** has a `source` of `'seed'`, `'placed'`, or `'completed'`
- A **Strand** is a chain of **Rays** across polygons; one polygon's Rays assemble into a **Figure**
- A **Figure** is driven by a per-tile-type **Figure recipe** (`FigureConfig`)
- **Lacing** is the over/under interlace effect on Strands (shipped 2026-06-10 as the `strand.weave` Strand-style toggle, Taprats-guided)

## Feature parity across modes

**Retired by the convergence flip (ADR-0006).** The old "Gallery vs Builder"
parity matrix framed the two as parallel *authoring* modes; convergence dissolves
that framing — the **Gallery** is now a read-only browser and all authoring is
Builder-only, so most former gaps are moot. Resolved rows (dropped): **Export**
is one uniform menu across every config source (Unwoven-SVG archived — Q8b);
Gallery/Builder **Vertex placement**, **Multi-cell editing model**, and **n-ring
Frame** all closed 2026-06-18. The `Sidebar` that hosted the Gallery's tuning
controls is deleted.

What remains are **deliberate distinctions** (not gaps to close) plus one live
Builder-internal bug. The throughline still holds: features hung on **shared
primitives** stay consistent for free; features hung on **mode-local wiring**
drift.

| Feature | State | Reason | Verdict |
|---|---|---|---|
| **Decoration** | authored in the Builder (`editor.decoration`); the Gallery **renders** decorated saves but can't edit them | ADR-0005: no Patch/Cell identity in a bare viewer to bind scope records to (`types/editor.ts:293`) | **Keep** |
| **Frame** | Gallery viewer renders a legacy save's clip-only `config.frame`; the Builder authors `editor.frame`; "Edit in Lab" migrates one to the other (Q8a) | two representations of one noun, bridged by conversion, not a live divergence | **Keep** — watch terminology collision |
| **Lacing / weave** | both surfaces, via the shared `StrandStyle.weave` primitive | hung on a shared primitive — the model to imitate | **Keep** (exemplar) |
| **Perf fast-path (Lever A)** | single-cell, rotation-0, no vertex-lines/frame/lattice; multi-cell Composition stays compute-bound | exactness gate — `<use>` tiling is only seamless under pure-translation symmetry (`usePattern.ts:160`) | **Keep**, generalise later |
| **Octagon / dodecagon Cells** | assignable only inside a multi-cell Configuration, never as a single-cell shape | a lone octagon/dodecagon doesn't tile the plane (`migrations.ts:44`) | **Keep** |
| **Alternate orientation** | multi-cell fixed (`c56df88`); single-cell per-config audit pending | partial fix; single-cell `alternateBoundary` unaudited | **Close** — latent bug, RAW |

## Example dialogue

> **Dev:** "When the user is in the **Design** phase of the **Builder**, editing the square **Cell** of a `4.8.8` **Patch**, the **Tiles** they place go into that Cell's interior — right?"
> **Domain expert:** "Yes. And when they **phase-switch** to **Composition**, what they see is the **Composition**: the whole Patch (octagon Cell + square Cell, both with their Tiles) tiled across the canvas per the `4.8.8` **Configuration**, with **Strands** rendered on top by chaining each polygon's **Rays** through PIC. The strand-adjustment sliders mostly operate at the Ray level even though they're labelled 'strand' — that's a UI tooltip we owe."

## Flagged ambiguities

- "tile" previously meant both interior user-placed polygons AND the cell-scale polygons of a multi-shape composition (`BoundaryTile`) — resolved: **Tile** is the interior scale; the cell-scale concept is a **Cell**.
- "composition" was previously used for the multi-cell data structure (`BoundaryComposition`) — resolved: that role belongs to **Patch**; **Composition** is reserved for the rendered tiled output.
- "configuration" and "composition" were used interchangeably in prose — resolved: **Configuration** is the named template (e.g. `"4.8.8"`), **Composition** is the rendered output, **Patch** is the data structure for one repeat.
- Single-cell vs multi-cell Patches use a uniform recursive shape: every Patch has at least one Cell. The legacy "single-shape EditorPatch with `tiles[]` directly" form is being migrated to always carry a Cell layer.
- "origin" previously meant both "the auto-placed centre tile" (`EditorTileOrigin = 'origin' | ...`) and the geometric world origin — resolved: the auto-placed Tile is a **Seed Tile** with `source: 'seed'`; **origin** means the geometric `(0,0)` point only.
