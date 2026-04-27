# Research — Tile Configurations & Higher-Order Radial Symmetry

**Started:** 2026-04-25
**Branch:** `feat/art-deco-egypt-theme-revamp`
**Purpose:** Survey tile configurations, complex radial symmetry, periodic and quasi-periodic
(Penrose) tilings, with an eye toward extending the project's PIC pipeline.

This file is built up incrementally so a future session can resume mid-research. Each
section is dated; partial notes are explicitly marked.

---

## 0. Project context (anchor)

Currently supported tilings (`src/tilings/index.ts`):

| Fold | Tilings |
|------|---------|
| 3    | triangular |
| 4    | square, 3.3.3.4.4, 3.3.4.3.4 |
| 5    | pentagonal-rosette (rosette-patch) |
| 6    | hexagonal, 3.3.3.3.6, 3.4.6.4, 3.6.3.6 |
| 7    | heptagonal-rosette (rosette-patch) |
| 8    | 4.8.8 |
| 9    | nonagonal-rosette (rosette-patch) |
| 10   | decagonal-rosette / Girih (rosette-patch) |
| 11   | hendecagonal-rosette (rosette-patch) |
| 12   | 3.12.12, 4.6.12 |

All eleven Archimedean tilings except **3.4.4.6** (rhombitrihexagonal alt? actually that's
the same as 3.4.6.4) — i.e., the project is missing none of the 11 standard Archimedean
tilings except the elongated triangular variant 3.6.3.6 has only 6-fold; **the missing
canonical Archimedean is 3.3.6.6? — verify**. (TODO confirm: the eleven Archimedean
tilings are 3³.4², 3².4.3.4, 3.6.3.6, 3.4.6.4, 3.12², 4.6.12, 4.8², 3.3.3.3.6, 3⁶, 4⁴, 6³.
Project covers all 11.)

Categories already in code: `archimedean` and `rosette-patch`. No quasi-periodic
generator yet. No k-uniform (>1 vertex type) periodic tilings beyond the Archimedean
set.

---

## 1. Pattern examples (provided)

### Example A — `Islamic-Pattern-07-min.jpg` (Moroccan zellige, photographed)

- **Central motif:** a single very large rosette with **~16 visible "arms"** (count from
  the outer ring of pointed petals). Inside it, a smaller star pattern with **8 arms**;
  at the very centre, an **8-petal flower**.
- **Outer ring (corners):** classic 8-pointed star + cross interlace, suggesting the
  surrounding tiling is **square 4.8.8 or a star-and-cross variant**.
- **Reading:** this is a **16-fold rosette dropped into an 8-fold periodic ground**
  (compatible because 16 is a multiple of 8). The rosette's petals reach into the
  surrounding lattice and lock to the 8-fold tiles.
- **Implication for project:** there is no 16-fold rosette in the codebase. Adding one
  as a "rosette-patch" should be feasible since the patch generator is symmetry-only
  bounded.

### Example B — `Traditional-Geometric-Islamic-Tile.jpg` (clean vector, repeating)

- **Periodic** (a tile clearly repeats both horizontally and vertically).
- Motifs: **8-pointed stars** (white), with a recurring blue 4-pointed cross + ochre
  pentagon-and-hexagon shapes filling the gaps.
- This is the canonical **"khatem sulemani" 8-pointed star + cross tiling**, one of the
  most common Islamic patterns. The underlying tiling is **4.8.8** (square + octagon)
  but with **lower contact angle (~45°)** so the rays inside each octagon close into a
  star-and-cross instead of a tighter rosette.
- **Implication:** 4.8.8 is in the project. The visual difference is purely contact
  angle / line-style. This pattern is already reachable; user may just want presets.

### Example C — `islamic-geometric-ornaments...82065802.webp` (interlaced strapwork)

- **Periodic, square-symmetric.**
- A central large rosette with **16 arms** sits in a square cell. Surrounding it: small
  **8-pointed stars** at corners, and rectangular interlace bands.
- Same family as Example A but rendered as a clean **interlaced strapwork** (two-pass
  ribbon style) — the project's lacing system targets this exact look.
- **Implication:** another 16-fold rosette. Reinforces the priority of adding 16-fold.

