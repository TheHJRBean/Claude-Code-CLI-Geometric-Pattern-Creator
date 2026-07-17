# Research — Tilings, Patterns, and Related Topics

**Started:** 2026-04-25
**Last consolidated:** 2026-05-19
**Branch (current):** `feat/art-deco-egypt-theme-revamp`

> **This is the canonical home for all project research notes going
> forward.** Every research discovery — tilings, symmetries, construction
> methods, historical references, algorithm behaviour, decorative
> traditions, edge cases, failure modes, anything that would be useful to
> a future session — gets appended here. Do not start parallel research
> docs. If a topic is large enough to need its own section, add one
> (numbered, dated); otherwise append to the Working log at the bottom.
> Plans, progress, and bug-investigation files (`TESSELLATION_REVAMP_PLAN.md`,
> `SESSION_STATE.md`, `INVESTIGATION-*.md`, `BUG_DOC_*.md`) remain
> separate — those are state, not research.

**Current scope of the doc:** Configurations (vertex configurations in
literature), complex radial symmetry, periodic and quasi-periodic Tilings,
aperiodic monotiles, and decorative traditions outside Islamic geometry,
with an eye toward extending the project's PIC pipeline and Gallery mode.
The scope is expected to grow.

> **Vocabulary note (2026-05-16):** see `CONTEXT.md` for the canonical
> glossary. "Tile configuration" in older prose refers to what is now
> called **Configuration** (the named tessellation family identified by
> its vertex notation, e.g. `"4.8.8"`).

This file is built up incrementally so a future session can resume
mid-research. Each section is dated; partial notes are explicitly marked.

---

## 0. Project context (anchor)

Currently supported tilings (`src/tilings/index.ts`, verified 2026-05-19):

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
| 16   | hexadecagonal-rosette (rosette-patch) — added 2026-04-27 |

All eleven Archimedean tilings (3⁶, 3².4.3.4, 3.6.3.6, 3.4.6.4, 3.12.12,
4.6.12, 4.8.8, 3.3.3.3.6, 3⁶, 4⁴, 6³) are present.

Categories already in code: `archimedean` and `rosette-patch`. No
quasi-periodic generator yet. No k-uniform (k > 1) periodic tilings beyond
the Archimedean set. No substitution-tiling engine.

---

## 1. Pattern examples (from local images, 2026-04-25)

### Example A — `Islamic-Pattern-07-min.jpg` (Moroccan zellige, photographed)

- **Central motif:** a single very large rosette with **~16 visible "arms"**.
  Inside it, a smaller 8-arm star pattern; at the very centre an 8-petal
  flower.
- **Outer ring (corners):** classic 8-pointed star + cross interlace,
  suggesting the surrounding tiling is **square 4.8.8 or a star-and-cross
  variant**.
- **Reading:** a **16-fold rosette dropped into an 8-fold periodic ground**
  (compatible because 16 is a multiple of 8).
- **Implication for project:** no 16-fold rosette existed at time of
  writing; later added 2026-04-27.

### Example B — `Traditional-Geometric-Islamic-Tile.jpg` (clean vector, repeating)

- **Periodic**, with **8-pointed stars** (white), a recurring blue 4-pointed
  cross, and ochre pentagon/hexagon fillers.
- This is the canonical **"khatem sulemani" 8-pointed star + cross tiling**.
  Underlying tiling is **4.8.8** with lower contact angle (~45°) and
  two-point family.
- **Implication:** 4.8.8 covers it geometrically; what's missing is the
  Bonner *two-point* sub-family in the figure model.

### Example C — `islamic-geometric-ornaments...82065802.webp` (interlaced strapwork)

- **Periodic, square-symmetric.** Central 16-arm rosette in a square cell;
  small 8-pointed stars at corners; rectangular interlace bands.
- Same family as A but as **interlaced strapwork**.

### Example D — `pngtree-intricate-islamic-geometric-design...` (radial mandala)

- **Single radial composition**, 16-pointed outer star (two superimposed
  8-pointed stars at 22.5° offset).
- Many decorative inner bands, including a small 5-pointed flower at centre.
- **Implication:** buildable as layered composition or as a true 16-fold
  rosette.

### Common thread across A, C, D

All three feature a **16-fold central rosette** combined with 8-fold
periphery. The key target was therefore **16-fold rosettes meshing with an
8-fold square-symmetric ground tiling** — delivered as
`hexadecagonal-rosette`.

---

## 2. High-order radial symmetry

### 2.1 The geometric rosette (general construction)

A rosette is built on **three concentric circles** and a circle divided into
**2n equal parts**. Each "petal" is a kite formed by:

- two radial sides anchored on the inner circle,
- one outer vertex on the outer circle (the star tip),
- a contact angle θ that determines how slim or fat the petal is.

For an n-fold rosette, the n outer tips alternate with n re-entrant valleys;
lines through the rosette have **Dₙ dihedral symmetry**. The 8-fold rosette
sits inside a 16-divided circle — i.e. **a 16-divided circle is the natural
scaffolding for both 8- and 16-fold rosettes**, which is exactly why
historical patterns mix them.

### 2.2 16-fold patterns in the historical record

- **Hasan Sadaqah mausoleum**, Cairo, 1321 — earliest dated simple 16-point
  pattern.
- **Alhambra**, Granada, 1338–1390.
- **Sultan Hassan complex**, Cairo, 1363 — elaborate combined 16-point
  compositions.
- **Bahia Palace**, Marrakech — 16-fold patterns analysed in CAD studies.

### 2.3 Joining rosettes of two different orders

When combining two rosettes (e.g. central 16-fold + peripheral 8-fold):

1. Each rosette is bounded by its **circumscribing limiting polygon**.
2. **Edges of those limiting polygons are made to coincide.**
3. Edge length is forced to be equal between the two limiting polygons —
   this fixes their relative scale.

This is a direct generalisation of the project's PIC pipeline: the limiting
polygons are the polygons of the underlying tiling. There is no Archimedean
tiling using regular 16-gons, **but** a single-16-gon rosette-patch with
filler tiles (rhombi, squares) is exactly the pattern the project supports
for n = 5, 7, 9, 10, 11, 16.

### 2.4 Practical 16-fold construction recipe

```
Outer cell:        square
Inscribed:         regular 16-gon centred on the cell
Surrounding tiles: 8 isoceles triangles + 8 thin rhombi (between 16-gon and square),
                   OR 16 thin rhombi.
Petals:            16 kites with contact angle θ (typically 67.5° or 78.75°)
Cell symmetry:     C4 / D4 (square periodic ground), 16-fold inside the rosette only
```

16-fold is only **local** symmetry. The whole pattern has at most C4/D4
periodic symmetry because the square cell is what tiles the plane. For pure
16-fold non-periodic radial mandalas (Example D), no surrounding tiling is
needed.

---

## 3. Periodic Islamic patterns beyond Archimedean

### 3.1 k-uniform tilings — formal hierarchy

A tiling by regular polygons is **k-uniform** when its vertices fall into
exactly **k orbits** under the symmetry group of the tiling.

| k | Count | Note |
|---|------:|------|
| 1 | 11 | the **Archimedean tilings** (project covers all 11) |
| 2 | 20 | 2-uniform / "demiregular" |
| 3 | 61 | 39 are 3-Archimedean; 22 have 2 vertex figures in different orbits |
| 4 | 151 | |
| 5 | 332 | |
| 6 | 673 | |

**Computational note.** k-uniform tilings can be generated by the same BFS
approach the project uses for Archimedean — but the seed/expansion needs to
track **which orbit a vertex belongs to**. The `neighborSides` lookup
becomes a table indexed by `(polygon-type, orbit, edge-index)`. A
2-uniform generator is a clean extension of the existing pipeline, not a
rewrite. See §6.1 for the complete 2-uniform list.

### 3.2 Bonner's classification (the polygonal technique)

From Bonner's *Islamic Geometric Patterns: Their Historical Development and
Traditional Methods of Construction* (Springer 2017):

- **Two top-level categories:**
  - **Systematic** — built from a small finite set of premade polygonal
    modules with pattern lines already drawn on them.
  - **Non-systematic** — bespoke underlying tessellation per pattern.
- **Five historical systematic systems:**
  1. Regular polygons (Archimedean / Laves — current project scope)
  2. **Fourfold System A**
  3. **Fourfold System B**
  4. **Fivefold System** (Penrose-related; ≈ Girih)
  5. **Sevenfold System**
- **Within each n-fold system Bonner identifies four "pattern families"** by
  where the contact lines fall on each module's edges:
  - **acute** (small contact angle, slim stars)
  - **median** (mid contact angle, balanced rosettes)
  - **obtuse** (wide contact angle, blunted petals)
  - **two-point** (two contact points per edge — star-and-cross / interlace)

The project's `contactAngle` field already covers acute/median/obtuse
continuously. The **two-point family is not yet representable** in the data
model — this is the visual character of Examples B and C.

### 3.3 The star-and-cross family (two-point patterns)

Underlying tiling is **4.8.8** (already supported), but each edge carries
**two** contact points instead of one. Result:

- Every octagon contains an **8-pointed star** (khatem sulemani).
- Every square gap becomes a **4-pointed cross**.
- Lines woven through octagon → square → octagon trace a strapwork lattice.

**Data-model change required:**

```ts
type FigureConfig = {
  type: 'star' | ...
  subFamily?: 'acute' | 'median' | 'obtuse' | 'two-point'
  // OR: contactPoints?: number[]  // length 1 = current; length 2 = star-and-cross
  ...
}
```

The single highest-impact change for visual coverage — unlocks an entire
historical subfamily without adding any new tilings.

### 3.4 Bonner's systematic n-fold systems (recap)

| System | Modules | Where used | Project status |
|--------|---------|-----------|----------------|
| Regular polygons | triangles, squares, hexagons, octagons, dodecagons | universal | ✅ covered (Archimedean) |
| **Fourfold System A** | square, octagon, equilateral hexagon, "L-tromino"-like fillers | Egypt, Syria, Anatolia | ⚠️ partial — 4.8.8 only |
| **Fourfold System B** | square, regular 8-gon, irregular hexagon, "thin rhombus" | Egypt 13th–14th c. | ❌ not supported |
| **Fivefold System** ≈ Girih | decagon, pentagon, elongated hexagon, bowtie, rhombus | Persia, Central Asia | ⚠️ partial — `decagonal-rosette` rosette-patch covers single-cell case only |
| **Sevenfold System** | 14-gon, heptagon, irregular pentagon, etc. | Anatolia, Maghreb | ⚠️ partial — `heptagonal-rosette` rosette-patch covers single-cell case only |

The Fivefold System is **the key entry point for both periodic Girih
tessellations and the quasiperiodic substitution variant** — the same tile
set serves both.

### 3.5 Lee's rosette construction

Anthony Lee's method (formalised by Kaplan as "Lee's construction"):

1. Start with a regular n-gon (the limiting polygon).
2. From each vertex, draw a line at the contact angle θ.
3. The lines intersect inside the n-gon and form the n-pointed star.
4. **Surround the central star with n irregular hexagons**, each sharing one
   edge with the star and one with the n-gon's edge.

Properties:

- Yields an n-fold rosette for **any** n.
- For **n = 10**, peripheral stars become **perfect pentagrams** (why
  decagonal rosettes look unusually rich).
- For **n = 16**, peripheral fillers are slim rhombi; matches Bahia Palace.
- Contact angle θ is the single shape parameter — already exposed as
  `contactAngle`. **The project's figure model already implements Lee's
  rosette**, just for a limited set of n. Extending coverage to n = 13, 14,
  15, 18, 20, 24 is a matter of adding rosette-patch entries.

---

## 4. Penrose & aperiodic substitution tilings

