# Tessellation Lab archive

Code retired in the 2026-05-03 cleanup when the Lab pivoted to focus on
user-editable tessellations. None of these modules are imported by the
live `src/` tree — the archive is kept only because individual helpers
may be useful when building the editor.

## What's here

### `tilings/mandala.ts`
- `generateMandala(MandalaConfig, scale): Polygon[]` — concentric regular
  polygon ring generator, all centred at world origin, with optional
  per-layer rotation snap (`rotationStep` in units of π / fold so vertices
  always align to the outer ring's vertices or its edge midpoints).
- `isLayerFoldValid` / `allowedInnerFolds` — strict-divisor validation
  for layered fold orders. Useful for any future "shared centre, related
  symmetries" feature.
- `defaultContactAngleForFold` — sensible PIC contact angle defaults per
  fold order (60° / 67.5° / 72° / 75° / 78.75° for 6 / 8 / 10 / 12 / 16).

### `tilings/mandalaStrand.ts`
- `runMandalaPIC(polygons, mandala, baseConfig)` — wraps `runPIC` with a
  per-polygon synthetic figures map so each layer uses its own contact
  angle independent of the global figures map. **Reusable pattern** for
  any future per-tile-instance strand control in the editor.

### `tilings/composition.ts`
- `generateComposition(CompositionConfig, viewport)` — builds two
  tessellations (centre + background), a regular-polygon clip region,
  and an optional unified polygon set when both sides share a tessellation.
- `compositionPickerNames()` — filter for compositable tessellation
  candidates.

### `tilings/compositionStrand.ts`
- `runCompositionPIC(...)` — dispatch skeleton for boundary modes
  (`'match'` / `'frame'`), with a trivial-match path that runs PIC once
  over a unified polygon set so strands span the seam continuously.

### `tilings/compositionVerifiedPairs.ts`
- `VERIFIED_COMPOSITION_PAIRS` allow-list, `isPairVerified`,
  `verifiedBackgroundsFor`, `isTrivialMatchPair` helpers. The
  trivial-match shape (centre === background) is the only path verified.

### `state/labPresets.ts`
- 8 archimedean / rosette-patch presets, 4 mandala presets, 5 composition
  presets (including the `Hex-in-Hex (match)` strand-match demo).

## Useful for the editor (Step 17)

Things worth lifting back out:

- **Per-polygon synthetic figures map** in `mandalaStrand.ts`. Same
  mechanism lets the editor give each user-placed polygon its own
  contact angle without touching the global `figures` keying scheme.
- **Regular polygon vertex generator** at the top of `mandala.ts`
  (`regularPolygonVertices(n, radius, phi)`). Editor will need this for
  the "drop a regular n-gon" tool.
- **Strict-divisor / common-divisor fold validation** in `mandala.ts` —
  if the editor adds rotational symmetry constraints.
- **Even-odd `clipPath` "viewport minus polygon" pattern** in
  `PatternSVG.tsx` (commit history) — useful for any future "mask out
  region X" rendering.

## Linked plan history

`TESSELLATION_REVAMP_PLAN.md` Steps 5, 6, 7, 8, 12, 13 documented the
design rationale; those steps are marked **ARCHIVED** rather than
deleted so the trail survives.