### Example D — `pngtree-intricate-islamic-geometric-design...` (radial mandala)

- **Single radial composition**, 16-pointed outer star (you can count: 8 large gold
  points alternating with 8 smaller... actually it's a 16-pointed star formed by two
  superimposed 8-pointed stars, classic).
- Inside: **two superimposed 8-pointed stars at offset angles → 16-fold visual
  symmetry** but constructed from 8-fold sub-elements.
- Many decorative inner bands, including a small 5-pointed flower at the dead centre.
- **Implication:** can be built as a layered composition of **two 8-fold rosettes
  rotated by 22.5°**, no new tiling needed — *but* the project would need
  layered/composed rendering. Or treat as a true 16-fold rosette.

### Common thread across A, C, D

All three feature a **16-fold central rosette** combined with 8-fold periphery. The
key research target is therefore **how to generate 16-fold rosettes that mesh with an
8-fold square-symmetric ground tiling**.

---

## 2. High-order radial symmetry

### 2.1 The geometric rosette (general construction)

A rosette is built on **three concentric circles** and a circle divided into **2n equal
parts** (twice the number of points). Each "petal" (arm) of the rosette is a kite
formed by:

- two radial sides anchored on the inner circle,
- one outer vertex on the outer circle (the star tip),
- a contact angle θ that determines how slim or fat the petal is.

For an n-fold rosette, the n outer tips alternate with n re-entrant valleys; lines
crossing through the rosette have **n-fold dihedral symmetry** (Dₙ if you count
reflections). The 8-fold rosette is the limiting case where the entire outline sits
inside a 16-divided circle — i.e. **a 16-divided circle is the natural scaffolding for
both 8- and 16-fold rosettes**, which is exactly why historical patterns mix them.

### 2.2 16-fold patterns in the historical record

- **Hasan Sadaqah mausoleum**, Cairo, 1321 — earliest dated simple 16-point pattern.
- **Alhambra**, Granada, 1338–1390.
- **Sultan Hassan complex**, Cairo, 1363 — elaborate combined 16-point compositions.
- **Bahia Palace**, Marrakech — 16-fold patterns analysed in CAD studies.

### 2.3 Joining rosettes of two different orders

When a pattern combines two rosettes (e.g. central 16-fold + peripheral 8-fold), the
construction is:

1. Each rosette is bounded by its **circumscribing limiting polygon** (a regular
   n-gon).
2. **Edges of those limiting polygons are made to coincide.** The two rosettes share
   an edge along the limiting polygon boundary.
3. Edge length is forced to be equal between the two limiting polygons — this fixes
   their relative scale.

This is a direct generalisation of the project's existing PIC pipeline: the limiting
polygons are precisely the polygons of the underlying tiling. **A 16-fold rosette can
be joined to an 8-fold rosette by making both share an edge on their bounding 16-gon
or 8-gon respectively** — meaning the natural underlying tiling for 16-fold is one
that contains 16-gons.

There is no Archimedean tiling using regular 16-gons, **but** a "patch" tiling with a
single central 16-gon surrounded by suitable filler tiles (rhombi, squares, irregular
hexagons) is exactly the rosette-patch pattern the project already supports for
n=5,7,9,10,11.

### 2.4 Bonner's classification (the polygonal technique)

From Bonner's *Islamic Geometric Patterns: Their Historical Development and
Traditional Methods of Construction* (Springer 2017, ~595 pp; the canonical modern
reference, with appendix by Craig Kaplan):

- **Two top-level categories**:
  - **Systematic** — built from a small finite set of premade polygonal modules with
    pattern lines already drawn on them. Tile the modules and the lines connect.
  - **Non-systematic** — bespoke underlying tessellation per pattern.
- **Five historical systematic systems**:
  1. Regular polygons (the Archimedean / Laves family — current project scope)
  2. **Fourfold System A**
  3. **Fourfold System B**
  4. **Fivefold System** (Penrose-related; ≈ Girih)
  5. **Sevenfold System**
- **Within each n-fold system Bonner identifies four "pattern families"** by where
  the contact lines fall on each module's edges:
  - **acute** (small contact angle, slim stars)
  - **median** (mid contact angle, balanced rosettes)
  - **obtuse** (wide contact angle, blunted petals)
  - **two-point** (two contact points per edge — produces star-and-cross /
    interlace patterns)

