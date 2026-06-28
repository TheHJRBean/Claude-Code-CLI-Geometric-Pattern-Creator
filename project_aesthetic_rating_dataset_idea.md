---
name: aesthetic-rating-ml-dataset
description: "Randomly generate finished patterns, click through them rating each on aesthetic dimensions, and persist the (config → scores) data to eventually train an ML model that proposes pleasing patterns"
metadata: 
  node_type: memory
  type: project
  originSessionId: f6e11715-fe8d-4594-8336-4284ba3c489f
---

**Status: RAW**

A "rate the pattern" workflow that turns the generator into a data-collection
tool for taste:

1. **Random generator** — an algorithm samples the `PatternConfig` parameter
   space to produce a *finished* pattern: pick a tiling/**Configuration** (or
   Builder **Patch**), contact angle θ per tile type, **Figure recipe**
   options (edge/vertex Rays, curves + control points, `figureRouting`),
   **Strand** style, scale, and (once shipped) a **Frame**. Constrain ranges
   so samples are plausible, not garbage.
2. **Rating UI** — show one generated pattern at a time; the user scores it on
   several **aesthetic dimensions** (e.g. balance / symmetry, line harmony,
   density, contrast, "would frame it" overall) via sliders or 1–5 stars, then
   advances to the next. Keyboard-driven for fast throughput. Skip/flag button
   for broken generations.
3. **Persistence** — store each `{ config, scores, timestamp, generatorVersion }`
   record durably so a corpus accumulates across sessions. Local first
   (IndexedDB / downloadable JSONL), with an export so the dataset can move to
   a training environment later.
4. **Eventual ML** — once enough labelled samples exist, train a model that
   predicts aesthetic score from config (a learned taste function), then use it
   to *propose* high-scoring configs — surfaced as a new generation mode or a
   "suggest" button.

**Why:** The app already exposes a rich, fully-parameterised pattern space but
gives no guidance on what looks good — taste is entirely manual. Capturing the
user's own aesthetic judgements as structured data makes "pleasing" learnable,
and turns hours of browsing into a reusable asset (a personal taste model) that
can drive generation, gallery curation, and the future Decoration/Framing
defaults.

**How to apply:**
- New top-level tool (alongside Gallery / Lab — a "Rate" / "Studio" mode) OR a
  Builder side-flow. Lives outside the Phase pipeline since it operates on
  whole finished patterns.
- Reuse the existing pipeline: random `PatternConfig` → `usePattern` →
  `PatternSVG`. No new render path — just a sampler + a results store.
- Sampler module (`src/studio/randomPattern.ts`?): seeded RNG (record the seed
  so any sample is reproducible from `{ seed, generatorVersion }` alone —
  keeps stored records tiny and lets the dataset survive schema drift).
- Define the score schema up front (the aesthetic dimensions) — changing it
  later fragments the dataset; version it.
- Storage: IndexedDB via a thin wrapper; "Export dataset" → JSONL download.
- Decouple from the ML step — v1 is generate + rate + store; ML is a separate
  arc once the corpus is large enough. Relates to
  [[pattern-morph-start-end-angle-interpolation]] (both are config-space
  exploration tools) and the Gallery (could promote top-rated samples).