Quasiperiodic tilings have **no translational symmetry** yet have
**long-range order** and well-defined N-fold rotational symmetry.

Relevance to the project:

1. Cleanly produce **5-fold, 8-fold, 10-fold, 12-fold** symmetry — orders
   that don't fit any Archimedean tiling.
2. Lu & Steinhardt (2007) showed historical Islamic Girih patterns from
   the 13th–15th centuries already used the same quasiperiodic
   substitution principles.
3. Generated by **substitution / inflation** — recursive deflation that
   scales a tile and replaces it with a pre-defined patch of smaller
   tiles. Composes well with the project's pure-TS, memo-friendly geometry
   pipeline.

### 4.1 Penrose tilings (5- / 10-fold)

Three closely related Penrose tilings, **mutually locally derivable**:

| Variant | Prototiles | Angles | Key property |
|---------|-----------|--------|--------------|
| **P1**  | pentagon, pentagram, "boat", thin rhombus | based on 36° | original 1974, six prototiles |
| **P2**  | kite, dart | 72°/108° (kite); 36°/108° (dart) | two prototiles, decoration matches via curves |
| **P3**  | thick rhombus, thin rhombus | thick: 72°/108°; thin: 36°/144° | most popular; minimal two-tile set |

- **Inflation factor:** φ = (1+√5)/2 ≈ 1.618. Each substitution step
  multiplies linear scale by φ; tile counts scale by φ² = φ+1.
- **Tile-count ratio:** thick:thin → φ exactly in the limit.
- **Robinson-triangle decomposition.** All three variants reduce to two
  right triangles (acute and obtuse Robinson triangles, sides 1:φ). **Best
  computational target**: store Robinson triangles internally, render as
  P3 rhombi by default.

**Substitution rules for P3 (Robinson-triangle form):**

```
Acute triangle (A):  splits into 1 acute + 1 obtuse  (each scaled by 1/φ)
Obtuse triangle (B): splits into 1 acute + 1 obtuse + 1 acute  (each scaled by 1/φ)
```

**Matching rules** — edge-arrow markings; or mechanical bumps/notches; or
circular-arc decoration that continues smoothly across edges (yields the
**two-arc-family** quasiperiodic visualisation — useful decoration).

**Symmetry.** Only **local 5-fold symmetry**; globally no rotational
symmetry, except from the "sun" or "star" seed which gives one centre of
perfect 5-fold rotation extending to infinity.

### 4.2 Ammann–Beenker tiling (8-fold)

| Prototile | Angles | Shape |
|-----------|--------|-------|
| Square | 90°/90°/90°/90° | regular square |
| Silver rhombus | 45°/135°/45°/135° | thin rhombus |

- **Inflation factor:** δ_S = 1+√2 ≈ 2.414 (the **silver ratio**).
- **Substitution:** square → 3 squares + 4 rhombi; rhombus → 2 squares + 3
  rhombi (cleanly described in 45–45–90 triangles).
- **Matching rules** via **Ammann bars** — arrow segments at vertices that
  must compose to full arrows when tiles meet.