The project's `contactAngle` field already covers the first three families
continuously. The **two-point family is not yet representable** in the data model —
this is the visual character of Example B (`Traditional-Geometric-Islamic-Tile.jpg`)
and Example C, where each polygon edge carries two distinct strands rather than one.

### 2.5 Practical 16-fold construction recipe

For a single 16-fold rosette dropped on a square cell (the configuration in
Examples A, C, D):

```
Outer cell:        square
Inscribed:         regular 16-gon centred on the cell
Surrounding tiles: 8 isoceles triangles + 8 thin rhombi (between 16-gon and square),
                   OR 16 thin rhombi.
Petals:            16 kites with contact angle θ (typically 67.5° or 78.75°)
Cell symmetry:     C4 / D4 (square periodic ground), 16-fold inside the rosette only
```

Note: 16-fold is only **local** symmetry. The whole pattern has at most C4/D4
periodic symmetry because the square cell is what tiles the plane.

For pure 16-fold non-periodic radial mandalas (Example D), no surrounding tiling is
needed — just one 16-gon and its kite-petal decoration.

---

---

## 3. Penrose & aperiodic tilings

Quasiperiodic (a.k.a. aperiodic / non-periodic) tilings are tilings of the plane that
**have no translational symmetry** — they never repeat — yet have **long-range order**
and a well-defined N-fold rotational symmetry (locally and in their diffraction
pattern).

For Islamic-pattern work they are interesting because:

1. They cleanly produce **5-fold, 8-fold, 10-fold, and 12-fold** symmetry — the orders
   that don't fit any Archimedean tiling.
2. Lu & Steinhardt (2007) showed historical Islamic Girih patterns from the 13th–15th
   centuries already used the same quasiperiodic substitution principles.
3. They can be generated by **substitution / inflation** — a recursive deflation step
   that scales a tile by the inflation factor and replaces it with a pre-defined patch
   of smaller tiles. This composes well with the project's existing pure-TS,
   memo-friendly geometry pipeline.

### 3.1 Penrose tilings (5- / 10-fold)

There are three closely related Penrose tilings, all **mutually locally derivable** —
i.e., one can be transformed into another by purely local cuts/joins:

| Variant | Prototiles | Angles | Key property |
|---------|-----------|--------|--------------|
| **P1**  | pentagon, pentagram (5-pointed star), "boat", thin rhombus | based on 36° | original 1974, six prototiles |
| **P2**  | kite, dart | 72°/108° (kite); 36°/108° (dart) | two prototiles, decoration matches via curves |
| **P3**  | thick rhombus, thin rhombus | thick: 72°/108°; thin: 36°/144° | most popular; minimal two-tile set |

**Inflation factor:** φ = (1+√5)/2 ≈ 1.618 (the golden ratio). Each substitution step
multiplies linear scale by φ; tile counts scale by φ² = φ+1.

**Tile-count ratio in any Penrose tiling:** thick:thin → φ exactly in the limit.
Same for kite:dart in P2.

**Robinson-triangle decomposition.** All three variants reduce to two right
triangles ("acute" and "obtuse" Robinson triangles, sides in ratio 1:φ). Most
implementations operate on Robinson triangles internally and reassemble into rhombs or
kites/darts at output time. **This is the cleanest computational target for the
project** — store Robinson triangles internally, render as P3 rhombi by default.

**Substitution rules for P3 (Robinson-triangle form):**

```
Acute triangle (A):  splits into 1 acute + 1 obtuse  (each scaled by 1/φ)
Obtuse triangle (B): splits into 1 acute + 1 obtuse + 1 acute  (each scaled by 1/φ)
```

After deflation, every triangle has linear size 1/φ of the parent. Reassemble pairs of
adjacent acute triangles into thick rhombi, pairs of obtuse triangles into thin rhombi.

**Matching rules** ensure aperiodicity:

- Edge-arrow markings (single + double arrows) must agree across shared edges.
- Equivalently, mechanical "bumps and notches" carved into edges.
- Equivalently, decorating each rhombus with circular arcs that must continue
  smoothly across edges (this also produces the **Penrose decoration with two arc
  families that visually trace out the underlying quasiperiodic order** — useful
  decoration for the project).

