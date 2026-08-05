# Headless verification scripts (2026-08-05)

Playwright scripts that drive the running dev server and assert against the
**rendered SVG DOM** — never `localStorage`, which the Lab writes on a debounce
(see `memory/feedback_headless_browser_no_sudo`).

## Running them

They need a Chromium that can actually launch in this sandbox. Full recipe is
in `memory/feedback_headless_browser_no_sudo.md`; the short form:

```bash
# 1. dev server on 5173 (strictPort — a busy port is a deliberate loud failure)
npm run dev

# 2. find a surviving scratchpad with the extracted libs + the playwright driver
find /tmp/claude-1000 -name 'libnspr4.so'
find /tmp/claude-1000 -maxdepth 5 -name 'playwright-core' -type d

# 3. run from a dir holding node_modules/playwright-core
LD_LIBRARY_PATH=<libdir>/usr/lib/x86_64-linux-gnu node verify3.mjs
```

## What each one covers

| Script | Covers | Status |
|---|---|---|
| `verify2.mjs` | SVG-export background rect on a real Composition field (550 `<use>` clones); saved-library name outranking the preset label | ✅ passes |
| `verify3.mjs` | Download naming across all three rungs; the Gallery name filter end to end (match, case-insensitivity, AND tokens, no-match empty state, Clear) | ✅ passes |
| `c34.mjs` | #34 Place-on-Anchor host-Cell resolution on 4.8.8 | ⚠️ **incomplete — see below** |
| `applyToAllTiles.mjs` | Strands "Apply to all Tiles": off ⇒ Tile types diverge, on ⇒ one drag moves every card | ✅ passes |
| `gradientStops.mjs` | `GRADIENT_MAX_STOPS` 8 → 16: panel caps at 16/16 **and** the rendered gradient def carries 16 `<stop>`s | ✅ passes |
| `lineDivisions.mjs` | Strand line divisions 1–10 + line/gap ratio: the rendered `#strand-style-mask` carries n−1 alternating bands at n = 2/4/7/10, and a higher ratio narrows the outermost cut | ✅ passes |
| `junctionOrnaments.mjs` | Junction ornaments: 1307 crossings marked on 4.8.8, the fast path off, All = one `<use>` per crossing, Single = exactly one, re-click clears, shape/hollow reach the `<defs>` geometry, the draft moves placed ornaments, divided strands withdraw them | ✅ passes |
| `gapFillsAndBorder.mjs` | Per-gap-ring fills (mixed rings render behind `#strand-gap-fill-mask` / `#frame-gap-fill-mask`) on both Strands and the Frame border; the border polygon offset outward by exactly w/2 | ✅ passes |

⚠️ Each gradient **surface** (This shape / Across frame / Strands) holds its own
draft. Switch surface first, then add stops — doing it the other way leaves the
count behind on the surface you left, which reads as the cap not applying.

⚠️ The sidebar is taller than the viewport — `scrollIntoViewIfNeeded()` before
any synthetic drag. A slider below the fold swallows every mouse event in
silence, and the run still reads "no change" like a real failure.

⚠️ Identically-labelled rows exist on **both** substrates in the Decoration
phase (the border block and the Display section's Strand controls both carry
"Fill between lines", "Individual", "Line divisions"). Anchor to one — the
border's rows come first in the DOM — and prefer `title=` selectors for the
ring buttons: `button:has-text("Clear")` also matches the panel's *disabled*
"Clear paint", which fails as a 30 s click timeout rather than a wrong value.

⚠️ A click at fraction 0 or 1 of a range track lands on the **thumb's own half
width** and stops short of the end, so both extremes are unreachable by click
alone — and the readout just sits at the previous value, which reads exactly
like the control being capped. `lineDivisions.mjs` clicks roughly, then
arrow-keys to the exact value.

## `c34.mjs` — what it establishes and what it does not

**Establishes.** With the square Cell's Symmetry set to **Full** and a Guide
line drawn across it, the Guide's own symmetry orbit renders as 4 linked
members hugging the square Cell; and a triangle placed on an Anchor inside that
Cell lands at world `(170.7, 149.6)` — 57 units from the square Cell centre
`(120.71, 120.71)`, i.e. inside it. **The old bug's signature is absent**: no
image anywhere near the `(±198, ±198)` fling across and past the octagon.

**Does not establish.** The **8-image orbit**. The run commits exactly one
Tile, which is the documented behaviour for a **non-stamping** Anchor
(world-space `patch.guideTiles`, single, never repeated) — so the orbit branch
may simply not have been entered. The script does toggle "Stamp with Lattice"
on the selected Guide and confirms it reads `true` afterwards, but the Anchor
it then clicks is the **Cell-centre crossing**, whose stamp flag is the AND of
both crossing Guides, and whether both members of the linked group actually
flipped was not confirmed.

Next session: pick an Anchor that is *not* the Cell centre (the centre is also
D4's fixed point, and it collides with the seed Tile so every size is badged
⚠), confirm the Anchor's own stamp state before placing, then assert 8 images.
