# Generator: a third top-level mode for random pattern generation and taste-dataset collection

The app exposes a rich, fully-parameterised pattern space (`PatternConfig`) but gives no guidance on what looks good — taste is entirely manual browsing. We decided (2026-07-13, 9-question grill) to add **Generator**, a **third top-level mode alongside Gallery and Lab**, that samples random finished patterns, lets the user rate each with one keypress, and persists the `(config → score)` records durably. The corpus is the raw material for a later personal taste model ("suggest" mode); the ML arc itself is **hard out of scope for v1** and opens as a separate ticket only once a few hundred rated samples exist.

Key shape of the decision:

- **Preset substrate, random look.** The v1 sampler picks one of the shipped Gallery tilings (always-valid substrates) and randomises only the *look*: θ per tile type, line length, edge/vertex line toggles (≥1 on), occasional vertex decoupling, curves + `smoothTransitions`, `strand.width`/`lineStyle`/`weave`, and `tiling.scale`. Random Patch authoring is a v2 sampler under the same `generatorVersion` scheme.
- **Confound dimensions frozen in v1.** Colour (one fixed neutral strand/background pair) and Frame (none) are excluded so ratings measure geometry taste cleanly. Each later gets its own **presentation loop**: re-roll palettes/frames on a *fixed* geometry and rate them independently, factorising the dataset into geometry-taste and presentation-taste tables. `figureRouting` stays `'auto'` (a degeneracy workaround, not taste).
- **Single overall score.** 1–5 by one keypress, space = skip, F = flag broken; instant auto-advance for throughput. Schema carries `scoreSchemaVersion: 1` from day one so dimensions can be added later without corrupting existing records.
- **Records store the full config.** `{ seed, generatorVersion, scoreSchemaVersion, config: PatternConfig, score, flagged, timestamp }` in IndexedDB, with a JSONL "Export dataset" download. Seed-only records were rejected: any sampler change silently breaks seed→config reproducibility, and the ML step consumes configs anyway. Seed survives as provenance/debug.
- **Keep what you roll.** The current sample offers **Save to library** (writes to `pattern-library-v1`, appears in the Gallery like any save) and **Open in Lab** (same hand-off path as the Presets shelf). Generator is a discovery tool from day one; ratings are the exhaust.

## Amendment (2026-07-13): score widened from a 1–5 keypress to a 0–10 slider

Scoring is now a **drag-to-release slider** over 0–10 (integer steps), not five keypress buttons. Dragging the slider updates a live readout; releasing the pointer (or an arrow/Home/End/PageUp/PageDown keyup once it has keyboard focus) commits that value as the score and auto-advances — the same instant-throughput property the keypress design had, just mouse-first. `Space` (skip, no record) and `F` (flag broken) are unchanged. `scoreSchemaVersion` bumps to **2** so pre-amendment 1–5 records stay distinguishable from 0–10 records in the exported dataset.

## Considered Options

- **Lab-hosted tool** (rejected — was the recommendation): fits CONTEXT.md's "Lab hosts more exploratory tools" framing and avoids a third `AppMode`. The user chose a top-level mode named **Generator** — rating/discovery is a distinct activity, not authoring.
- **Multi-dimension score schema** (rejected): ~5 fuzzy dimensions (balance, harmony, density…) cost 5× rating effort and produce noisy labels; a small corpus needs volume and one clean label more than factored labels.
- **Seed-only records** (rejected): tiny, but reproducibility silently corrupts on any sampler refactor unless every historical sampler version stays runnable.
- **Uniform-random colours** (rejected): mostly low-contrast mud; colour signal would drown the geometry signal. Curated palettes deferred to the palette presentation loop.
- **Random Builder-Patch authoring in v1** (rejected): ~5× engineering cost (overlap/validity machinery) and floods the dataset with broken samples.

## Consequences

- A third `AppMode` value joins `'main'`/Lab; the top bar becomes a three-way toggle and the `app-mode` localStorage key gains a value.
- First IndexedDB *dataset* store (thumbnails already use IndexedDB); a thin wrapper module owns it.
- The sampler is a pure module (`src/generator/`) reusing the existing pipeline: random `PatternConfig` → `usePattern` → SVG. No new render path.
- All tunable ranges/weights live in one constants block stamped `generatorVersion: 1`; any change to sampling behaviour bumps the version.
- CONTEXT.md gains a **Generator** glossary entry.
- Future arcs recorded, not scheduled: palette loop, frame loop, v2 Patch sampler, ML taste model + suggest mode.