**Symmetry.** Penrose tilings have only **local 5-fold symmetry**; globally they have
no rotational symmetry. However, a special initial seed (the "sun" or "star" patch)
produces a tiling with one centre of perfect 5-fold rotational symmetry extending to
infinity.

### 3.2 Ammann–Beenker tiling (8-fold)

| Prototile | Angles | Shape |
|-----------|--------|-------|
| Square | 90°/90°/90°/90° | regular square |
| Silver rhombus | 45°/135°/45°/135° | "thin" rhombus |

**Inflation factor:** δ_S = 1+√2 ≈ 2.414 (the **silver ratio**). Historical note: this
was the first known irrational inflation factor not derived from φ.

**Substitution sketch:**

- Each square inflates into a patch containing 3 squares + 4 rhombi (approximately;
  exact patch depends on whether you cut along a diagonal first).
- Each rhombus inflates into a smaller patch containing 2 squares + 3 rhombi.
- Internal computation usually splits each square into two 45–45–90 triangles to keep
  rules clean.

**Matching rules** are conveyed by **Ammann bars** — partial arrow segments at
vertices that must compose into full arrows when tiles meet.

**Special configuration for 8-fold central symmetry:** start with **eight rhombi
arranged around a vertex into a star** (each rhombus's 45° angle at the centre).
Iterating substitution from this seed yields a quasiperiodic patch with **perfect
exact 8-fold rotational symmetry around that point**.

This is the right substrate for examples A, C, D *if* a true non-periodic 8-/16-fold
ground is desired; the alternative is the periodic 4.8.8 Archimedean ground (already
in the project) which has only 8-fold local symmetry around each octagon centre.

### 3.3 Stampfli / Socolar (12-fold)

12-fold quasiperiodic tilings come from two related substitution systems:

- **Stampfli (1986)** — uses three prototiles: square, equilateral triangle, 30°
  rhombus (skinny). Built from a hexagonal/honeycomb base grid.
- **Socolar (1989)** — uses square, regular hexagon, 30° rhombus. Different prototile
  set, similar 12-fold result.

**Inflation factor:** 1+√3 ≈ 2.732 in some formulations (the "platinum ratio" or
"bronze ratio" depending on convention). For Stampfli's, the linear inflation factor is
2+√3 ≈ 3.732.

**Use case for the project:** patterns combining 12-pointed and 6-pointed stars on a
non-periodic ground — common in Iranian and Turkish patterns dated 14th c. onward. The
Archimedean 3.12.12 and 4.6.12 in the project already give *periodic* 12-fold local
symmetry; Stampfli/Socolar would extend to *quasiperiodic* 12-fold with no
fundamental period.

### 3.4 Lu & Steinhardt — Girih as quasiperiodic substitution

Lu & Steinhardt's 2007 *Science* paper traced a clear historical evolution:

1. **Pre-1200 CE.** Patterns drawn directly with compass and straight-edge from a
   bounding polygonal framework (Hankin/Bonner polygonal technique on regular tiles).
2. **~1200 CE conceptual breakthrough.** Patterns reconceived as tessellations of a
   small set of equilateral, decagonally-decorated polygons — the **Girih tile set**:
   - regular **decagon** (10-gon)
   - regular **pentagon**
   - elongated **hexagon**
   - **bowtie** (concave hexagon)
   - **rhombus** (72°/108°)

   Each Girih tile carries pre-drawn decorative lines that match across edges, so the
   master tessellator can build complex periodic patterns by tiling the modules
   (the **Fivefold System** of Bonner).

3. **By the 15th century.** Girih tessellation was combined with **self-similar
   substitution** — each Girih tile decomposed into smaller Girih tiles. The result
   is **mathematically equivalent to a Penrose tiling**, achieved 500 years before
   Penrose's 1974 work.

4. **Showcase example.** The **Darb-i Imam shrine in Isfahan (1453)** carries a
   tessellation that matches a P2 (kite/dart) Penrose tiling almost exactly. Lu &
   Steinhardt found only a small number of "phason defects" in an enormous patch.

**Implication for the project.** A Girih-tile module set with built-in decoration is
a *separate generator* from PIC; it is in fact closer to the existing
`rosette-patch` category but with substitution-based growth rather than
finite-symmetry expansion.

### 3.5 Substitution algorithm (skeleton, applies to all of the above)

```
Input: seed = list of triangles/rhombi with vertex coords
Loop k times:
  for tile T in seed:
    apply T's substitution rule -> N smaller tiles whose coords
      are a fixed affine transform of T's coords (rotation + 1/inflationFactor scale + translation)
  seed := concatenation of all child tiles
Output: deflated seed at iteration k
Render: clip to viewport, decorate
```

Implementation cost is O(N^k) tiles. With inflation factor ≈ φ a tiling covering a
viewport of diameter D needs k ≈ log_φ(D / smallestTileEdge) deflations. For
typical viewport sizes that's 8–12 iterations, well within the project's existing
performance envelope (the BFS tilings already produce thousands of polygons).

---

---

## 4. Periodic Islamic tilings beyond Archimedean

### 4.1 k-uniform tilings — formal hierarchy

A tiling by regular polygons is **k-uniform** when its vertices fall into exactly **k
orbits** under the symmetry group of the tiling. The complete classification:

| k | Count | Note |
|---|------:|------|
| 1 | 11 | the **Archimedean tilings** (also called 1-uniform / regular) |
| 2 | 20 | 2-uniform / "demiregular" |
| 3 | 61 | 39 are 3-Archimedean (3 distinct vertex figures); 22 have 2 vertex figures in different orbits |
| 4 | 151 | |
| 5 | 332 | |
| 6 | 673 | |

The **20 2-uniform tilings** are documented on the Wikipedia "List of k-uniform
tilings" page (Cundy & Rollett notation: each lists two vertex configurations
separated by a semicolon, e.g. `(3.4².6; 3.4.6.4)`). For the project these are the
next-most-natural extension after the 11 Archimedean — they would let users build
patterns historically used in 12th–13th-c. Anatolian and Persian work that don't fit
any Archimedean tiling.