- **Special seed:** **eight rhombi around a vertex into a star** (each
  rhombus's 45° angle at centre). Iteration yields a patch with **perfect
  8-fold rotational symmetry around that point**.

The right substrate for Examples A, C, D *if* a true non-periodic 8-/16-fold
ground is desired; alternative is the periodic 4.8.8 ground (already in
project) which has only local 8-fold symmetry around each octagon centre.

### 4.3 Stampfli / Socolar (12-fold)

| System | Prototiles | Inflation |
|--------|------------|-----------|
| **Stampfli (1986)** | square, equilateral triangle, 30° rhombus | 2+√3 ≈ 3.732 |
| **Socolar (1989)** | square, regular hexagon, 30° rhombus | 1+√3 ≈ 2.732 |

Common in Iranian/Turkish patterns from the 14th c. Archimedean 3.12.12 and
4.6.12 already give *periodic* 12-fold; Stampfli/Socolar extend to
*quasiperiodic* 12-fold with no fundamental period.

### 4.4 Lu & Steinhardt — Girih as quasiperiodic substitution

Lu & Steinhardt's 2007 *Science* paper traced a clear historical evolution:

1. **Pre-1200 CE.** Patterns drawn with compass + straight-edge from a
   bounding polygonal framework.
2. **~1200 CE conceptual breakthrough.** Patterns reconceived as
   tessellations of a small set of **Girih tiles**:
   - regular decagon (10-gon)
   - regular pentagon
   - elongated hexagon
   - bowtie (concave hexagon)
   - rhombus (72°/108°)

   Each Girih tile carries pre-drawn decorative lines that match across
   edges (Bonner's **Fivefold System**).

3. **By the 15th century.** Girih tessellation combined with **self-similar
   substitution** — each Girih tile decomposed into smaller Girih tiles.
   The result is **mathematically equivalent to a Penrose tiling**,
   achieved 500 years before Penrose's 1974 work.

4. **Showcase example.** The **Darb-i Imam shrine in Isfahan (1453)** —
   matches a P2 (kite/dart) Penrose tiling almost exactly. Lu & Steinhardt
   found only a small number of "phason defects" in an enormous patch.

A Girih-tile module set with built-in decoration is a *separate generator*
from PIC; closer to the existing `rosette-patch` category but with
substitution-based growth rather than finite-symmetry expansion.

### 4.5 Substitution algorithm (skeleton, applies to all of the above)

```
Input: seed = list of triangles/rhombi with vertex coords
Loop k times:
  for tile T in seed:
    apply T's substitution rule -> N smaller tiles whose coords
      are a fixed affine transform of T's coords
      (rotation + 1/inflationFactor scale + translation)
  seed := concatenation of all child tiles
Output: deflated seed at iteration k
Render: clip to viewport, decorate
```

Implementation cost is O(N^k) tiles. With inflation factor ≈ φ a tiling
covering viewport diameter D needs k ≈ log_φ(D / smallestTileEdge)
deflations — 8–12 iterations typically, well within performance envelope.

---

## 5. Aperiodic monotiles — Hat and Spectre (2023)

The largest recent development in tiling theory. Smith, Myers, Kaplan and
Goodman-Strauss settled the **einstein problem** (a single tile that tiles
the plane only aperiodically) in March 2023 with the **Hat**, then in May
2023 introduced the **Spectre** which removes the Hat's reflection
requirement.

| Tile | Shape | Reflection use | Notes |
|------|-------|----------------|-------|
| **Hat** | 13-sided polykite — 8 kites from a regular hexagon (each kite is a 60°–90°–120°–90° "deltoidal trihexagonal" kite) | every tiling mixes the Hat with its mirror | first ever true aperiodic monotile |
| **Turtle** | sibling member of the same continuous family | mixes with mirror | published alongside the Hat |
| **Spectre** | edge-modified equilateral cousin of the Hat — curved/zigzagged edges that forbid reflected meeting | **chiral** — never needs a reflection | the "true" einstein in the strict sense |

**Substitution structure.** The Hat is grown by **metatiles** — four
labelled clusters (H, T, P, F) of Hats with an inflation rule. Each
metatile at level *k* expands into a fixed patch of level-(*k*−1) metatiles;
eventually each level-0 metatile is a small group of Hats with explicit
coordinates. Linear inflation factor ≈ φ⁴ ≈ 6.854 per double-step.

**Implementation cost.** Two pieces, both genuinely new:

1. A new `category: 'aperiodic-monotile'` source. Internal storage is
   metatile labels + transforms; render path flattens metatiles down to Hat
   polygons.
2. PIC over the Hat is well-defined (it's a polygon with 13 edges —
   `stellation.ts` already handles n-gons), but the **figure per Hat type**
   decision is open. Bonner-style symmetric figures don't apply since the
   Hat has no rotational symmetry, so a "Hat figure" would be a custom
   hand-authored ray pattern.

**Visual character.** Quasi-organic, never-repeats. Tile clusters look like
crab/turtle/chair shapes. Not Islamic-style but a strong fit for the Lab
and a unique gallery entry on its own merits.

---

## 6. Mathematical families beyond the Archimedean set

### 6.1 The 20 two-uniform tilings (complete vertex-config table)

Each tiling has exactly **two vertex orbits** under its symmetry group;
semicolon separates the two configurations in Cundy–Rollett notation.

| #  | Vertex configs (orbit A ; orbit B)  | Symmetry | Notable polygons |
|----|-------------------------------------|----------|------------------|
| 1  | 3⁶ ; 3².4.3.4                       | p4g/cmm  | triangles + squares |
| 2  | 3⁶ ; 3³.4²                          | cmm      | triangles + squares (elongated) |
| 3  | 3⁶ ; 3³.4² (variant 2)              | cmm      | as above, alt orbit assignment |
| 4  | 3⁶ ; 3⁴.6 (variant 1)               | p6m      | snub-hexagonal with hex inclusions |
| 5  | 3⁶ ; 3⁴.6 (variant 2)               | p6       | as above, chiral variant |
| 6  | 3⁶ ; 3².6²                          | p6m      | triangles + hexagons |
| 7  | 3⁶ ; 3².4.12                        | p4m      | tri/square/dodecagon mix |
| 8  | 3².4.3.4 ; 3.4.6.4                  | p6m      | snub-square + rhombi-tri-hex |
| 9  | 3².4.3.4 ; 3³.4² (v1)               | cmm      | two square-rich orbits |
| 10 | 3².4.3.4 ; 3³.4² (v2)               | cmm      | as above, alt orbits |
| 11 | 3².6² ; 3⁴.6                        | p6m      | snub-hex with hex-rich orbit |
| 12 | 3².6² ; 3.6.3.6                     | p6m      | trihexagonal + tri/hex |
| 13 | 3.4².6 ; 3.6.3.6 (v1)               | p6m      | trihexagonal with rhombi-tri-hex |
| 14 | 3.4².6 ; 3.6.3.6 (v2)               | cmm      | as above, alt orbits |
| 15 | 3.4.6.4 ; 3.4².6                    | p6m      | rhombi-tri-hex with squares |
| 16 | 3.4.6.4 ; 3³.4²                     | p6m      | as above, alt orbit |
| 17 | 3.4.6.4 ; 4.6.12                    | p6m      | rhombi-tri-hex + trunc-tri-hex |
| 18 | 3.12.12 ; 3.4.3.12                  | p4m      | trunc-hex with dodecagons |
| 19 | 4⁴ ; 3³.4² (v1)                     | pmm      | squares + elongated triangulars |
| 20 | 4⁴ ; 3³.4² (v2)                     | pgg      | as above, glide-reflection symmetry |

**Notable historical entries:**

- **#15 (3.4.6.4 ; 3.4².6)** — Kepler's *Harmonices Mundi* "Kk" tiling.
  Historically attested in Anatolian work.
- **#6 (3⁶ ; 3².6²)** — visually similar to existing 3.6.3.6 with an extra
  triangle orbit; common substrate for medieval European tile.
- **#17 (3.4.6.4 ; 4.6.12)** — combines two existing Archimedean vertices
  into one tiling; gives 12-gon + 6-gon + square + triangle patches that
  Bonner records under Fourfold System A.
- **#4 / #5 (3⁶ ; 3⁴.6)** — chiral pair; perfect for a "left-/right-hand"
  toggle in the Gallery.

### 6.2 Laves tilings — the 11 duals of the Archimedean set

For every Archimedean tiling there is a **dual Laves tiling** (a.k.a.
Catalan tiling). Tiles of a Laves tiling are called **planigons** — 3
regular and 8 irregular.

| Archimedean dual  | Laves name              | Planigon |
|-------------------|-------------------------|----------|
| 3⁶                | Triangular (self-dual)  | equilateral △ |
| 4⁴                | Square (self-dual)      | square |
| 6³                | Hexagonal (self-dual)   | regular hexagon |
| 3².4.3.4          | **Cairo pentagonal**    | 4-equal-sides convex pentagon |
| 3³.4²             | Prismatic pentagonal    | mirror-symmetric pentagon |
| 3⁴.6              | Floret pentagonal       | irregular pentagon, 6-fold rosette |
| 3.4.6.4           | Deltoidal trihexagonal  | kite (the *Hat's* base kite!) |
| 3.6.3.6           | Rhombille               | 60°/120° rhombus |
| 3.12.12           | Triakis triangular      | isoceles △ |
| 4.6.12            | Kisrhombille            | 30-60-90 right △ |
| 4.8.8             | Tetrakis square         | 45-45-90 right △ |

**Visual standouts:**

- **Rhombille** (60°/120° rhombi) — the classic 3D-cube-illusion tiling;
  Escher / Pompeii mosaics.
- **Cairo pentagonal** — iconic Cairo streetscape; see §6.3.
- **Floret pentagonal** — 6 pentagons share a vertex, forming a "flower";
  used in Art Deco floor patterning.
- **Tetrakis square** — square cut into 4 right triangles; "windmill"
  pattern; strong Art Deco / Egyptian-revival fit.
- **Kisrhombille** — 30-60-90 right triangles; common in Roman mosaic.

Each Laves tiling has a single planigon type and the BFS pipeline accepts
irregular convex polygons already (rosette-patch uses them). Adding all 11
is a few hours of data entry once the per-planigon polygon geometries are
tabulated.

### 6.3 Pentagonal tilings — Cairo, prismatic, floret, and the 15 families

There are **exactly 15 convex pentagons** that tile the plane monohedrally
(Reinhardt 1918 → Stein 1985 → Mann/McLoud/Von Derau 2015; Michaël Rao's
2017 proof of completeness, independently verified). Three of the 15 are
also Laves tilings (§6.2); the others are not edge-to-edge and have richer
wallpaper-group symmetries.

**Cairo pentagonal — concrete spec (the Catalan / dual-snub-square form):**

```
Pentagon vertices (one example): (±2, 0), (±3, 3), (0, 4)
Angles:                          120°, 120°, 90°, 120°, 90°
Edge lengths:                    1 : 1 : 1 : 1 : (√3 − 1)
Symmetry:                        p4g; four pentagons share a vertex
Translation lattice:             generated by overlaying two hex tilings
                                 rotated 90° relative to each other
```

**Prismatic pentagonal** — dual of 3³.4² (elongated triangular). Pentagons
with mirror symmetry; tiles in rows of alternating orientation. Same family
as Cairo, different vertex-orbit assignment.

**Floret pentagonal** — dual of snub hexagonal 3⁴.6. Each pentagon has 4
angles of 120° and one of 60°; six pentagons meet to form a "flower".
**Coordinate construction:** take a hexagonal lattice, label hexagons by
`(x + 4y) mod 7`, drop the 0-cells; surviving hexagons split into 6
pentagons each.

**Types 1–15 (Reinhardt classification).** Types 1, 2, 4, 5 are non-Laves
but periodic; types 6, 7, 8 (Kershner 1968) are isohedrally-uniform with
cmm/p2 symmetry; types 9 (James 1975), 10–13 (Marjorie Rice 1976–77), 14
(Stein 1985), 15 (Mann et al. 2015) round out the set. Visually
distinctive:

- **Type 4** — non-edge-to-edge, contains a 60° and a 120° angle.
- **Type 13 (Rice)** — has 5-fold local symmetry around special vertices
  despite global p2; one of the most aesthetic.
- **Type 15** — the 2015 discovery; angles 60°, 135°, 105°, 90°, 150° with
  three distinct edge lengths.

### 6.4 Pythagorean / hopscotch tiling (two squares)

A tiling by squares of **two different sizes**, each touching four
opposite-size squares on its sides. Parameter: ratio
`r = small_side / large_side ∈ (0, 1)`. Special cases:

- `r → 0` — degenerate (small squares vanish).
- `r = 1/2` — pinwheel-looking, perfect "Pythagorean" mood.
- `r = 1/φ` — golden-ratio variant.
- `r = (√5 − 1)/2 ≈ 0.618` — Cairo-pentagon-aligned cross-vertices.

A single continuous parameter changes the visual character entirely.
Strands drawn over it with PIC produce "chinoiserie" lattice patterns
(Chinese ice-ray family, see §7.3).

### 6.5 Conway-Radin pinwheel tiling (infinite orientations)

Non-periodic substitution tiling on a **1:2:√5 right triangle** prototile.
Each tile substitutes into **5 copies scaled by 1/√5**, four rotated by
`arctan(1/2) ≈ 26.565°` (irrational multiple of π) so tiles appear in
**infinitely many distinct orientations** — the only known
statistically-isotropic tiling of the plane.

**Substitution rule (canonical form):**

```
Input triangle T with legs 1, 2 and hypotenuse √5.
Subdivide into 5 child triangles:
  child 1: scaled by 1/√5, no rotation, at corner A
  child 2: scaled by 1/√5, rotated 90°, at corner B
  child 3: scaled by 1/√5, rotated 180°, on the hypotenuse
  child 4: scaled by 1/√5, rotated 270°, on the hypotenuse
  child 5: scaled by 1/√5, rotated by arctan(1/2), centre
```

**Visual character.** A pinwheel-storm; never repeats; every direction of
strand eventually appears. Strong gallery candidate as a "non-Islamic,
non-periodic" feature piece.

**Generalisations.** Sadun's generalised pinwheels (countable family,
different rotation angles), Frettlöh's pinwheel-with-prescribed-rotations,
and 3D quaquaversal (Conway-Radin) — out of scope here.

### 6.6 Voderberg, Hirschhorn, and other spiral tilings

- **Voderberg tiling (1936).** Single elongated 9-gon (enneagon) prototile.
  Two copies of it can fully enclose a third copy. Standard layout is a
  logarithmic spiral with a single defect line; modified layout produces
  no translational symmetry but clear visual rotation. Earliest known
  monohedral spiral tiling.
- **Hirschhorn pentagonal (1976).** Pentagonal monotile (type 14-related)
  that admits a spiral layout. Forms a 5-fold logarithmic spiral when
  seeded centrally.
- **Bent wedge.** Generic family — any sufficiently-pointy isoceles
  triangle whose apex angle divides 360°.

Visually striking but interact poorly with PIC's local-rotation symmetry
assumptions; better suited to solid-fill or Truchet-style decoration.

### 6.7 Truchet tiles — decorative, not generative

A **Truchet tile** is a square (or hex / triangle) with a fixed motif that
is **not rotationally symmetric**. Random orientations produce
maze/labyrinth visuals.

| Variant | Motif | Visual |
|---------|-------|--------|
| Diagonal (Sébastien Truchet, 1704) | square cut along one diagonal, two colours | percolation maze |
| Smith (1987) | square with two quarter-circles at adjacent corners | smooth labyrinth curves |
| Pattern Block | square with mixed straight + arc segments | woven ribbon |
| Hexagonal | hex with three connection paths | flower-of-life-like |
| Triangular | triangle with three or one connection paths | flowing braids |

Truchet tiles are *complementary* to PIC: a **decoration applied to a
tiling** rather than a tiling in its own right. Implementable as a `Figure`
variant — a per-edge two-quarter-circle Figure with deterministic-random
orientation per polygon. With 4⁴ + Truchet → classic Truchet. With 3.6.3.6
+ hex Truchet → Wang-tile / flow visuals.

---

## 7. Non-Islamic decorative traditions

Each tradition is a *pattern style* layered on an existing tiling, not a
new tessellation. Cataloguing them as Bonner-style **presets** (a named
combination of tiling + Figure family + parameters) is the highest-impact
work for the Gallery — each preset unlocks an entire historical period
without engine work.

### 7.1 Egyptian (Pharaonic + Coptic + Egyptian Revival)

| Motif | Construction | Underlying tiling |
|-------|--------------|-------------------|
| **8-petal lotus rosette** | 8-fold local symmetry around hexagon centres | hexagonal (6³) or 3.6.3.6 |
| **Star-and-cross ceiling** (Nefersekheru, Karnak) | 4-fold yellow/red/blue rosettes on a square grid | square (4⁴) two-point family |
| **Zigzag chevron register** | horizontal bands of 60° or 30° zigzags | 4⁴ or 3⁶ with restricted strand rule |
| **Stepped ziggurat panel** | nested squares with chamfered corners | 4⁴ + Truchet-like step decoration |
| **Papyrus / lotus border** | repeating horizontal motif | frieze group, p1 |
| **Quatrefoil grid** | 4-fold rosettes at every other vertex | 4⁴ with √2-rotated overlay |

Most Egyptian motifs are **friezes** (1D repeats) rather than
wallpaper-group tilings. A new "frieze" mode that takes a tile and stamps
it along one axis would unlock these directly, and is the smallest add for
the most Egyptian coverage.

### 7.2 Art Deco (1920s–1930s, with Egyptian Revival overlay)

Strong fit for the current branch theme. Core motifs:

| Motif | Construction | Underlying tiling |
|-------|--------------|-------------------|
| **Chevron / herringbone** | 45° or 60° interlocking rectangles | rectangular (4⁴ stretched), 1:2 brick |
| **Sunburst** | radial rays from a centre point | rosette-patch + asymmetric ray figure |
| **Fan pattern** | overlapping circle-arcs in a grid | 4⁴ with quarter-circle Figure |
| **Stepped (Aztec / ziggurat)** | nested concentric squares with steps | 4⁴ with concentric Truchet |
| **Lozenge** | rhombille tiling with two-tone fills | rhombille + two-colour |
| **Sunburst-and-chevron combo** | central rosette + chevron border | rosette-patch + frieze border |

**Specific Art Deco Gallery candidates:**

- **Square + diagonal Truchet** → chevron / herringbone family.
- **Floret pentagonal** → fan / scallop patterning (the literal "fan"
  shape).
- **Tetrakis square** → sunburst (diagonal cuts read as rays).
- **3.12.12 with low contact angle** → stepped-rosette look.

### 7.3 Chinese ice-ray lattices

A **fractal subdivision tiling**: start with a polygon, recursively
subdivide each sub-polygon by drawing one straight cut at a random angle,
terminating when sub-polygons reach a minimum area. Irregular but
locally-quadrilateral lattice with random orientations but consistent
grain.

Pure recursive-subdivision generator; seedable RNG for reproducibility.
Output polygons feed PIC unchanged, though strands look best with
`subFamily: 'two-point'` since the lattice lacks rotational symmetry.

### 7.4 Celtic knotwork

Always a **decoration on a grid**, not a new tiling. Two-pass strapwork
(over/under) on a square or triangular underlying grid, with plait knot
rules chosen at each grid vertex. The legacy lacing system removed in
Phase 6 is the right shape for this; reintroducing over/under interlace
under the Decoration Phase would automatically give Celtic-style output.

### 7.5 Japanese Kumiko

Canonical lattice patterns on a **triangular base grid (jigumi)**:

| Pattern | Infill | Underlying |
|---------|--------|------------|
| **Asanoha** (hemp leaf) | 6-pointed star from each hex vertex | hexagonal grid + 6-fold sub-rays |
| **Shippo** (seven treasures) | overlapping circles, 4-fold | square grid + circle infill |
| **Kikko** (tortoise shell) | hexagonal outline with cross-bar | hexagonal grid |
| **Goma-gara** (sesame) | star-of-David variant | hexagonal grid |
| **Yae-zakura** (cherry blossom) | 8-fold rosette on diagonal grid | square diagonal grid |

**Asanoha** is reachable today: it's a **3.6.3.6 tiling with 6-fold figures
at hex centres, lineLength scaled so the strands exit each triangle as a
6-pointed star**. A preset would surface it.

---

## 8. Synthesis — unified ranked recommendations

Ranked by visual impact ÷ implementation cost. Merged from the original
2026-04-25 list (Islamic focus) with the 2026-05-19 expansion (non-Islamic
+ recent mathematical families).

### Tier 1 — High impact, low effort

1. ~~**16-fold rosette-patch.**~~ **DELIVERED 2026-04-27** as
   `hexadecagonal-rosette`. Unlocks Examples A, C, D from §1.
2. **Add `subFamily: 'two-point'`** to `FigureConfig`. With existing 4.8.8
   tiling this immediately produces star-and-cross patterns (Example B).
   Single highest-impact change for visual coverage.
3. **Add the 11 Laves tilings.** Single-planigon BFS seeds; data-only PR.
   Rhombille, Cairo, floret, tetrakis-square, kisrhombille are the visual
   standouts. Five-minute commit per tiling.
4. **Add Truchet as a Figure type.** Three Figure variants (diagonal,
   quarter-circle, S-curve) with deterministic-random orientation per
   polygon. Pairs with existing 4⁴ for instant chevron / labyrinth, and
   with new Laves entries for hex Truchet.
5. **Bonner-family presets + non-Islamic preset library.** Curated (tiling,
   figure-family, angle) triples: "Alhambra 8-fold", "Sultan Hassan
   16-fold", "Nefersekheru ceiling", "Chrysler sunburst", "Kumiko
   Asanoha", "Cairo streetscape". Pure data, no engine work.
6. **Frieze mode (1D friezes for Egyptian / Art Deco borders).** New
   `category: 'frieze'` with one parametric tile + one translation axis.
   Unlocks all Egyptian register-band motifs.
6a. *(added 2026-07-10)* **David's Star preset** over the shipped
   3.6.3.6 (§10.2) — pure Figure/preset work, zero geometry.
6b. *(added 2026-07-10)* **Kepler's Star (b = 67.5°)** — square +
   isosceles triangles + regular octagons via one Taprats block
   (§10.2, §11 A1). The flagship new star tiling: all-convex,
   PIC-safe, visually adjacent to the Islamic 8-point families.
6c. *(added 2026-07-10)* **Missing Laves duals** — prismatic
   pentagonal + triakis triangular (§11 A5); completes the Laves set
   using the exact 2026-05-19 recipe.
6d. *(added 2026-07-10)* **Archimedes' Star** (§10.2) — one Taprats
   block; only caveat is the collinear-vertex hexagon encoding probe.

### Tier 2 — Medium effort, big design-space expansion

7. **2-uniform tiling generator.** Generalise `neighborSides.ts` to
   orbit-indexed lookup; populate the 20 vertex-config table (§6.1).
   Unlocks Kepler "Kk" and 19 others.
8. **Girih-tile generator (Fivefold System, periodic).** Five tiles with
   pre-decorated contact lines; tile by edge-matching adjacency. New
   `category: 'girih'`. Reproduces 13th–15th-c. Persian patterns.
9. **Chinese ice-ray fractal-subdivision generator.** Recursive cut
   algorithm; new `category: 'subdivision'`; seedable RNG.
10. **Pythagorean / two-square tiling.** Single parameter `ratio`; new
    `category: 'two-square'`.
11. **15-family pentagonal tiling generator.** Data-heavy but engine-light;
    new `category: 'pentagonal'` with per-type descriptor table.
11a. *(added 2026-07-10)* **Night Sky + Snow Star** semiregular star
    tilings (§10.3) — 8-point/4-point and 6-point/3-point star Taprats
    blocks; isosceles proportions to derive from the tip-at-midpoint
    rule.
11b. *(added 2026-07-10)* **Select 2-uniform tilings as fixed Taprats
    blocks** without waiting for the BFS orbit generalisation (§11 A6):
    (3.4.3.12; 3.12²) first — it is Kaplan-demonstrated as a PIC
    substrate — then Kepler Kk #15 and #17.
11c. *(added 2026-07-10)* **Star-and-cross star-polygon tiling
    `(8.4*π/4)²` via convex decomposition** (§10.4, §11 A8) — an
    interim, generic-PIC version of the star-polygon families ahead of
    the rosette-pathway fold.

### Tier 3 — Substitution-tiling engine (one engine, many payoffs)

A single new `category: 'substitution'` source covers:

12. **Penrose P3** — Robinson-triangle internal storage, P3 thick/thin
    rhombi output. Decorate with Penrose's circular-arc decoration as an
    alternate render layer.
13. **Ammann–Beenker** — square + 45° rhombus, inflation 1+√2. True
    non-periodic 8-fold counterpart to 4.8.8.
14. **Stampfli / Socolar (12-fold)** — completes the quasi-periodic suite
    (5-, 8-, 12-fold).
15. **Conway-Radin pinwheel** — 1:2:√5 right triangle, infinite
    orientations.
16. **Hat / Spectre aperiodic monotile.** Worth a separate
    `category: 'monotile'` with H/T/P/F metatiles since the metatile
    system is its own architecture.

### Tier 4 — Long-term / research / decoration-phase

17. **Substitution-Girih unification.** Implement Lu & Steinhardt's
    15th-century Darb-i Imam construction: Girih tiles substituted
    recursively into a Penrose-equivalent quasiperiodic pattern.
18. **Truchet-on-Hat.** Per-Hat decoration with hand-authored line pattern
    — a unique gallery centrepiece (fully aperiodic, infinitely-varied
    Islamic-style pattern).
19. **Two-pass strapwork (Celtic / over-under interlace).** Reintroduce
    the lacing path under the Decoration Phase per the existing plan.
    Unlocks Celtic knotwork output as a side effect.
20. **Spiral tilings (Voderberg, Hirschhorn).** Niche but visually
    striking; one prototile + spiral placement function.
20a. *(added 2026-07-10)* **True star-polygon-tile figures + Hankin
    primitives** (§10.4, §10.6, §11 D) — the 22 uniform star-polygon
    tilings with star-outline constructed figures, the Altair tiling,
    and the 11+13-pointed-star Hankin combination. Gated on the
    rosette-pathway architectural fold
    (`project_star_tilings_gallery_idea.md`).

### Suggested first three Gallery additions (after Tier 1 #2 ships)

If only three are picked up next from the as-yet-unbuilt list:

1. **Rhombille (Laves dual of 3.6.3.6)** — instantly gives Cairo
   streetscape / Escher-cube vibe; lowest-effort visually-distinctive
   addition.
2. **Cairo pentagonal** — the most-recognised non-Archimedean tiling
   outside Islamic; matches the branch's Egypt theme perfectly.
3. **Tetrakis square** — Art Deco sunburst substrate; 45° right triangles
   tile the square with 4-fold symmetry; pairs with low contact angle for
   stepped chevron output.

All three are single-planigon BFS additions in the existing pipeline —
combined they should be one short PR.

### Architectural notes for the project

- The current pipeline (Tiling → Figure → Render) cleanly accommodates
  everything up to Tier 2. Tier 3 needs a new tile-source category
  (substitution rather than BFS). The Figure and Render layers are
  unchanged.
- `TilingDefinition` may want a discriminated union: `{ category:
  'archimedean' | 'rosette-patch' | 'k-uniform' | 'laves' | 'pentagonal' |
  'two-square' | 'frieze' | 'girih' | 'substitution' | 'monotile' |
  'subdivision' | 'spiral'; ... }` with each variant carrying its own
  metadata.
- Quasi-periodic generators have no fixed periodic cell, so the existing
  `viewport` argument for tile generation is sufficient — they grow on
  demand.

---

## 9. Editor-specific notes (Step 17, May 2026)

Implementation-adjacent notes from building the user-editable patch editor.
Kept here so they don't get lost; not part of the research-survey proper.

### 9.1 Canonical shape signatures for irregular tiles

To make two completed gaps with the same shape collapse to the same
`tileTypeId` (so they share strand-figure tuning), the editor canonicalises
an irregular polygon to a string signature:

1. Compute interior angles in CCW vertex order.
2. Compute edge lengths in CCW order, normalised by the longest edge so
   the signature is scale-invariant.
3. Quantise both to 4 decimal places (`round(x · 10000)`).
4. Interleave as `[angle₀, edge₀, angle₁, edge₁, …]`.
5. Generate every cyclic rotation (rotating by 2 elements per step keeps
   angle/edge pairing aligned) for both the original and the reversed
   vertex order (reflection invariance), and pick the lex-min.
6. FNV-1a 32-bit hash → 8 lowercase hex chars.

`tileTypeId = "<n>i:<hash>"`. Regulars stay on `"<n>"` so they share keys
with the archimedean tilings. Implementation: `src/editor/tileTypeId.ts`.

This is a known canonical-form trick for unordered cyclic sequences; the
4-d.p. quantisation + reversed-pass handles floating-point drift and
chiral duplicates without needing a heavier symbolic comparator.

### 9.2 Wallpaper translation lattices for the boundary cells

For the strand-editor lattice preview (Step 17.6) we need a translation
basis that tiles the plane with one stamp per fundamental cell:

| Boundary | Edge | Basis u | Basis v | Stamp orientations |
|----------|------|---------|---------|---------------------|
| Square   | L    | (L, 0)        | (0, L)            | 1 |
| Hexagon  | L    | (√3·L, 0)     | (√3·L/2, 1.5·L)   | 1 |
| Triangle | L    | (L, 0)        | (L/2, L√3/2)      | 2 (alternating up + 180°-rotated down) |

Square and hex tile under translation alone. **Triangle** is trickier:
equilateral triangles only tile when neighbouring cells alternate
orientation, so the stamp set has two orientations on a parallelogram
sub-lattice. For non-equilateral / non-regular boundaries (a v2 idea), the
lattice basis would have to come from the boundary-cell geometry itself.

### 9.3 Outer-boundary cycle from exposed edges

A patch's outer boundary is reconstructed from `computeExposedEdges` by
walking edges head-to-tail (next edge's `p1 ≈ current edge's `p2`) until
the cycle closes. Each tile's vertices are CCW, so the resulting cycle is
CCW. Disconnected boundaries (a hole in the patch) would produce multiple
cycles; the editor's reducer prevents disconnected tiles by construction,
so v1 only handles single-cycle patches.

The Complete operation uses this cycle to resolve the gap between two
picked vertices: it walks both arcs, builds a candidate polygon (chord +
arc) for each, and keeps the one whose centroid lies *outside* every
existing tile. This handles concavities and rejects convex-side chords
without needing an explicit reflex-vertex test.

---

## 10. Star tilings — deep dive (2026-07-10)

Primary sources: Fisher & Mellor 2012, *Using tiling theory to generate
angle weaves with beads*, J. Math. Arts 6(4):141–158
(DOI [10.1080/17513472.2012.736935](https://doi.org/10.1080/17513472.2012.736935);
full text read from the
[author preprint PDF](https://beadinfinitum.com/TilingTheoryStarWeavesG18X.pdf));
Grünbaum & Shephard, *Tilings and Patterns* (1987) — star-polygon
tilings summarised via
[Wikipedia: Uniform tiling](https://en.wikipedia.org/wiki/Uniform_tiling);
Kaplan 2005, *Islamic Star Patterns from Polygons in Contact*
([PDF](https://cs.uwaterloo.ca/~csk/publications/Papers/kaplan_2005.pdf),
full text read 2026-07-10). Geometry marked **[derived]** below was
worked out for this doc from the paper's construction, not stated in the
source — re-verify against the paper's Figure 8 during implementation.

### 10.1 The Fisher–Mellor star-of-triangles construction (exact)

Definitions (paper §2.3, quoted near-verbatim):

- A **star with n ≥ 3 points** is a set of n triangles meeting corner to
  corner so that their **bases form an interior polygon with n sides**,
  all triangles pointing outwards. The n **points** are the n apexes.
- A star is **regular** if all triangles are equilateral and congruent
  and the interior polygon is regular; **semiregular** if the interior
  polygon is regular and the triangles are isosceles (not necessarily
  equilateral or congruent) with bases on the interior polygon.
- **Star tiling of a tiling T**: place a star at each vertex of T such
  that (a) the star's point count equals the **valence** of that vertex,
  (b) the star's centre sits **on the vertex**, and (c) the star's points
  land on the **midpoints of the edges** of T incident to that vertex.
  Any normal polygonal tiling admits this; a given T has many star
  tilings depending on the interior-polygon size (the free parameter).
- The star tiling's tiles are: interior polygons (one per T-vertex),
  point triangles (two per T-edge, apex-to-apex at the edge midpoint),
  and the **gap polygons** left over (one per tile of T).
- **n-star generalisation** (paper §6): put **two** (or n) star points
  along each interior-polygon edge instead of one — a 2-star tiling of
  6³ has 12-pointed stars joined along two points per neighbour. This is
  the star-tiling analogue of Bonner's **two-point family** (§3.3) and
  of Kaplan's δ-split contact positions (§10.6).

Theorems (angle-weave duality — maps onto PIC as *stars-on-vertices ↔
figures-on-edges*):

- **Theorem 1.** The vertex-only weave of the star tiling of T has the
  same bead pattern as the **edge-and-cover weave of T**, plus extra
  thread connecting the cover beads at the vertices of T.
- **Theorem 2.** The across-edge weave of T equals the vertex-only star
  weave of **T\*** (the dual tiling).
- **Theorem 3.** The n-across-edge weave of T equals the vertex-only
  **n-star** weave of T\*.

PIC reading: a bead at a star-tiling vertex corresponds to a contact
point on a base-tiling edge, so **default contact angles for a star
tiling should mirror the θ we'd choose for the base tiling's edge
figures** — Theorem 1 is the licence for reusing the base tiling's θ
presets.

### 10.2 The three regular star tilings — implementable specs

All three use regular stars (equilateral triangles + regular interior
polygon). Base-tiling edge length L throughout; the tip-at-edge-midpoint
condition (distance L/2 from the vertex) fixes every dimension.

**David's Star** — star tiling of 3⁶ (valence 6 → hexagrams).

- Interior hexagon side s with hexagram tip radius s√3 = L/2 →
  **s = L/(2√3) ≈ 0.2887 L** [derived].
- The paper states this tiling **is (3.6.3.6)** — each trihexagonal
  hexagon plus its 6 surrounding triangles reads as a hexagram. So
  David's Star is *not a new tiling for us*: it is a **Figure/decoration
  preset over the shipped 3.6.3.6** that emphasises the hexagram outline
  (the star reading partitions the edges into two classes: star-outline
  edges vs edges interior to stars — the paper's Figure 19 colours
  exactly these to get the David's Star look). Zero geometry work; the
  deliverable is a named preset (strand emphasis / two edge classes),
  which today approximates to a 3.6.3.6 preset with θ chosen so hexagon
  figures form hexagrams (θ = 60° puts 6-gon rays along the hexagram
  directions).

**Kepler's Star** — star tiling of 4⁴ (valence 4 → 4-pointed stars).
Named for Kepler because the drawing resembles his published 2-uniform
tiling (3.4.3.12; 3.12²) from *Harmonices Mundi* (1619).

- Full parametric family **[derived]**, base-angle parameter b = the
  isosceles point-triangle's base angle (regular star ⇔ b = 60°):
  - Interior square side **s = L/(1 + tan b)**, rotated 45° to the
    lattice (edges facing the 4 lattice directions); point apexes at
    (±L/2, 0), (0, ±L/2) relative to the vertex.
  - Point-triangle flank length **ℓ = s/(2 cos b)**.
  - Gap tile: an **equilateral octagon** centred on each 4⁴ cell centre,
    all 8 edges of length ℓ, interior angles alternating **2b** (at star
    tips) and **270° − 2b** (at interior-square corners). Every vertex
    of the star tiling has valence 4.
  - b = 60° (Fisher–Mellor's regular star): s = L/(1+√3) ≈ 0.366 L,
    octagon angles 120°/150° — the paper's version ("the octagons are
    not regular").
  - **b = 67.5° makes the gap octagon regular** (both angle families hit
    135°): s = L/(1 + tan 67.5°) ≈ 0.2929 L, tiles = square (s) +
    isosceles 67.5°-67.5°-45° triangles + **regular octagons** (side
    ≈ 1.307 s). Note 67.5° is exactly the project's classic 4.8.8
    contact angle — this variant is the natural "Islamic" Kepler's Star
    and sits visually adjacent to the 8-pointed-star families [derived;
    not in the paper].
  - The tiling is edge-to-edge for every b (square↔triangle-base,
    octagon↔triangle-flank).
- All tiles convex → **PIC-safe**; the octagon is irregular for b ≠
  67.5° (mild edge-slide territory, already handled by the 2026-05
  edge-slide fix).

**Archimedes' Star** — star tiling of 6³ (valence 3 → 3-pointed stars).

- Interior triangle side s with tip radius 2s/√3 = L/2 →
  **s = √3 L/4 ≈ 0.433 L** [derived].
- Paper: "closely resembles (3.6.3.6), except with an additional
  triangle inscribed inside each triangle of (3.6.3.6)". Verified by
  derivation: the result **is 3.6.3.6 at edge √3L/2 with every triangle
  medially subdivided into 4 equilateral triangles** (central inverted
  triangle = star interior; 3 corner triangles = the star points of the
  three stars whose tips meet at that triangle's corners). Gap tiles =
  the regular 3.6.3.6 hexagons, unchanged [derived: the would-be 12-gon
  gap has straight angles at 6 of its vertices — 60+60+60 tiles leave
  exactly 180° — so it degenerates to the regular hexagon].
- ⚠ **Non-edge-to-edge**: each hexagon edge (√3L/2) faces **two**
  triangle edges (√3L/4). Straight-through PIC would place the hexagon's
  contact point at its full-edge midpoint, mismatching the two
  triangles' midpoints. Fix at encoding time: emit the hexagon as a
  **12-gon with collinear vertex pairs** (split each edge at its
  midpoint) so per-edge contact midpoints align across the border. Needs
  a quick check that nothing in the pipeline chokes on collinear
  boundary vertices.

### 10.3 Semiregular star tilings over the Laves duals

Any tiling with **regular vertices** (equal angles between consecutive
edges — true of all 11 Laves tilings) induces a semiregular star tiling
(paper §2.3). Named instances in the paper:

| Name | Base (Laves dual of) | Stars | Notes |
|------|----------------------|-------|-------|
| **Snow Star** | rhombille (dual 3.6.3.6) | regular 3-point + 6-point | base = "Tumbling Blocks" 60° rhombi; two star species |
| **Night Sky** | tetrakis square (dual 4.8²) | semiregular 4-point + 8-point | **8-pointed stars** — the most Islamic-looking of the set; vertex-only variant = "Picnic Weave" |
| *(unnamed)* | triakis triangular (dual 3.12²) | 3-point + 12-point | paper Figure 26; 12-pointed stars |

All three bases already ship (rhombille, tetrakis-square via Taprats;
triakis triangular is a missing Laves entry — see §11). The star tilings
are new polygon sets: interior polygons + isosceles point triangles +
gap polygons, all placeable as Taprats data blocks on the base tiling's
translation lattice. Exact isosceles proportions per valence follow from
the tip-at-midpoint rule; the edges incident to a regular vertex are
perpendicular bisectors of the interior polygon's edges (paper §2.3), so
the interior n-gon is oriented with edges normal to the base edges.

### 10.4 Tilings whose *tiles* are star polygons (Grünbaum & Shephard)

Distinct from §10.1 (where the "star" is an assembly of triangle tiles):
here the non-convex star polygon is itself one tile. G&S (1987) treat
these in the star-tilings/hollow-tilings material and enumerate **25
uniform tilings = 11 convex + 14 "hollow"** using star polygons and
generalised vertex figures ([Wikipedia: List of Euclidean uniform
tilings](https://en.wikipedia.org/wiki/List_of_Euclidean_uniform_tilings));
the hollow list is flagged as possibly incomplete. Separately,
[Wikipedia: Uniform tiling](https://en.wikipedia.org/wiki/Uniform_tiling)
tabulates **22 uniform tilings using ordinary (filled) star-polygon
tiles**, in isotoxal n\*α notation (n-pointed star with adjustable point
angle α):

- **4 families with a free angle α**: `3.6*α.6**α`, `4.4*α.4**α`,
  `6.3*α.3**α`, `3.3*α.3.3**α`. The free α is directly analogous to our
  `contactAngle` — one slider per family.
- **18 with fixed angles**, including (Islamic-relevant picks):
  `(8.4*π/4)²` — octagons + 4-pointed stars = the classic
  **star-and-cross / khatem ground**; `12.12.4*π/3` — dodecagons +
  4-stars; `(12.3*π/6)²` — dodecagons + 3-stars; `(6.6*π/3)²` —
  hexagons + hexagrams; `4.6.4*π/6.6`, `3.6.6*π/3.6`, `9.3.9.3*π/9`,
  `18.18.3*2π/9`, `5.5.4*π/10.5.4*π/10` (pentagon-rich), and eight more
  (full list in the Wikipedia table).

**Key implementation insight**: every isotoxal star tile n\*α decomposes
into a convex interior n-gon + n isosceles triangles — i.e. **any
star-polygon tiling can be re-encoded as an all-convex tiling** in
exactly the Fisher–Mellor sense, then fed to PIC. Alternatively (and
better visually) the star tile is the natural unit for a **bespoke
constructed figure** via the rosette pathway — the star outline *is* the
strand. So star-polygon tilings are the cleanest concrete target for the
rosette-pathway architectural fold
(`project_star_tilings_gallery_idea.md`): convex-decomposition gives an
immediate generic-PIC version; constructed figures give the fully
controlled version later.

### 10.5 Kepler's *Harmonices Mundi* (1619) tilings

- Kepler's **Aa** diagram: pentagons + pentagrams + decagons + "fused
  double decagons". Proven continuable to a full plane tiling; Kepler
  conjectured every extension introduces new features (proto-aperiodic —
  the ancestor of Penrose P1, which uses the same tile family). Sources:
  [Imperfect Congruence — pentagon tilings](https://gruze.org/tilings/pentagon_tilings),
  [Wikipedia: Penrose tiling](https://en.wikipedia.org/wiki/Penrose_tiling)
  (history section). For us this is a **rosette-pathway / substitution
  candidate**, not a periodic entry.
- Kepler also published periodic star-polygon and 2-uniform patterns —
  the 2-uniform **(3.4.3.12; 3.12²)** honoured by the Kepler's Star name
  (Fisher & Mellor §2.3) and the "Kk" tiling already noted at §6.1 #15.
  (3.4.3.12; 3.12²) appears as a PIC substrate in Kaplan 2005's Figure 3
  — see §10.6 — which makes it the most PIC-credentialed 2-uniform
  target we have.

### 10.6 Kaplan 2005 (PIC paper) — full-text anchors for this doc

Read in full 2026-07-10. Facts relevant to tiling selection:

- **Substrates demonstrated** (Fig. 3): 4.8² (θ = 22.5°/45°/67.5°),
  4.6.12 (45°/60°/75°), the 2-uniform **(3.4.3.12; 3.12²)**
  (35°/60°/75°), and the **"Altair" tiling** — a tiling by *nearly*
  regular polygons reproduced from Grünbaum & Shephard p. 64 (related
  design in Bourgoin Plate 163). Inference "performs perfectly on
  regular polygons"; on irregular tiles it "sometimes produces motifs
  with unmatched rays" — Kaplan's own statement of the degeneracy our
  edge-slide fixes chase.
- **Two-point patterns**: a second parameter δ splits each contact
  point in two (δ ∈ (0, shortest-edge length]); Bonner's two-point
  family. Typical θ = 45°, forming squares around edge midpoints. This
  confirms §3.3's proposed data-model change is one scalar per Figure.
- **Second-pass inference**: large regular polygons (dodecagons) left
  hollow by pass 1 get a second inward inference pass — relevant to our
  12-gon-heavy candidates.
- **Rosette transform**: a tiling→tiling operator explaining "Najm
  tilings" (regular polygons touching) vs **"Hankin tilings"** (large
  regular polygons separated by rings of irregular pentagons — exactly
  our `*-rosette` entries). Some Hankin tilings are **primitive** (not a
  rosette transform of anything): the Altair tiling, and Bonner's
  **11-and-13-pointed-star design**, where the irregular ring tiles
  absorb the incompatible angles of 11- and 13-gons. Direct precedent
  for an `11.13-rosette` style Gallery entry.
- **Known limits**: the dodecagon-triangle "extended rosette" pattern
  (his Fig. 14) needs multiple contact angles per pattern or non-greedy
  inference — out of reach of plain PIC; matches our rosette-pathway
  fold rationale.
- His representation of a periodic tiling = two translation vectors +
  untransformed polygons + per-polygon transform lists — identical in
  shape to our `tapratsTiling.ts` blocks (as expected; same lineage).

### 10.7 Implementability verdict (star tilings)

| Entry | Verdict | Pathway | Risk |
|-------|---------|---------|------|
| David's Star | ✅ trivial | preset over shipped 3.6.3.6 (two edge classes / θ = 60°) | none |
| Kepler's Star (b = 67.5°, regular octagons) | ✅ easy | Taprats block on the 4⁴ lattice (t1=(L,0), t2=(0,L); square + 4 triangles + octagon per cell) | none — all tiles convex, octagon regular |
| Kepler's Star (b free) | ✅ easy–medium | same block, b as a per-tiling parameter (would be our first parametric Taprats entry) | irregular octagon → mild edge-slide exposure |
| Archimedes' Star | ✅ easy | Taprats block on hex lattice; encode hexagons as 12-gons with collinear vertex pairs | collinear-vertex tolerance needs one probe |
| Night Sky | ✅ medium | Taprats block on tetrakis-square lattice (4-star + 8-star + gaps) | isosceles proportions to derive from tip rule |
| Snow Star | ✅ medium | Taprats block on rhombille lattice (3-star + 6-star + gaps) | as above |
| Star of triakis (3.12²-dual) | ✅ medium | Taprats block (needs triakis triangular itself first, see §11) | as above |
| 2-star tilings (12-point stars over 6³ etc.) | ⚠ medium | Taprats block; pairs naturally with the two-point Figure work | more tiles per cell |
| Star-polygon-as-tile tilings (§10.4) | ⚠ split | convex-decomposition → Taprats now; star-outline figures → rosette-pathway later | decomposition changes the strand topology vs a true star tile |

---

## 11. Candidate catalogue by implementation pathway (2026-07-10)

Consolidates §§3–7 + §10 into pathway buckets against the 2026-07 engine
(BFS `archimedean` + Taprats `rosette-patch`; no k-uniform, substitution,
or constructed-figure engine).

### A. Taprats data block — no engine work (proven pathway, cf. the six Laves entries of 2026-05-19)

1. **Kepler's Star, b = 67.5°** (§10.2) — square + isosceles triangles +
   regular octagon on the square lattice. Highest star-tiling priority.
2. **Archimedes' Star** (§10.2) — 3.6.3.6 with medially-subdivided
   triangles (collinear-vertex encoding note).
3. **Night Sky** (§10.3) — 8-pointed + 4-pointed stars; most Islamic of
   the Fisher–Mellor set.
4. **Snow Star** (§10.3) — 6-point + 3-point regular stars on rhombille.
5. **Missing Laves duals** — the shipped set (§0) has 6 of 8 non-regular
   Laves; still absent: **prismatic pentagonal** (dual 3³.4²) and
   **triakis triangular** (dual 3.12²). Same recipe as the 2026-05-19
   batch; triakis also unblocks its star tiling.
6. **Individual 2-uniform tilings as fixed Taprats blocks** — any of the
   20 (§6.1) can be hand-encoded without the BFS orbit generalisation
   (translation cell + transforms). Priority picks: **(3.4.3.12; 3.12²)**
   (Kaplan-demonstrated PIC substrate, Kepler-published), **#15 Kepler
   "Kk" (3.4.6.4; 3.4².6)**, **#17 (3.4.6.4; 4.6.12)**, and the chiral
   pair **#4/#5 (3⁶; 3⁴.6)**.
7. **Pythagorean two-square tiling** (§6.4) — one block per chosen ratio
   (or a parametric block, cf. Kepler's Star b).
8. **Star-polygon tilings via convex decomposition** (§10.4) —
   `(8.4*π/4)²` star-and-cross first (octagon + interior square +
   triangles), then `12.12.4*π/3` and `(6.6*π/3)²`.

### B. Figure-layer work only — no new tilings

9. **David's Star preset** over 3.6.3.6 (§10.2) — plus the general
   Bonner-preset library (§8 Tier 1 #5).
10. **Two-point δ parameter** on `FigureConfig` (§3.3, confirmed by
    Kaplan's δ, §10.6) — star-and-cross across every shipped tiling.
11. **Second-pass inward inference** for big regular polygons (§10.6) —
    fills hollow 12-gon/16-gon centres; complements the rosette pathway.
12. **Truchet figures** (§6.7).

### C. BFS generator extension (orbit-aware `neighborSides`)

13. **The 20 2-uniform tilings wholesale**, then 3-uniform+ (§3.1, §6.1)
    — supersedes the per-tiling blocks of A6 if/when Step 15 unparks;
    Medeiros e Sá 2018 seed-vertex encoding is the right data model.

### D. Rosette-pathway-gated (constructed figures; the architectural fold in `project_star_tilings_gallery_idea.md`)

14. **True star-polygon tiles with star-outline figures** (§10.4) — the
    22 uniform star tilings incl. the four α-parametric families.
15. **Girih tile set with authored decoration lines** (§4.4, §8 Tier 2 #8).
16. **Bonner Fourfold A / Fourfold B / Sevenfold systems** (§3.4).
17. **Hankin "primitive" tilings**: Altair; **11+13-pointed-star**
    combination (§10.6) — irregular ring tiles absorbing incompatible
    angles; extends our existing `hendecagonal-rosette` line.
18. **Kaplan Fig.-14-class extended rosettes** (multiple contact angles
    per pattern) — hardest; needs Najm-style explicit rosette
    parameterisation, i.e. the full fold.

### E. New engines (unchanged from §8 Tiers 3–4)

19. Substitution suite (Penrose P3, Ammann–Beenker, Socolar/Stampfli,
    pinwheel, **Kepler Aa**/P1-family) and the Hat/Spectre monotile.

---

## Open follow-ups

- Exact substitution diagrams for Ammann–Beenker (Wikipedia describes
  abstractly; image extraction or paper inspection needed for
  implementation).
- Detailed Girih-tile decoration line diagrams (each of the 5 tiles has a
  specific pre-drawn line set; digitise from Lu & Steinhardt fig. 2 or
  Bonner ch. 5).
- Explicit Hat metatile substitution rules with coordinates (the Smith
  et al. paper has them in appendix; we have only the high-level
  description here).
- The "freeform" Islamic pattern method (Kaplan et al. 2023, arXiv
  2301.01471) which generalises rosette placement beyond fixed tilings —
  separate research thread.
- Hyperbolic Islamic patterns (Bonner & Kaplan briefly cover; out of
  scope for now).

---

## Sources

### Islamic / PIC foundations

- [Bonner — *Islamic Geometric Patterns: Their Historical Development and Traditional Methods of Construction*, Springer 2017](https://link.springer.com/book/10.1007/978-1-4419-0217-7)
- [Bonner & Pelletier — *A 7-Fold System for Creating Islamic Geometric Patterns*, Bridges 2012 (PDF)](https://archive.bridgesmathart.org/2012/bridges2012-141.pdf)
- [Kaplan 2005 — *Islamic Star Patterns from Polygons in Contact* (PDF)](https://cs.uwaterloo.ca/~csk/publications/Papers/kaplan_2005.pdf)
- [Kaplan 2004 — *Islamic Star Patterns in Absolute Geometry* (PDF)](https://grail.cs.washington.edu/wp-content/uploads/2015/08/kaplan-2004-isp.pdf)
- [The Geometric Rosette: analysis of an Islamic decorative motif (MIT tilingsearch, PDF)](https://tilingsearch.mit.edu/RosetteAnalysis.pdf)
- [Drawing Islamic Geometric Designs — basic rosettes (Anthony Lee's methods)](https://www.drawingislamicgeometricdesigns.com/basic-rosettes-anthony-lees-methods/Blog%20Post%20Title%20One-n5m4l)
- [Wikipedia — Islamic geometric patterns](https://en.wikipedia.org/wiki/Islamic_geometric_patterns)
- [Sami Ramian — Twelvefold Islamic Geometric Rosette tutorial](https://www.samiramian.uk/twelvefoldrosette)
- [Sarah Brewer — 10-fold Islamic Rosette tutorial (PDF)](http://mathemartiste.com/geometricdesign/10foldRosetteTutorial_SarahBrewer.pdf)
- [16-Fold Rosette construction tutorial — YouTube](https://www.youtube.com/watch?v=88q-u2eWZqg)

### Substitution / quasiperiodic

- [Lu & Steinhardt 2007 — *Decagonal and Quasi-Crystalline Tilings in Medieval Islamic Architecture*, Science (PDF)](https://paulsteinhardt.org/wp-content/uploads/2023/01/LuSteinhardt2007.pdf)
- [Wikipedia — Penrose tiling](https://en.wikipedia.org/wiki/Penrose_tiling)
- [Wikipedia — Ammann–Beenker tiling](https://en.wikipedia.org/wiki/Ammann%E2%80%93Beenker_tiling)
- [Wikipedia — Socolar tiling](https://en.wikipedia.org/wiki/Socolar_tiling)
- [Tilings Encyclopedia — Penrose Rhomb (Bielefeld)](https://tilings.math.uni-bielefeld.de/substitution/penrose-rhomb/)
- [Tilings Encyclopedia — Ammann-Beenker (Bielefeld)](https://tilings.math.uni-bielefeld.de/substitution/ammann-beenker/)
- [Tilings Encyclopedia — Socolar (Bielefeld)](https://tilings.math.uni-bielefeld.de/substitution/socolar/)
- [Geometricolor — *Generating Quasiperiodic Tilings VI: Ammann-Beenker*](https://geometricolor.wordpress.com/2022/05/01/generating-quasiperiodic-tilings-and-fractals-vi-the-ammann-beenker-tiling/)
- [Properties of the Ammann–Beenker tiling and its square approximants (arXiv 2308.07701)](https://arxiv.org/html/2308.07701v2)
- [A Quasiperiodic Tiling With 12-Fold Rotational Symmetry and Inflation Factor 1+√3 (arXiv 2102.06046)](https://arxiv.org/pdf/2102.06046)
- [Tatham — Two algorithms for randomly generating aperiodic tilings](https://www.chiark.greenend.org.uk/~sgtatham/quasiblog/aperiodic-tilings/)
- [Penrose substitution — Imperfect Congruence](https://gruze.org/tilings/penrose_sub)
- [Edmund Harriss — *Images of the Ammann-Beenker Tiling*, Bridges 2007 (PDF)](https://archive.bridgesmathart.org/2007/bridges2007-377.pdf)
- [Chung, Chan, Wang — *Automatic generation of nonperiodic patterns from dynamical systems*, Chaos, Solitons & Fractals 2004](https://doi.org/10.1016/s0960-0779(03)00307-2) — Chair / Sphinx substitution; tree of tile-transformations; invariant-mapping framework
- [Chung & Wang — *Automatic generation of aesthetic patterns on aperiodic tilings by means of dynamical systems*, Int. J. Bifurc. Chaos 2004](https://doi.org/10.1142/s0218127404011314) — Penrose-tiling invariant mappings with boundary-continuity theorems
- [Chung & Ma — *Automatic generation of aesthetic patterns on fractal tilings by means of dynamical systems*, Chaos, Solitons & Fractals 2005](https://doi.org/10.1016/j.chaos.2004.09.115) — fractal (f-)tilings from kite/dart prototiles; classification (m,n)ₓ; nine single-prototile cases

### Aperiodic monotiles (Hat & Spectre, 2023)

- [Smith, Myers, Kaplan, Goodman-Strauss — *An aperiodic monotile* (arXiv 2303.10798)](https://arxiv.org/abs/2303.10798)
- [Smith, Myers, Kaplan, Goodman-Strauss — *A chiral aperiodic monotile* (arXiv 2305.17743)](https://arxiv.org/abs/2305.17743)
- [Craig Kaplan — Spectre tile resources (Waterloo)](https://cs.uwaterloo.ca/~csk/spectre/)
- [Wikipedia — Einstein problem](https://en.wikipedia.org/wiki/Einstein_problem)

### Periodic non-Archimedean tilings

- [Wikipedia — Euclidean tilings by convex regular polygons (2-uniform list)](https://en.wikipedia.org/wiki/Euclidean_tilings_by_convex_regular_polygons)
- [Wikipedia — List of k-uniform tilings](https://en.wikipedia.org/wiki/List_of_k-uniform_tilings)
- [Wikipedia — Demiregular tiling](https://en.wikipedia.org/wiki/Demiregular_tiling)
- [Wikipedia — Planigon (Laves tile catalogue)](https://en.wikipedia.org/wiki/Planigon)
- [Wikipedia — Pentagonal tiling (15 types)](https://en.wikipedia.org/wiki/Pentagonal_tiling)
- [Wikipedia — Cairo pentagonal tiling](https://en.wikipedia.org/wiki/Cairo_pentagonal_tiling)
- [Polytope Wiki — Floret pentagonal tiling](https://polytope.miraheze.org/wiki/Floret_pentagonal_tiling)
- [Wikipedia — Pinwheel tiling (Conway-Radin)](https://en.wikipedia.org/wiki/Pinwheel_tiling)
- [Sadun — *Some Generalizations of the Pinwheel Tiling* (arXiv math/9712263)](https://arxiv.org/abs/math/9712263)
- [Wikipedia — Pythagorean tiling](https://en.wikipedia.org/wiki/Pythagorean_tiling)
- [Wikipedia — Voderberg tiling](https://en.wikipedia.org/wiki/Voderberg_tiling)
- [Medeiros e Sá, de Figueiredo, Soto Sánchez — *Synthesizing Periodic Tilings of Regular Polygons*, SIBGRAPI 2018](https://doi.org/10.1109/sibgrapi.2018.00009) — basic-directions / seed-vertex encoding; roots of unity for n ∈ {1,2,3,4,6,8,12}
- [Fisher & Mellor — *Using tiling theory to generate angle weaves with beads*, J. Math. Arts 2012](https://doi.org/10.1080/17513472.2012.736935) — star tilings (David / Kepler / Archimedes); vertex-weave ↔ edge-weave duality; [author preprint PDF](https://beadinfinitum.com/TilingTheoryStarWeavesG18X.pdf) (full text read 2026-07-10); [LMU Digital Commons record](https://digitalcommons.lmu.edu/math_fac/185/)
- [Wikipedia — Uniform tiling (star-polygon tilings table: 4 α-parametric + 18 fixed)](https://en.wikipedia.org/wiki/Uniform_tiling)
- [Wikipedia — List of Euclidean uniform tilings (11 convex + 14 hollow, Grünbaum & Shephard 1987)](https://en.wikipedia.org/wiki/List_of_Euclidean_uniform_tilings)
- [Grünbaum & Shephard — *Tilings and Patterns*, W.H. Freeman 1987 (Google Books)](https://books.google.com/books/about/Tilings_and_Patterns.html?id=0x0vDAAAQBAJ)
- [Imperfect Congruence — Kepler's pentagon tilings incl. the Aa diagram](https://gruze.org/tilings/pentagon_tilings)
- [*De tessere quinquangula: five hundred years of pentagonal tilings from Dürer to Mackay via Kepler, Escher, and Penrose*, Structural Chemistry 2025](https://link.springer.com/article/10.1007/s11224-025-02652-x)

### Decorative / Truchet / non-Islamic traditions

- [Wikipedia — Truchet tiles](https://en.wikipedia.org/wiki/Truchet_tiles)
- [MathWorld — Truchet tiling](https://mathworld.wolfram.com/TruchetTiling.html)
- [PMC — *Infinitely Variable Tiling Patterns: From Truchet to Sol LeWitt Revisited*](https://pmc.ncbi.nlm.nih.gov/articles/PMC7660392/)
- [ScienceDirect — *Fractal-based algorithmic design of Chinese ice-ray lattices*](https://www.sciencedirect.com/science/article/pii/S2095263521000844)
- [Phys.org — *Ice-ray patterns: a rediscovery of past design for the future*](https://phys.org/news/2024-03-ice-ray-patterns-rediscovery-future.html)
- [NRICH — Celtic knotwork patterns](https://nrich.maths.org/articles/celtic-knotwork-patterns)
- [Kumiko Woodworking — Tanihata Co. pattern catalogue](https://kumikowoodworking.com/design/)
- [Instructables — Shippo Kumiko pattern tutorial](https://www.instructables.com/Learn-the-Shippo-Kumiko-Pattern/)
- [AweDeco — Chevron patterns in Art Deco](https://awedeco.com/chevron-patterns-in-art-deco/)
- [AweDeco — Fan pattern in Art Deco design](https://awedeco.com/fan-pattern-in-art-deco-design/)
- [Robinsons Jewelers — Art Deco geometric + Egyptian motifs](https://robinsonsjewelers.com/blogs/news/why-did-art-deco-jewelry-embrace-geometric-shapes-and-egyptian-motifs-unpacking-the-1920s-boldest-obsession)
- [Wikipedia — Egyptian Revival decorative arts](https://en.wikipedia.org/wiki/Egyptian_Revival_decorative_arts)
- [Met Museum — Egyptian Revival essay](https://www.metmuseum.org/essays/egyptian-revival)
- [Kantor — *Plant Ornament in the Ancient Near East, Chapter IV: Rosettes*](https://isac.uchicago.edu/sites/default/files/uploads/shared/docs/HJKIV.pdf)

---

## Working log

- **2026-04-25** — file created. §0 project context + §1 pattern-example
  analysis (4 local images, all show 16-fold central rosettes on 8-fold
  grounds).
- **2026-04-25** — §2 high-order radial symmetry (rosette construction,
  historical 16-fold record, Lee's construction). §3 periodic Islamic
  beyond Archimedean (k-uniform hierarchy, Bonner's 5 systems + 4
  pattern families, star-and-cross / two-point). §4 Penrose / Ammann–
  Beenker / Stampfli–Socolar / Lu–Steinhardt synthesis. §5 (now §8)
  initial tier list. Sources section + working log added. File at v1.
- **2026-04-27** — Step 3 of TESSELLATION_REVAMP_PLAN implemented:
  `hexadecagonal-rosette` added to `src/tilings/index.ts` and to
  `SYMMETRY_GROUPS` as fold-16. Vertex config `[16, 4]`. Default contact
  angle 78.75° on the 16-gon (matches Bahia Palace patterns), 67.5° on
  4-gons. Tile types split between 16-gon centre + 4-gon (rhombus /
  square filler). Note: BFS keys polygons by `String(sides)`, so the
  4.1/4.2 split is not yet visually distinguished by the engine (both
  render under `"4"`); proper split deferred to Phase B.
- **2026-05-19** — major research expansion (§5 Hat/Spectre, §6
  mathematical families incl. full 2-uniform list / 11 Laves / 15
  pentagonal / Pythagorean / pinwheel / spirals / Truchet, §7
  non-Islamic decorative traditions incl. Egyptian / Art Deco / Chinese
  ice-ray / Celtic / Kumiko).
- **2026-05-19** — file consolidated: merged duplicate Synthesis sections
  into unified §8 with status-tagged Tier 1 entry for already-delivered
  16-fold rosette; merged duplicate Sources blocks into one section
  grouped by theme; merged duplicate Working log entries chronologically;
  Step 17 editor notes moved from middle of doc to §9. Suggested first
  three new Gallery additions called out: **rhombille, Cairo
  pentagonal, tetrakis square** (single-planigon BFS, one short PR
  combined).
- **2026-05-19** — Tier 1 Laves additions DELIVERED. **16-fold rosette
  fix** + 6 new Laves tilings shipped via the Taprats `rosette-patch`
  pathway (NOT the BFS pathway as the §8 "single-planigon BFS"
  description suggested — BFS only handles regular polygons, so each
  Laves entry needed a fresh Taprats-data block with translation
  vectors + per-tile affine transforms). New entries:
    * `hexadecagonal-rosette` — bug-fixed: was advertised as delivered
      2026-04-27 but had no Taprats data, returning empty polygon list.
      Now: 1 regular 16-gon + 1 non-convex 12-gon gap per square cell
      (t1=(2,0), t2=(0,2)). `tileTypes` updated from `'4'` to `'12'`.
    * `rhombille` — 60°/120° rhombi, 3 per cell rotated 0°/60°/120°
      around the "star vertex"; hex lattice with edge √3.
    * `cairo-pentagonal` — 120/120/90/120/90 pentagons, 4 per cell in
      a rotating cluster; rhombic translation lattice t1=(√3,√3),
      t2=(√3,-√3).
    * `tetrakis-square` — 45-45-90 right triangles, 4 per cell rotated
      around each square-dual vertex; t1=(1,1), t2=(1,-1).
    * `floret-pentagonal` — irregular pentagon with one 60° + four 120°
      vertices, 6 per cell rotated 60° around the 60° vertex; hex
      lattice spacing √21.
    * `deltoidal-trihexagonal` — 60-90-120-90 kites (same base shape
      the Hat aperiodic monotile uses), 6 per cell rotated 60° around
      each hex-centre.
    * `kisrhombille` — 30-60-90 right triangles, 12 per cell around
      each dodecagon-centre but ALTERNATING CHIRALITY (so encoded as
      2 separate Taprats tile blocks each with 6 rotation transforms);
      hex lattice with edge 3+√3.
  All seven entries verified with `vitest run` (12 new tests:
  produces-correct-polygons + has-shared-edges for each) and a clean
  `npm run build`. Engine constraint noted: `tapratsTiling.ts`
  `computeCanonicalEdgeLen` derives the user-edgelen mapping from the
  first edge of the first irregular polygon, so vertex order matters
  for getting a sensible user-facing scale.
- **2026-05-19** — read external research summary (`TIling Research
  notes from scibot.txt`, 8 papers on the mathematics of tiling for
  computer-generated patterns). Triage against current project state:

  **Genuinely useful**
    * **Medeiros e Sá, de Figueiredo, Soto Sánchez 2018 — "Synthesizing
      Periodic Tilings of Regular Polygons"** (SIBGRAPI; DOI
      10.1109/sibgrapi.2018.00009). Compact representation for *any*
      periodic tiling of regular polygons: a finite set of **basic
      directions** as roots of unity for **n ∈ {1, 2, 3, 4, 6, 8, 12}**,
      two translation vectors as integer linear combinations of those
      directions, plus a set of **seed vertices** inside the basic
      translation cell. All other vertices follow by integer
      translation; edges and faces are recovered by nearest-neighbour
      search inside a small adjacency window. Crucially the n-set
      matches *exactly* the directions our shipping Configurations use
      (4.8.8, 3.12.12, 4.6.12, 3.6.3.6, 3.4.6.4), so this is essentially
      the math behind `compositionCellBasis` generalised. Best home is
      **Step 15 (k-uniform tilings, parked)** — k-uniform tilings have
      multi-orbit vertex sets but the same translation-cell structure,
      so this representation collapses the data model uniformly across
      all of them and obviates per-tiling hand-coded basis lookups.
    * **Fisher & Mellor 2012 — "Using tiling theory to generate angle
      weaves with beads"** (J. Math. Arts; DOI
      10.1080/17513472.2012.736935). Introduces **star tilings**:
      construct a new tiling by placing a "star of triangles" at every
      vertex of a base regular tiling. The three regular cases are
      named — **David's Star** (from 3⁶), **Kepler's Star** (from 4⁴),
      **Archimedes' Star** (from 6³). Their Theorem 1 (vertex-only
      weave of a star tiling ≡ edge-and-cover weave of the base) is a
      PIC-style duality: stars on vertices ↔ figures on edges. Three
      concrete new Gallery Configurations sit here, plus a clean
      "place-star-at-vertex" generator that could later be applied to
      other base tilings (e.g. star on 3.6.3.6). Captured as an Idea
      memory — see `project_star_tilings_idea.md`.

  **Relevant only to parked work**
    * Chung, Chan, Wang 2004 (Chair / Sphinx; DOI
      10.1016/s0960-0779(03)00307-2) and Chung & Wang 2004 (Penrose;
      DOI 10.1142/s0218127404011314) — substitution / inflation rules
      with a **tree of tile-transformations** (the transformations don't
      form a group as in periodic cases). Right framing for the parked
      **Step 18 Girih substitution** engine. Also introduces "invariant
      mappings" (F such that F(αp)=F(p) for every tile transformation α)
      with explicit boundary-continuity theorems — applicable if/when
      Decoration grows colour fields.
    * Chung & Ma 2005 — "Automatic generation of aesthetic patterns on
      fractal tilings" (DOI 10.1016/j.chaos.2004.09.115). Self-similar
      f-tilings from kite/dart prototiles; formal classification (m,n)ₓ
      with exactly nine well-behaved single-prototile cases. Most
      relevant to the parked `project_editor_nested_layers_idea` — the
      recursive scaling factor s = short edge/long edge generalises the
      "layer N becomes layer N+1's boundary tile" mechanic.

  **Not useful in current scope**
    * Cohen et al. 2003 / Lagae & Dutré 2006 / Derouet-Jourdan et al.
      2019 — Wang tiles, corner tiles, on-the-fly stochastic wall
      patterns. These are *stochastic non-periodic texture-synthesis*
      tools; our pipeline is deterministic ordered PIC. Filed in case
      the future Decoration stage wants stamped/stochastic colour fills
      — Lagae & Dutré's corner-tile scheme (matching corner colours
      instead of edge colours; no "corner problem") is the cleanest
      published variant.
- **2026-05-31** — **Vertex-strand (vertex-anchored PIC) angle geometry +
  figures-map pollution.** Two findings from a "vertex strands misbehave"
  debug.
    * *Edge-collapse degeneracy.* Vertex rays leave each corner at
      ±(90°−θ) from the interior-angle bisector. They lie **exactly along
      the two incident edges** when 90°−θ equals the tile's interior
      half-angle — i.e. at **θ = 180/n** for a regular n-gon: 3-gon 60°,
      4-gon 45°, 6-gon 30°, 8-gon 22.5°, 12-gon 15°. At those angles the
      "vertex strands" flatten onto the tile outline and the per-polygon
      collinear-dedup drops half of them, so they read as patchy and as
      "drawn on the neighbour tile" (they trace shared edges). Nudging θ a
      few degrees off restores a proper vertex figure. Note the default
      Gallery 3-gon angle is 60° — i.e. snub-square/triangular configs
      ship *on* the degenerate angle for vertex strands.
    * *Meeting-point leaves the cell.* Outside a usable θ band the two
      vertex rays paired across an edge meet *outside* the polygon;
      `emitVertexArms` clips each arm to the boundary independently, so at
      shared vertices the arms from adjacent tile **types** (e.g. triangle
      vs square, different bisectors) diverge into a "double V". This is
      inherent to bisector-anchored vertex rays in mixed tilings and is
      **left as a known limitation** (user decision 2026-05-31 — not
      remedied). Contrast: edge contact rays have cross-edge mirror
      symmetry (Kaplan) and meet cleanly; vertex rays do not.
    * *Generalisable state lesson (fix 5e9ce0b).* Per-tile config keyed by
      `tileTypeId` (`config.figures`) must be **reconciled to the active
      tiling's tile types** on every tiling-switch and on load. The old
      `SET_TILING_TYPE` merged new defaults *over* the existing map without
      pruning, so figures accumulated every tile-type key ever visited and
      baked them into saved patterns (a `3.3.4.3.4` save carrying `5/6/
      4.1/4.2` figures with `vertexLinesEnabled`); shared ids like `"4"`
      also leaked settings across tilings. Now: switch resets to the new
      tiling's defaults, load prunes foreign keys (no-op for Builder
      configs). Any future per-tile-type state map needs the same
      tiling-scoped reconciliation. See memory
      `feedback_figures_map_pollution`.
- **2026-06-17** — three reusable findings from the Builder vertex-strand /
  multi-cell-slider work (commits `b44b7ce`, `33e9591`, `d99c725`):
    * *Vertex strands no longer gate on shared/internal edges.* The PIC
      vertex-line emission used to fire only on edges shared by two tiles
      (`buildInternalEdgeSet` + a `runPIC` `edgeContext` arg + an overlap
      point-in-polygon pass). That produced *partial* figures (strands on
      only the edges that happened to abut a neighbour) and made strands
      wink in/out as tiles slid in/out of contact. **Removed entirely
      (`d99c725`)** — vertex arms now emit on **every** edge of any figure
      with vertex lines on; a figure is self-contained per tile. This makes
      the θ = 180/n degeneracy bullet above the *only* remaining reason a
      shape's vertex strands look patchy (it's the collinear-dedup, not a
      shared-edge gate). Field-boundary tiles now emit outward stubs
      (off-screen in stamped fields; trim if ever in view). Overlap is a
      non-issue by construction: PIC iterates *real* tiles only, so an
      overlap region is never its own tile — each tile keeps its own
      strands and they just cross. The deleted `edgeContext`/`e42c12e`
      periodic workaround existed *only* to feed the old gate.
    * *Multi-cell tile size and lattice constant are ONE degree of freedom,
      not two.* In a periodic multi-cell Configuration `boundarySize` IS the
      lattice constant, and a valid flush tessellation fixes the tile size
      to it. So a "lattice edge" slider that scales tiles too is just a zoom
      (visually pointless); a slider that scales only the lattice is a
      **tile-to-lattice ratio** control whose off-flush values deliberately
      open gaps / force overlaps (shared-edge strands then only cross at the
      exact flush value). There is no third "useful independent scale" —
      pick zoom or ratio. (Builder slider is now the ratio control,
      `b44b7ce`.)
    * *Debugging recipe for Builder strand/PIC bugs.* Don't reason
      abstractly — **replay the actual saved JSON headless**: feed the
      loaded `config` through the `reducer` (to apply the exact action, e.g.
      a slider drag) → `compositionToPolygons(patch)` (multi-cell) → `runPIC`
      → count `vertex-line` / `star-arm` segments **per polygonId/shape**.
      This session it instantly distinguished a real bug from a desynced
      save (per-shape counts at flush vs off-flush) and caught a θ=30
      probe artifact (hexagon n=6 sits on the 180/n degenerate angle). One-
      shot `scripts/*.mts` run with `npx tsx`, deleted after.
- **2026-07-10** — **Star-tilings deep dive + pathway catalogue** (new
  §10 + §11; tier list updated in place with 6a–6d / 11a–11c / 20a).
  Read Fisher & Mellor 2012 in full (author preprint) — exact
  star-of-triangles construction, regular/semiregular stars, Theorems
  1–3 duality, and all named star tilings (David's / Kepler's /
  Archimedes' / Snow Star / Night Sky / triakis star / n-star). Key
  results: **David's Star ≡ shipped 3.6.3.6** (Figure preset only);
  **Kepler's Star fully parameterised** here (s = L/(1+tan b), gap
  octagon angles 2b and 270°−2b) with the derived finding that
  **b = 67.5° makes the gap octagon regular** — the natural Islamic
  variant, on the project's own classic contact angle; **Archimedes'
  Star = 3.6.3.6 with medially-subdivided triangles**, non-edge-to-edge
  (collinear-vertex encoding needed). Also read Kaplan 2005 in full:
  substrates 4.8² / 4.6.12 / (3.4.3.12; 3.12²) / Altair, two-point δ
  parameter, rosette transform + Najm-vs-Hankin distinction, primitive
  Hankin tilings (11+13-star), and his Fig.-14 limits — all anchored in
  §10.6. Grünbaum–Shephard star-polygon inventory (25 = 11 convex + 14
  hollow; 22 filled star-polygon uniform tilings, 4 α-parametric)
  catalogued in §10.4 with the convex-decomposition insight (star tile
  = interior n-gon + n triangles → PIC-safe encoding today,
  star-outline constructed figures under the rosette fold later).
  Identified 2 still-missing Laves duals (prismatic pentagonal, triakis
  triangular). §11 groups every open candidate by pathway: A Taprats
  block (no engine work) / B Figure-layer only / C BFS orbit extension
  / D rosette-pathway-gated / E new engines.
- **2026-07-17** — Morph engine probe findings (#37, `pic/morphProbe.test.ts`).
  Two artifact classes surfaced by sweeping spatial θ gradients turn out to be
  *inherited* uniform-θ behaviour, not morph regressions:
  (1) **Centroid-V mixed-regime kinks** — `emitStarArms`' convex outside-tip
  branch replaces the natural ray direction with midpoint→centre. Under a
  gradient, a contact point in a branch-transition band (e.g. θ crossing 45°
  on squares) can have one polygon emit a natural ray arm and its neighbour a
  centroid arm → a real C1 kink at that midpoint. Uniform θ has the same
  regime switch but flips the whole field at once (and square symmetry makes
  the centroid arms accidentally collinear), so it was never visible. The
  probe skips mixed-regime midpoints but bounds them to a minority of edges.
  Candidate refinement if it bothers users visually: blend the two regimes
  near the transition, or prefer Kaplan-trim clipping over centroid routing
  when the neighbour is in the natural regime (would change shipped looks).
  (2) **Vertex-ray leaks at α > interior half-angle** — decoupled vertex
  lines at θ < 45° on squares leak past the polygon at UNIFORM θ today
  (1800/3600 endpoints at θ=40°): the vertex ray points outside, the exit
  crossing is at the ray's own origin vertex and `clipSegmentToPolygon`'s
  t>ε guard rejects it, so the natural (far) endpoint survives. Pre-existing
  Gallery/Builder bug independent of the morph; the probe sweeps vertex
  gradients in the leak-free regime (θ ≥ 50°). Fix idea: clip vertex arms
  with a t≥−ε entry test against edges not incident to the origin vertex.