**Computational note.** k-uniform tilings can in principle be generated by the same
BFS approach the project uses for Archimedean — but the seed/expansion needs to track
**which orbit a vertex belongs to**, not just the polygon's `configPos`. Each orbit
has its own vertex configuration. The `neighborSides` lookup becomes a table indexed
by `(polygon-type, orbit, edge-index)`. Adding a 2-uniform generator is therefore a
clean extension of the existing pipeline, not a rewrite.

### 4.2 The star-and-cross family (two-point patterns)

This is the family of Example B (`Traditional-Geometric-Islamic-Tile.jpg`). The
underlying tiling is **4.8.8** (square + octagon) — already supported — but each edge
of every polygon carries **two** contact points instead of one. The result:

- Every octagon contains an **8-pointed star** (khatem sulemani).
- Every square gap becomes a **4-pointed cross**.
- Lines woven through octagon → square → octagon trace a strapwork lattice.

In Bonner's classification this is the **two-point family** of the Fourfold System.
It is **not currently expressible** in the project's `figureConfig`:

```ts
type FigureConfig = {
  type: 'star' | ...
  contactAngle: number   // single angle per polygon edge
  ...
}
```

To support star-and-cross properly the data model would need either:

- A `subFamily: 'acute' | 'median' | 'obtuse' | 'two-point'` enum, or
- A `contactPoints: number[]` array per edge (length 1 = current; length 2 = star-
  and-cross), and corresponding ray emitters per contact point.

This is the single highest-impact change for visual coverage — it unlocks an entire
historical subfamily without adding any new tilings.

### 4.3 Bonner's systematic n-fold systems (recap with practical notes)

| System | Modules | Where used | Project status |
|--------|---------|-----------|----------------|
| Regular polygons | triangles, squares, hexagons, octagons, dodecagons | universal | ✅ covered (Archimedean) |
| **Fourfold System A** | square, octagon, equilateral hexagon, "L-tromino"-like fillers | Egypt, Syria, Anatolia | ⚠️ partial — 4.8.8 only |
| **Fourfold System B** | square, regular 8-gon, irregular hexagon, "thin rhombus" | Egypt 13th–14th c. | ❌ not supported |
| **Fivefold System** ≈ Girih | decagon, pentagon, elongated hexagon, bowtie, rhombus | Persia, Central Asia | ⚠️ partial — `decagonal-rosette` rosette-patch covers single-cell case only |
| **Sevenfold System** | 14-gon, heptagon, irregular pentagon, etc. | Anatolia, Maghreb | ⚠️ partial — `heptagonal-rosette` rosette-patch covers single-cell case only |

The Fivefold System is **the key entry point for both periodic Girih tessellations
and the quasiperiodic substitution variant** (§3.4) — the same tile set serves both.

### 4.4 Lee's rosette construction (extension of the basic n-fold rosette)

Anthony Lee's method (formalised by Kaplan as "Lee's construction"):

1. Start with a regular n-gon (the limiting polygon).
2. From each vertex, draw a line at the contact angle θ.
3. The lines intersect inside the n-gon and form the n-pointed star.
4. **Surround the central star with n irregular hexagons**, each sharing one edge
   with the star and one with the n-gon's edge.
5. The n hexagons together with the star fill the n-gon exactly.

Properties:

- Yields an n-fold rosette for **any** n.
- Each surrounding hexagon has 4 edges not adjacent to the central star — all four
  congruent. The two radial edges are parallel.
- For **n = 10**, the peripheral stars at the rosette's vertices become **perfect
  pentagrams** — this is why decagonal rosettes look unusually "rich" compared to
  octagonal ones.
- For **n = 16**, the peripheral fillers are slim rhombi; the construction matches
  the Bahia Palace patterns described in §2.2.
- The **contact angle θ** is the single shape parameter. By rotating point A by θ
  around the rosette centre M and intersecting with the bisector, one obtains the
  modified rosette for any θ continuously.

This is the same parameter the project's `contactAngle` already exposes; **the
project's figure model already implements Lee's rosette**, just for a smaller set of
n. Extending coverage to n = 13, 14, 15, 16, 18, 20, 24 is purely a matter of adding
rosette-patch entries.

---

---

## 5. Synthesis — concrete recommendations

Ranked by visual impact ÷ implementation cost:

### Tier 1 — High impact, low effort

1. **Add 16-fold rosette-patch** (`'hexadecagonal-rosette'`).
   - Vertex config: `[16, 4]` or `[16, 4, 4]` with 16-gon centred + 16 thin rhombi
     ring + square fillers, mirroring `'decagonal-rosette'`.
   - Default contact angle: 78.75° (matches Bahia Palace patterns).
   - Unlocks examples A, C, D directly.

2. **Add `'two-point'` figure subFamily.**
   - Adds one enum value to `FigureConfig.subFamily` and one extra ray emitter per
     edge in `pic/stellation.ts`.
   - With existing 4.8.8 tiling this immediately produces star-and-cross patterns
     (Example B).

3. **Add presets for Bonner's four pattern families** per tiling.
   - Acute / median / obtuse / two-point — each just a different `contactAngle` (and
     `subFamily` for two-point).
   - One UI dropdown gives users the historical pattern families without exposing
     the raw angle slider.

### Tier 2 — Medium effort, big design-space expansion

4. **2-uniform tiling generator.**
   - Reuse the BFS in `tilings/archimedean.ts`. Generalise `neighborSides.ts` to
     index by `(polygon-type, orbit-id)`. Seed the BFS from one representative of
     each orbit.
   - Adds 20 new tilings (the full 2-uniform family); historically attested designs
     like Kepler's `Kk` (3.4².6 + 3.4.6.4) become reachable.

5. **Girih-tile generator (Fivefold System, periodic mode).**
   - Five tiles (decagon, pentagon, hexagon, bowtie, rhombus) with pre-decorated
     contact lines. Tile by edge-matching adjacency (similar to BFS but constrained
     by which Girih edges can meet).
   - Reproduces 13th–15th-c. Persian patterns. New `category: 'girih'`.

### Tier 3 — Higher effort, opens the quasi-periodic frontier

6. **Penrose P3 substitution generator.**
   - New `category: 'quasiperiodic'`. Internal storage in Robinson triangles, output
     as P3 thick/thin rhombi.
   - Substitution-and-clip render: deflate seed k times until tiles are smaller than
     the viewport, then clip.
   - Existing PIC pipeline works unchanged on the rhombi (each rhombus is a
     2-fold-symmetric polygon → standard contact-ray emission).
   - Decorate with Penrose's circular-arc decoration as an alternate render layer.

7. **Ammann–Beenker substitution generator.**
   - Same architecture as Penrose. Square + 45° rhombus prototiles, inflation factor
     1+√2.
   - Produces non-periodic 8-fold patterns — a true quasiperiodic counterpart to
     4.8.8.

8. **Stampfli/Socolar substitution generator (12-fold quasiperiodic).**
   - Lower priority since 3.12.12 and 4.6.12 already cover 12-fold periodic cases,
     but completes the quasi-periodic suite (5-, 8-, 12-fold).

### Tier 4 — Long-term / research

9. **Substitution-Girih unification.** Implement Lu & Steinhardt's 15th-century
   Darb-i Imam construction: Girih tiles substituted recursively to produce a
   Penrose-equivalent quasiperiodic pattern. This requires both a Girih engine and a
   substitution engine; combine the two.

10. **Bonner's four-family preset library.** A curated catalogue of (tiling, family,
    angle) triples corresponding to historically documented patterns (Alhambra,
    Topkapi scroll, Sultan Hassan complex, etc.) — pure data, no engine work.

### Architectural notes for the project

- The current pipeline (Tiling → Figure → Render) cleanly accommodates everything
  above except Tier 3, which needs a new tile-source category (substitution rather
  than BFS). The Figure and Render layers are unchanged.
- `TilingDefinition` may need a discriminated union: `{ category: 'archimedean' |
  'rosette-patch' | 'k-uniform' | 'girih' | 'quasiperiodic'; ... }` with each variant
  carrying its own metadata (substitution rules for the last one).
- Quasi-periodic generators have no fixed periodic cell, so the existing `viewport`
  argument for tile generation is sufficient — they already grow on demand.

---

## Sources

- [Penrose tiling — Wikipedia](https://en.wikipedia.org/wiki/Penrose_tiling)
- [Ammann–Beenker tiling — Wikipedia](https://en.wikipedia.org/wiki/Ammann%E2%80%93Beenker_tiling)
- [Socolar tiling — Wikipedia](https://en.wikipedia.org/wiki/Socolar_tiling)
- [List of k-uniform tilings — Wikipedia](https://en.wikipedia.org/wiki/List_of_k-uniform_tilings)
- [Islamic geometric patterns — Wikipedia](https://en.wikipedia.org/wiki/Islamic_geometric_patterns)
- [Tilings Encyclopedia — Penrose Rhomb (Bielefeld)](https://tilings.math.uni-bielefeld.de/substitution/penrose-rhomb/)
- [Tilings Encyclopedia — Ammann-Beenker (Bielefeld)](https://tilings.math.uni-bielefeld.de/substitution/ammann-beenker/)
- [Tilings Encyclopedia — Socolar (Bielefeld)](https://tilings.math.uni-bielefeld.de/substitution/socolar/)
- [Lu & Steinhardt 2007 — *Decagonal and Quasi-Crystalline Tilings in Medieval Islamic Architecture*, Science (PDF)](https://paulsteinhardt.org/wp-content/uploads/2023/01/LuSteinhardt2007.pdf)
- [Kaplan 2005 — *Islamic Star Patterns from Polygons in Contact* (PDF)](https://cs.uwaterloo.ca/~csk/publications/Papers/kaplan_2005.pdf)
- [Kaplan 2004 — *Islamic Star Patterns in Absolute Geometry* (PDF)](https://grail.cs.washington.edu/wp-content/uploads/2015/08/kaplan-2004-isp.pdf)
- [The Geometric Rosette: analysis of an Islamic decorative motif (MIT tilingsearch, PDF)](https://tilingsearch.mit.edu/RosetteAnalysis.pdf)
- [Bonner — *Islamic Geometric Patterns: Their Historical Development and Traditional Methods of Construction*, Springer 2017](https://link.springer.com/book/10.1007/978-1-4419-0217-7)
- [Bonner & Pelletier — *A 7-Fold System for Creating Islamic Geometric Patterns*, Bridges 2012 (PDF)](https://archive.bridgesmathart.org/2012/bridges2012-141.pdf)
- [Drawing Islamic Geometric Designs — basic rosettes (Anthony Lee's methods)](https://www.drawingislamicgeometricdesigns.com/basic-rosettes-anthony-lees-methods/Blog%20Post%20Title%20One-n5m4l)
- [Geometricolor — *Generating Quasiperiodic Tilings VI: Ammann-Beenker*](https://geometricolor.wordpress.com/2022/05/01/generating-quasiperiodic-tilings-and-fractals-vi-the-ammann-beenker-tiling/)
- [Properties of the Ammann–Beenker tiling and its square approximants (arXiv 2308.07701)](https://arxiv.org/html/2308.07701v2)
- [A Quasiperiodic Tiling With 12-Fold Rotational Symmetry and Inflation Factor 1+√3 (arXiv 2102.06046)](https://arxiv.org/pdf/2102.06046)
- [Two algorithms for randomly generating aperiodic tilings — Tatham](https://www.chiark.greenend.org.uk/~sgtatham/quasiblog/aperiodic-tilings/)
- [Penrose substitution — Imperfect Congruence](https://gruze.org/tilings/penrose_sub)
- [Edmund Harriss — *Images of the Ammann-Beenker Tiling*, Bridges 2007 (PDF)](https://archive.bridgesmathart.org/2007/bridges2007-377.pdf)
- [Sami Ramian — Twelvefold Islamic Geometric Rosette tutorial](https://www.samiramian.uk/twelvefoldrosette)
- [Sarah Brewer — 10-fold Islamic Rosette tutorial (PDF)](http://mathemartiste.com/geometricdesign/10foldRosetteTutorial_SarahBrewer.pdf)
- [16-Fold Rosette construction tutorial — YouTube](https://www.youtube.com/watch?v=88q-u2eWZqg)

---

## Working log

- **2026-04-25** — file created. Project context section + pattern-example analysis
  done from local image inspection.
- **2026-04-25** — sections 2 (high-order radial), 3 (Penrose / Ammann–Beenker /
  Stampfli–Socolar / Lu–Steinhardt), 4 (k-uniform, star-and-cross, Bonner systems,
  Lee's construction), and 5 (synthesis + recommendations) completed.
- **2026-04-25** — Sources section added. Research file is at v1; ready for use as
  basis of design discussions in future sessions.
- **2026-04-27** — Step 3 of the Tessellation Revamp plan implemented:
  `hexadecagonal-rosette` added to `src/tilings/index.ts` and to
  `SYMMETRY_GROUPS` as fold-16. Vertex config `[16, 4]` (16-gon adjacent to
  4-gon at each vertex of the centre 16-gon, mirroring how the existing
  rosette-patches surround their seed with filler tiles). Tile types declared
  for UI: 16-gon centre + 4-gon (rhombus / square filler). Default contact
  angle 78.75° on the 16-gon (matches Bahia Palace patterns per §2.5);
  67.5° on 4-gons. Note: the BFS in `archimedean.ts` keys polygons by
  `String(sides)`, so the 4.1/4.2 split in §2.5 (thin rhombus ring vs.
  square fillers) is **not yet visually distinguished** by the engine —
  both render under tile-type id `"4"`. A proper split would need
  custom `tileTypeId` assignment in BFS; deferred until a strand visual
  needs it (Phase B of the plan).

### Open follow-ups (not yet researched in depth)

- Exact substitution diagrams for Ammann–Beenker (Wikipedia describes them
  abstractly; image extraction or paper inspection needed for implementation).
- Detailed Girih-tile decoration line diagrams (each of the 5 tiles has a specific
  pre-drawn line set; need to digitise from Lu & Steinhardt fig. 2 or Bonner ch. 5).
- Whether the 11 Archimedean tilings are *fully* covered by the project's current
  set — verified yes (all 11 are present); confirmed.
- The "freeform" Islamic pattern method (Kaplan et al. 2023, arXiv 2301.01471) which
  generalises rosette placement beyond fixed tilings — separate research thread.
- Hyperbolic Islamic patterns (Bonner & Kaplan briefly cover; out of scope for now).
