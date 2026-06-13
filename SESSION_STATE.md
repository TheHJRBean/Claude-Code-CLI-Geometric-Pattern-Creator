# SESSION_STATE.md

> **Vocabulary note (2026-05-16):** the canonical glossary is `CONTEXT.md`. This file predates the vocabulary alignment and uses legacy terms (`Tessellation Lab` → **Builder**, `main mode` → **Gallery**, `BoundaryTile` → **Cell**, `strand editor` / `Strand mode` → **Composition** Phase, `Design mode` → **Design** Phase, `origin tile` → **Seed Tile**, `line` → **Ray**). When updating this file, prefer the new terms. See `CONTEXT.md` and `docs/adr/0001`–`0003` for the locked decisions.

## ▶ RESUME HERE

**🧹 2026-06-13 — thermo-nuclear whole-codebase review IN PROGRESS.** Driven by `THERMONUCLEAR_REVIEW_PLAN.md`; live ledger + metrics in `THERMONUCLEAR_REVIEW_FINDINGS.md`. **Wave A done** (green baseline pinned). **Everything below is MERGED to `main` + pushed** (head `3dac419`); working tree clean, no open review branches; **382 tests / tsc / build all green**.

> **Metrics snapshot (2026-06-13):** tests **315 → 429** (+114 across chunks 2/3/4/5/6/7). Largest-file table (vs Tier-0 baseline): TessellationLabMode 2243→812, Canvas 974→922, Sidebar 907→890, reducer 877 (unchanged), usePattern 902 (unchanged), tapratsTiling 796→800, pic/index 667→664. Bundle JS 418.87 kB (gzip 127.23). No file >1000. FPS not re-measured this session (no perf-touching change).
>
> **Theme that emerged (chunks 4/5/3):** the remaining "giant" files from the baseline table are all already **under** the 1k bar, and their headline restructures (usePattern flag-soup, reducer handler-map) turn out to be lateral motion the thermo-nuclear bar discourages — so for those the honest deliverable is the **missing test safety net**, not a refactor. Sidebar (Chunk 3) was the exception where a real dedup (`<Section>`) fit. Expect this pattern to continue.
- **Chunk 1 MERGED** (`6eb6721`, user-verified): `TessellationLabMode.tsx` 2243→812 ln; god-component split into `src/components/lab/` (labShared + EditorDesignControls orchestrator + Composition/Decoration/Frame/Design panels; no file >1000). S3/S4 nit also done (`e4351c2`): `segmentedButtonStyle` helper in labShared.
- **Chunk 2 MERGED** (`cbe74f3`): Canvas 974→922 — Std-6 routed overlay transforms through canonical `applyCellTransform` (deleted Canvas dup, +7 pin tests), Std-8 extracted `worldToScreen`→`rendering/screenSpace.ts` (+6 tests). Picker-hook extraction DEFERRED (Canvas under 1k, fragile).
- **Chunk 4 MERGED** (`219d44f`): `usePattern` under 1k but most perf-fragile (load-bearing memo deps + eslint-disables). Restructure DEFERRED with rationale. Banked Std-8 net: exported pure helpers `stampSegments` + `periodicFastPathEligible`, pinned with 14 tests (328→342). No production logic change.
- **Chunk 5 MERGED** (`7bf724f`): `reducer.ts` (877) under 1k. Mega-switch→handler-map REJECTED (idiomatic type-safe switch). Banked Std-8 gap: 25 tests (`figureMutations.test.ts`, 342→367) pinning line mutual-exclusion + figure/curve helpers + immutability + editor guards + multi-cell boundary-scale invariant. Zero production change.
- **Chunk 3 MERGED** (`3dac419`): `Sidebar.tsx` (907) under 1k. First chunk this session that **changed production code**, so a Wave-D browser-verify is owed. TWO moves: (1) Std-2/6 — extracted a `<Section>` wrapper deduping the section chrome repeated 8× (907→890; **My Patterns left raw on purpose** — its trailing spacer renders outside the collapse gate, which `Section` can't express without a behaviour change; commented in-code); (2) Std-8 — extracted the frame units↔px clamp to pure `frameUnitModel`/`frameUnitsToPx` in `editor/frame.ts` + **15 tests** (367→382) incl. a parametric round-trip-stability guard for the documented slider-freeze bug. Behaviour-preserving (`<Section>` = verbatim chrome relocation, byte-equal DOM/styles; frame math pinned by the round-trip test).

- **Chunk 6 MERGED** (`7492630`): `tilings/tapratsTiling.ts` (796, ~540 of which is the `TAPRATS_DATA` literal) under 1k → Std-0/4/8 audit, not a restructure. TWO behaviour-preserving production fixes: (1) Std-0 — deleted dead code in `intersectsViewport` (the per-vertex pre-check is provably subsumed by the AABB-overlap test); (2) Std-5/8 — added a `edgeLen > 0` fail-closed guard (a 0/NaN scale zeroed the lattice vectors → `ceil(diag/0)=Infinity` → infinite hang; reachable via crafted/legacy LOAD_CONFIG). Plus the missing adversarial layer: **+23 tests** (382→405) — data-integrity sweep across all 12 tilings (`sides===vertices.length`, finite coords — catches hand-entered data typos), determinism, MAX_POLYGONS cap, degenerate viewport, straddle-inclusion, `getTapratsTileTypes`. Deferred: splitting `TAPRATS_DATA` to its own module (pure relocation, no concept reduction). File 796→800 (comments+guard). tsc + 405 vitest + build green.

- **Chunk 7 MERGED** (`8af6b74`): `pic/index.ts` (667→664) — the minefield. Discipline held: **characterization-net FIRST, then only the one provably-safe change, reframe DEFERRED.** (1) Std-0/4 — deleted dead `convex`/`_convex` (computed + threaded into `pairAtVertex`/`pairVertexAtEdge` which both ignore it; `emitStarArms` recomputes its own). (2) Std-8 — `runPIC.characterization.test.ts`: a **golden fingerprint** (count + Σlen + per-kind) across a 12-case tiling/θ matrix + adversarial (empty/no-figure/zero-area/θ-extremes/determinism/triangle-dedup), 18 tests; the dead-code removal is proven **byte-identical** by it. (3) Std-8 — `snapPoints.test.ts` (6 tests, `snapToNearest`). 405→429. **DEFERRED with rationale:** the branch-ladder→policy-table reframe + the Std-6 triplicated-probe/copy-pasted-emission dedup — gated on the preserve-vs-fix product decision (memories say borderline cases still emit wrongly) + the planned bespoke-rosette architectural fold (`project_star_tilings_gallery_idea`). The golden net now makes that reframe safe when undertaken. Overlap-strand bug AUDITED → not a runPIC defect (per-polygon emission is correct; needs Builder-layer dedup + a user repro), memory stays OPEN.

- **▶ NEXT — Chunk 8 (`editor/` placement family).** `vertexPlacement` 487, `orbit` 342, `compositionLattice` 304, `complete`/`completeN`, `placement`, `boundaryInward` 251 + the shared `tileOverlap` probe. Std-6 focus: are these genuinely distinct or is there a canonical "place a regular n-gon on X" primitive hiding under three names? 5 dir tests exist — extend, don't trust. Lower-risk than `pic` but lots of overlapping helpers. Cold-start: branch `review/editor-placement`, per-chunk checklist in `THERMONUCLEAR_REVIEW_PLAN.md` §4. Then Chunk 9 (`decoration/`); then Tier-3 test-free zones (10 rendering / 11 components / 12 types) + Tier-4 dup sweep (13).
  - **DEFERRED PIC reframe** (own dedicated session, high-value): reframe `emitStarArms`/`pairAtVertex` as a named-case policy table + extract `pushSegment`/centroid-V helpers, behind the golden fingerprint. Pair with the preserve-vs-fix decision on the borderline irregular-polygon emissions — this is where the Wave-E headline "latent PIC bugs fixed" is actually earned. See ledger Chunk-7 deferred rows.

- **⏳ OWED — Wave-D browser-verify (Chunk 3, do at next convenient checkpoint):** open the Gallery Sidebar → collapse/expand every section (Tiling, Frame, Figures, Curves, Figure Routing, Strand Thickness, Display, My Patterns, Export) → toggle each control → drag the **Frame size slider to its max and min** (must not freeze/snap-back). If anything looks off, it's the `<Section>` extraction or the frame-units helper — both in `3dac419`.
- **Bugs:** the "missing inside/outside option" + "missing orientation popup" reports were **NOT bugs** — they're the orientation page of the single-cell-only vertex picker, absent on multi-cell Configurations by design (user confirmed "planned feature"). Both transient bug memos deleted; folded into `project_multicell_vertex_placement_idea` (⚠ if the orientation popup is ever missing on a *single-cell* Patch, that's a real bug). **Still genuinely OPEN:** force-overlap tiles emit overlap-region strands → `project_overlap_tiles_strand_bug.md` (fold into Chunk 7 / `pic`).

**🐛 2026-06-12 — fix: Complete-mode vertex dots wrong/missing (live Patch + every neighbour ghost) + far neighbour picks rejected.** User: "the vertices exposed on neighbours is inconsistent" (symptoms confirmed: wrong vertex set per ghost + dots missing). Root cause in `boundary.ts`: `computeExposedEdges` only cancels *exact full-edge* matches, so an edge abutting several shorter neighbour edges (multi-vertex Complete creates these routinely — the picked polygon's side runs along ≥2 existing tile edges) stays "exposed" on BOTH sides; `computeAllCycles`' chain walk then hits the T-junction and either cuts the "outer" cycle through the patch interior (covered run demoted to a phantom pocket — repro: 2 squares + a 2×1 tile spanning both) or discards unclosed fragments wholesale ⇒ dots vanish/misplace, replicated identically on every neighbour ghost (Canvas reuses the same cycles per stamp). Outer-vs-pocket pick was even input-order dependent (equal-area tie). Fix: new `subdivideAndCancel` pre-pass in `computeAllCycles` — split each exposed edge at any other exposed edge's endpoint strictly inside it, cancel opposite-direction coincident sub-edges (two interiors meet ⇒ not perimeter), dedupe same-direction copies, then chain as before. All consumers (Canvas dots, `patchSelectable` validation, `completeGap`, orbit, autoComplete, nonTilingDetection) flow through `computeAllCycles`/`computeOuterBoundary` so they stay mutually consistent; cycle consumers match by position, not tileId/vertexIndex, so sub-edge inherited tags are safe. Clean edge-to-edge patches unaffected (repro: 2-square strip + 3×3 ring with hole — identical cycles). **Second bug, same area:** `patchSelectable.ts::neighbourStampsNear` generated validating stamps from a pick-local box with only the lattice generator's ~1-cell margin, but a sprawling Patch's vertices sit many cells from their copy's stamp origin ⇒ clicking a dot on the far side of a neighbour ghost rejected with "A pick is off the selectable set". Box now inflated by the Patch's selectable-vertex radius (max |world vertex| over all cells), guaranteeing every stamp whose copy can reach the pick is generated. tsc green (repro scripts deleted after verifying). ⏳ browser-verify on the user's patch: dots should sit on every ghost corner consistently and far-ghost picks should commit. **Follow-up (same session): multi-pick "failed silently" (`next commit`).** User: 4-pick completion (seed vertex + 2 boundary corners + neighbour-ghost seed vertex) failed with no feedback. Headless repro on the DEFAULT square patch shows that exact pick set is a *legitimate soft rejection* — the quad encloses the diamond seed's adjacent vertex (`overlaps-existing: tile-vertex-inside-polygon`) — and the preview pill + Accept-and-continue button DO show it. The silence was UX: (1) Enter dispatched regardless of validity and `resetPicks()` wiped the polygon AND the rejection pill, so an invalid commit attempt read as "nothing happened"; (2) the plain-click chord path (no Ctrl) dispatches after the 2nd click with no preview machinery at all and wiped its pick on failure. Fix in `TessellationLabMode`: Enter on an invalid polygon now no-ops (keeps picks + pill + Accept button on screen); the valid path commits and resets as before; chord dispatch no longer clears eagerly — success clears via the existing `config.editor`-change effect, failure leaves the first pick selected. tsc + 315 vitest green. **❌ 2026-06-12 user verdict: "didn't work in this scenario" — the 4-pick completion still fails for them after `9b3f11c`; session ended before details were gathered. OPEN — next session, start here:** (1) get specifics — does the red pill now persist on Enter? does Accept-and-continue appear/do anything? is the user Ctrl-clicking all 4 picks (multiMode) or plain-clicking (chord path)? (2) ask for the saved JSON of their patch — the headless repro used the DEFAULT square patch and may not match their geometry (their cell is asymmetric; frame present; check whether a pick coincides with a frame node → frame-scoped completion is INVISIBLE in Design phase, only renders in Composition — strong candidate, fix would be rendering `frame.completedTiles` in the Design branch of `usePattern`); (3) remaining known preview/reducer divergences that no-op silently even with a green pill: symmetry-orbit image failures (`reducer.ts` multiPickCompleteAcrossPatch lines ~799-811 return state on orbit-image completeNGap-null/overlap; preview never simulates the orbit) and the frame-node routing branch (preview validates the non-frame path).

**🎨 2026-06-12 — feat: Frame border stroke, frame dots hidden in Decoration, Strand line styles (`060ed73` + next).** Three user asks. (1) **Frame as a stroke**: `FrameConfig.stroke` `{enabled, colour, width}` — the border-styling slot ADR-0004 deferred to Decoration. When enabled it replaces the accent guide outline with a real border (world-unit width, scales with zoom, exports as drawn); Decoration panel gains a "Frame border stroke" toggle + width slider (0.5–30) + "Set border to paint colour" button (dispatches SET_FRAME with the full frame object). Round-tripped in `migrateFrame` (editor) + `readGalleryFrame` (gallery). (2) **Frame node dots hidden in Decoration** — Canvas passes `frameNodes={decorationActive ? null : frameNodes}` (they're Complete-mode pick targets, noise over the artwork). (3) **Strand line styles**: `StrandStyle.lineStyle` = solid | double | triple | dashed | dotted (validated in `readStrandStyle`). StrandLayer: dashed/dotted are width-scaled dasharrays (dashed = butt caps, dotted = `0.01 ${w*1.8}` round caps); double/triple cut the stroke centre out with a userSpaceOnUse `<mask>` (white bbox rect over the curved-geometry bounds + black cut paths at 0.5w / 0.65w) so Void fills show through between the parallel lines — an overdraw in background colour would paint over fills (same trap as the hidden-strand fix); triple adds an unmasked 0.18w centre line. Hidden (`'none'`) strands are excluded from the mask cuts too (else they'd carve through visible crossing strands). Ghost paths stay solid (Design-only preview). UI: "Strand style" select in Gallery Sidebar (Strand Thickness) + Lab Display (under Show strands). Headless renders verified double/triple/dashed/dotted over painted fills (`scripts/repro-strand-styles.mts`). ⚠ fast-path note: the mask lives inside the cloned fragment; userSpaceOnUse coords resolve in the use-translated space so cuts should tile with the clones — confirm on a Composition fast-path field. tsc + 312 vitest + build green. ⏳ browser-verify all three.

**🎨 2026-06-12 — fix: removing strand paint no longer leaves a "gap" band between painted Voids.** User: "when strand paint is removed there is a gap between the voids. The voids should be filled to touch and the strands should overlay if painted." Diagnosis: Void fill polygons are faces of the segment arrangement and DO touch exactly at the strand centrelines (proven with a headless render — `scripts/repro-void-gap.mts`, new `@resvg/resvg-js` devDep, writes `/tmp/voidgap-*.png`); the "gap" was the strand stroke itself: both removal paths (panel "Remove strand colour" + the same-colour toggle) dispatched `colour: null`, deleting the record and reverting strands to the global `strand.color` — a strand-width band drawn OVER the touching fills. Fix: removal now stores the **`'none'` sentinel** as an ordinary `ColourRecord` colour — StrandLayer skips emitting those paths entirely (clean SVG export), so fills meet seamlessly; finer-scope painted strands still resolve through the ladder and overlay. Panel: "Remove strand colour" (now shown even with no record, so the default line work can be hidden to see the pure mosaic) → `'*'`=`'none'`; new "Restore strands" button (visible while hidden) → `colour: null` (back to global). Per-strand same-colour unpaint now falls back to `'*'`=`'none'` ⇒ vanishes, consistent with "unpainted strands don't draw". `'none'` flows through buildColourIndex/resolveColour/migrations untouched (opaque string, non-empty). tsc + build green. ⏳ browser-verify: paint voids + strands, "Remove strand colour" → strands gone, voids touch; repaint a strand group → overlays. **Follow-up (same session): fast-path fragment layer order aligned** — both `<defs>` fragments in PatternSVG drew Void fills UNDER the TileLayer (opposite of the non-fast-path), so "Show tiling" in Decoration would cover the fills with tile fills/outlines on the fast path. Both fragments now Tile → fills → Strands, matching the non-fast-path. tsc + 312 vitest + build green.

**🐛 2026-06-12 — fix: frame completion tile types missing from the Composition panel (`9459970`) + OPEN design gap: paints don't survive geometry edits.** User painted everything, went to Composition, "added curves to all the gons", re-entered Decoration → slow load (one-time curved-field extraction — expected), colours gone EXCEPT on gons that stayed uncurved. Two findings. (1) FIXED: the uncurved stragglers were **frame completion tiles** — `seedFiguresForEditor` seeds their Figure recipes, but `editorTileTypes` (the Composition panel list) only walked `patch.cells`, so completion types not shared with a lattice tile were stuck at the default figure with NO way to curve them. Panel now walks `frame.completedTiles` too. tsc + 310 vitest green. (2) OPEN — colour loss is structural: ALL Decoration keys derive from the Void's outline signature; toggling curves reshapes every affected Void ⇒ new signatures ⇒ records orphaned (they linger in `decoration.voidFills` pointing at dead keys). USER PICKED (b) → **DELIVERED `852f75c`: curve-insensitive Void identity.** `extractDecorationVoids` (usePattern, both paths) always extracts the STRAIGHT field; with curves on also extracts the flattened field and `pairCurvedOutlines` (voids.ts) matches by nearest centroid (0.5·√area threshold, 0.3–3 area-ratio gate, deterministic greedy 1:1): signature + `keyPolygon` (new optional VoidRegion field) = straight, `polygon` = curved render outline. `keyVoids` + fast-path rep keying derive all keys from `keyPolygon`. Degradation: unmatched straight Voids render straight; unmatched curved keep curved identity. Strand colours already worked this way (identity never flattened) — now consistent. ONE-TIME break: records keyed on curved signatures don't resolve (already orphaned by the curve edit; repaint once). +2 regressions (paired identity, key stability across recipes), **312 vitest** + tsc + build green. ✅ user-verified ("repainted and changed curves, colours held"). Matching reach: user says "works a bit better now" after `a5c737c` — partial improvement, keep watching. Note: one flaky vitest failure observed once (timing probe, not reproducible, suite green ×3).

**🐛 2026-06-12 — fix: Matching's residual "odd one unpainted" — collinear-threshold coin-flip (`a5c737c`).** User (after f8eba74): "Matching still leaves the odd one unpainted." Found a structural blindspot: the field-wide canonicalisation requires equal ring lengths, but `simplifyCollinear`'s 1.5° threshold makes the vertex COUNT itself coin-flip — a T-junction / flattened-curve-chord vertex at ~1.5° turn is kept in one sibling, dropped in another, and the tolerance congruence never even compares them. Fix: `canonicaliseSignatures` builds its comparison ring from a coarser (3°) simplification so threshold-hovering vertices drop consistently at compare time; signature-level outlines untouched; classes differing only by a sub-3° kink merge deliberately. Regression: 1.6°-vs-1.4°-kinked squares (5- vs 4-vertex outlines) share one signature (test pins the 19.1 disconnected-component hole duplication too). tsc + **310 vitest** + build green. ⏳ browser-verify on the authored patch; if a straggler STILL survives, get its location (frame edge?) + whether curves are on, and request the saved JSON for a real-field probe. Also shipped today: eye-dropper in ColourPicker (`cf555a0`, native EyeDropper API, Chromium-only, ⏳ verify).

**⚡ 2026-06-12 — perf: frame-keyed field + field-keyed extraction (`1936576`).** User (✅ confirmed strand painting + colour picker working after `175b94f`/`2fedc2f`): "switching between painting modes, zooming and panning are still very laggy. FYI I am using a frame." Two non-fast-path causes. (1) With a frame everything rendered is clipped to the world-fixed Frame outline, yet `stampedField` was viewport-keyed — every 12% pan step / zoom bucket re-ran PIC ×2 + extraction + strand identities + (fresh `segments`) buildStrands/weave for zero visual change. New `frameFieldBox` memo: when a frame is filtering, the field generates over the **frame bbox + 3-unit margin** (world-fixed) instead of the viewport ⇒ pan/zoom reuses the whole chain (Composition with a frame benefits too). Trade: whole frame field built once even when viewing a corner. (2) Extraction + strand-hit data lived inline in the main memo (keyed on whole `config` + paint target) ⇒ every Paint-target switch and every paint re-extracted. Split into field-keyed `nonFastVoidData` / `nonFastStrandHits` memos (non-fast-path twins of `decorationReps` / `baseStrandIds`); `decorateVoids` split into `keyVoids` (expensive, field-keyed) + `colourVoids` (cheap, per-paint) in `resolve.ts`; frameless extraction bound keys on the quantised visible rect via `nonFastBoundSig` string. tsc + 309 vitest + build green. ✅ user-verified on the framed patch ("much better"). Frame REPOSITION still rebuilds per drag tick (pre-existing); revisit if reported.

**⚡ 2026-06-12 — perf: zoom crawl fixed by bucketing the generation zoom (`2fedc2f`).** User (right after the `175b94f` strand-hits fix unblocked the Strands target): "zooming causes massive lag, fps is 2, worst ms is 17." Short frames + 2fps = the deferred render time-slicing a continuous rebuild: pan is quantised (12% steps) but zoom never was — `vw/vh = container/zoom` changed per tick → `genX/genY/genW/genH` re-keyed `stampedField` + the main memo every tick → full-field PIC, void extraction, strand identities, and (fresh `segments` identity) buildStrands + weave in StrandLayer, per tick. Fix: `vw/vh` in `usePattern` now derive from a **√2-bucketed zoom** (bucket lower bound, so the generated field always covers the exact visible rect; the rendered viewBox keeps the exact zoom — only generated coverage snaps). In-bucket zoom reuses every viewport-keyed memo; a bucket crossing rebuilds once. Worst case: generated area / extraction bound up to 2× the exact-zoom equivalent at the top of a bucket. Helps ALL paths (Gallery BFS included), biggest at Decoration scale. tsc + 309 vitest green. ⏳ browser-verify: zoom in Decoration + Strands target — smooth in-bucket, one hitch per √2 zoom factor; check Gallery zoom too.

**📋 2026-06-12 — recovery note (backfilled).** The 2026-06-11 session was interrupted after its last commit but before updating this file; the five commits below landed clean (tree clean, pushed, tsc + **309 vitest** + build green re-verified 2026-06-12). Canonical detail: `memory/project_decoration_stage_idea.md`. Nothing is half-done in code — the open items are all **browser-verifies**:

- **`ecdccb1` — feat: colour picker with themes + recents.** `src/components/ColourPicker.tsx` replaces the bare paint-colour input in the Decoration panel: 5 built-in themes (Art Deco, Nile & Gold, Classic Lapis, Desert Dusk, Jewel Box) + user theme creation/extension/deletion (localStorage `user-colour-themes` / `active-colour-theme`), validated hex entry, Recent colours = last 10 actually *painted* with (`pushRecentColour` at the paint dispatch sites; `useSyncExternalStore`; localStorage `recent-paint-colours`). ⏳ browser-verify.
- **`1d71ce8` → `f8eba74` — fix: "Matching leaves a few odd voids unpainted".** Probes (voidsSplitProbe + repHoleProbe, kept as regressions) ruled out rep-coverage holes on 9 default-ish fields; real cause = a congruent class whose edge length/angle sits ON a signature-quantisation rounding boundary coin-flips per instance under float noise and splits into several signatures. `extractVoids` now canonicalises field-wide (half-snap raw-ring congruence under rotation+reflection → class shares its lexicographically-smallest signature; downstream patch/cell/instance keys inherit it). Residual non-fast-path edge: canonical sig = min over *present* members, so panning could in theory orphan a record if every instance of the min variant leaves the bound. ⏳ browser-verify on the user's authored patch.
- **`f7bb666` — perf: Strands paint-target freeze ("timed out" switching to strand painting).** Was one transparent `<line>` per hit segment per visible stamp (tens of thousands of React elements on dense fields). Now a single catch-all rect + math hit-test (~6px screen radius, off-strand clicks fall through to pan) and a single-`<path>` hover highlight. Void hit-paths still DOM-per-element — candidate for the same treatment if zoomed-out Void painting ever lags. **2026-06-12 follow-up `175b94f`:** user reported the freeze persisted — f7bb666 only fixed the DOM half. The NON-fast-path branch (frame / vertex lines / rotated stamps) built its hit data with `orbitOffset` + `reduceToOrbit` + `cellOrbitKey` inside the per-SEGMENT loop; `cellOrbitKey` canonicalises the strand's whole chain over every dihedral image ⇒ segments × full-chain canonicalisations synchronously on target select. Per-strand keys now hoisted out of the loop (mirrors the fast-path `baseStrandIds` memo); identical keys by construction. tsc + 309 vitest green. ⏳ browser-verify.
- **`c2bd2fa` — perf: O(m) Booth canonical rotation ("overwhelming loading" on curved zoom-out).** `minRotation` (shared by `voidSignature` + strand signatures) was O(m²) with a string join per rotation; Booth's algorithm with `';'`-suffixed token compare keeps the EXACT old ordering — persisted signatures unchanged (20k-trial fuzz vs old impl). W=900 curved field: sig 1441ms → 75ms, extraction ~2.1s → ~0.57s per pan step. ⏳ browser-verify curved zoomed-out Decoration.

**🐛 2026-06-11 — fix: Decoration "time outs" with Lacing on (non-fast-path paints rebuilt the world).** User: "I'm getting time outs in decoration page now" (right after Lacing landed in the Lab). Cause: the main `usePattern` memo keys on the whole `config`, so on the **non-fast-path** (frame filtering, or **vertex lines** — both disable Lever A) every Decoration paint click rebuilt the entire stamped field: full-field `runPIC` (×2 with a frame: rendered field + unfiltered extraction field), extraction, and — new with Lacing — a fresh `segments` identity that re-ran `buildStrands` + `computeWeave` + `wovenPathD` over the full field in StrandLayer. Probe (`src/strand/weavePerfProbe.test.ts`, kept): 4.6.12 seeds at 1600×1200 → 13k segs, weave chain 376ms; zoomed out → 40k segs, 736ms; denser user patches scale to multi-second freezes **per click**. Fix: new geometry+viewport-keyed `stampedField` memo in `usePattern` (mirrors the 19.4 `editorBase` split) owning stamps + fast-path eligibility + stamped polygons + frame filter + `runPIC` + `boundaryOutlines` + the frame-case `decoField` re-PIC; deps = `editorBase` (covers cells/edgeLength/configuration/alternateOrientation/figures/figureRouting) + `ed?.frame` (paint actions preserve the ref) + viewport + flags — NOT decoration. Paints now reuse the field refs ⇒ StrandLayer's `strandData`/`weaves` memos hold; remaining per-paint cost = computeCurves (~30ms) + wovenPathD (~80ms, `curvedStrands` keys on whole `config`) + the pre-existing extraction. Pan/zoom on non-fast-path still rebuilds the field incl. weave (~0.4–1s/step at decoration scale) — pre-existing heaviness, weave roughly doubles it; future lever = worker/deferred weave if reported. tsc + **292 vitest** (289 + 3 probe) + build green. ⏳ browser-verify: Decoration + Lacing with vertex lines or a frame — paints should be instant again.

**🪢 2026-06-11 — Lacing exposed in the Lab.** User: "add weaving/lacing to the lab." The render path was already shared — `StrandLayer` reads `config.strand.weave` on every branch (Gallery + Builder), so the Lab only lacked the UI. Added the "Lacing (over–under weave)" checkbox + conditional "Weave gap" slider (mirrors the Gallery Sidebar controls, `SET_STRAND_STYLE` through the shared reducer) to the Lab's **Display** section in `TessellationLabMode.tsx`, nested under "Show strands" and shown only while Strands draw. Works in both Lab sub-modes (explorer tilings + Builder, all phases; the Design-phase ghost split skips weaving by design — existing behaviour). Persistence free: `labDefaults`/`configValidation` already round-trip `weave`/`weaveGap`. Fast-path note: PIC segments are polygon-clipped so every crossing lives inside the fundamental domain — `computeWeave` sees them all; only thread-parity at clone seams is the accepted v1 caveat (same as the Gallery entry below). tsc green. ⏳ browser-verify: toggle Lacing in the Lab on a Builder Composition (fast-path) + a multi-cell config.

**🐛 2026-06-10 — fix: weave blind to vertex strands.** User: "works well for edge strands but inconsistent on vertex strands; with both on, the weave doesn't recognise both sets." Cause: v1 only saw crossings at **shared chain points** (buildStrands map vertices) — but vertex-line Strands cross edge-line Strands **mid-segment** (PIC never splits segments at those crossings), so those crossings were invisible and the alternation order ignored them. Taprats avoids this by interlacing over a full planar arrangement; now we do too. `computeWeave` gains crossing **source b**: transversal mid-edge intersections via a spatial-grid broad phase (avg-edge-length cells, packed numeric keys, pair dedupe) + exact segment intersection; visits now carry a continuous position `s = edgeIndex + t` (integers = chain points, 0 = closed wrap) and dedupe per (strand, worldKey, s) so a bent thread's two adjacent edges report one visit while self-crossings keep two. Near-endpoint hits (≤1e-4) snap to the chain point (merging with source a); open-strand terminus touches (T-junctions, e.g. orphan vertex rays ending ON a star arm) skip per Taprats' odd-vertex rule. `wovenPathD` rewritten to **global arc-interval cutting**: cuts map s→arc distance, intervals [D−half, D+half] merge (wrap on closed strands), and a single pass over the prim chain clips each prim to the keep intervals with parameter-composed De Casteljau splits (replaces per-gap dropFront/dropBack — O(prims), not O(prims×cuts)). `StrandWeave.under` is now `{s, factor}[]`; StrandLayer maps factor→half. Perf on a pathological field (square scale 40 + vertex lines, 1600×1200, 27k segs, 20k unders): weave 442ms + path-gen 120ms — one-time per geometry change, typical fields ~5-10× smaller; headroom documented (defer dir/visit materialisation to crossing groups) if it ever janks. tsc + **289 vitest** (12 weave tests: +mid-edge, +mixed chain-point/mid-edge alternation, +T-junction skip, +adjacent-edge dedupe, +real-PIC square-with-vertex-lines integration asserting vertex strands weave) + build green. ⏳ browser-verify: square θ=67.5 with edge+vertex lines — weave should now break vertex strands under edge strands and vice versa, alternating.

**🪢 2026-06-10 — Lacing (over/under weave) DELIVERED, Taprats-guided.** User: "implement strand weaving, use taprats as a guide." Shipped as a global **Strand style** toggle (`strand.weave` + `weaveGap` on `StrandStyle`) — works everywhere Strands render (Gallery + Builder), Sidebar "Strand Thickness" section. Mechanics mirror Taprats' `Interlace`: a **crossing** = map vertex where ≥2 Strands pass through (PIC's degree-4 vertices, e.g. tiling-edge contact points); over/under **alternates along each thread** and **opposes across each crossing** — both opposite-parity constraints, so assignment = BFS 2-colouring of the crossing-visit graph, first-assignment-wins on odd-cycle conflicts (`src/strand/weave.ts`; handles closed-strand wrap visits + self-crossings; open-strand endpoints never weave). The under thread renders with a **gap cut** around the crossing (`src/strand/wovenPathD.ts`): edges decompose to line/cubic prims (exact Q→C elevation, shared quartic→2-cubics), arc-length-sampled De Casteljau trims; half-cut = (w/2)·angleFactor (1/sinθ clamped [1,3] for shallow crossings) + w/2 round-cap allowance + `weaveGap` (default 2px). A path break, not a paint-over ⇒ Void fills/background show through; per-strand Decoration colours still apply (1 path per Strand). Skipped on the Design-phase ghost split. Legacy `lacing.enabled`/`gapWidth` JSON now migrate into `weave`/`weaveGap` (`configValidation.ts`). Fast-path caveat: weave computed per fundamental domain — periodic ⇒ clones weave identically; crossings exactly ON a domain seam may miss their gap (accepted v1). Curves caveat: cuts sit at strand points; strong curve offsets can drift the true crossing off the vertex (accepted v1, noted in module docs). CONTEXT.md **Lacing** entry updated (reserved → shipped). tsc + **283 vitest** (+6 `weave.test.ts`) + build green. ⏳ browser-verify: toggle Lacing on default square + a multi-cell config; check gaps read as weave, curves + Decoration colours still good.

**🐛 2026-06-10 — fix: previous paint masked further fills (`77dad4b`).** User: "the colour that a void has been previously affects its response to further fills." Cause = scope-precedence masking: a finer record (e.g. Single/instance red) outranks any later coarser paint (Matching blue), so the clicked Void appeared dead — and worse, if the coarser record already existed in the same colour, the click hit the same-colour TOGGLE and erased paint elsewhere while the clicked Void looked unchanged. Fix = **"paint what you see"**: `PaintPayload` now carries `clicked` (the clicked target's full key set: signature/cellKey/patchKey/instanceKey); `clearMaskingRecords` (decoration/scopes.ts) removes records at rungs FINER than the painted one that match the clicked target (positioned keys matched with the same KEY_TOL tolerance the renderer uses; `'*'` ranks below congruent signatures so an All-strands paint also unmasks the clicked strand's sig record); the same-colour toggle now fires only when nothing was unmasked (true no-op click). Finer paints on OTHER targets deliberately survive a coarser repaint (tested). Panel bulk buttons (no `clicked`) keep plain upsert/toggle. tsc + **277 vitest** (+4 masking/toggle-suppression/strand-'*' tests) + build green. ⏳ browser-verify: paint Single red → Matching blue now turns the clicked Void blue; double-click same colour still unpaints.

**🐛 2026-06-10 — fix: Twins over-grouping (`08a0391`).** User: "twins is applying to all congruent shapes." Probe over the real default-square PIC field confirmed: the original cell key canonicalised only the **centroid position** under D_n, so congruent targets whose centroids coincide (or are D_n-related) merged even when no symmetry maps one outline onto the other — visible out-of-the-box (2 same-sig reps both vertex-averaging to the origin). Fix: `cellOrbitKey(signature, points, closed, anchor, frames)` canonicalises the **whole outline/chain** — lexicographic min over all 2n D_n images of the quantised (SNAP 0.25) vertex serialisation (rings via `minRotation`, open chains fwd/rev min); key = `<sig>#<cellTag>:<hash8>`; matching is now exact string equality (cell index → Map, later-wins). `reduceToOrbit` shifts world/field points into patch-reduced coords before hashing. Regressions: cellScope.test.ts pins same-centroid-45°-rotated rect ≠ twins while 90° rect = twin; `cellScopeProbe.test.ts` pins real-field orbit structure (4.8.8 class splits 2/2; default square's same-centroid pair stays ONE orbit — they ARE genuine D4 images, so outline canonicalisation doesn't over-split). **Note for verify:** on fully symmetric single-cell patterns most congruent classes ARE single orbits, so Twins legitimately equals Matching there — the difference shows on multi-cell (e.g. 4.8.8) or asymmetric patches. tsc + **273 vitest** + build green. ⏳ browser-verify Twins on 4.8.8.

**🎨 2026-06-10 — `cell` rung DELIVERED ("Twins" reach, `926c0f2`+`37600c1`).** User asked for the deferred cell scope. New `decoration/cellScope.ts`: per-Cell symmetry frames derived from the **boundary outlines** (`editorBase.baseOutlines`, patch.cells order) — centre = vertex average, D_n rotations about it, mirror axes through vertex 0's angle at π/n steps — so multi-cell / octagon / dodecagon / alternate orientation all work with zero special-casing (chosen over reusing `editor/symmetry.ts`, which is shape-metadata-based). Cell key = `<sig>#<cellTag>:<hash>` canonicalising the WHOLE outline (lexicographic min over the 2n D_n images of the quantised vertex ring; host cell = nearest centre) — a centroid-only key over-grouped same-centroid congruent shapes (fixed `08a0391`). `buildColourIndex`/`resolveColour` gained the rung (precedence instance>patch>**cell**>sig>'*'); `PaintVoid`/`StrandHit` carry `cellKey`; reps + base strand identities bake it; StrandLayer takes `cellFrames` (computes cell keys only when cell records exist); Reach selectors are now Matching·**Twins**·Repeat·Single (voids) / All·Matching·**Twins**·Single (strands). Asymmetric arrangements degrade gracefully — twin positions with no matching target just don't match. The FULL ADR-0005 ladder now ships. tsc + **268 vitest** (+9 `cellScope.test.ts` incl. mirror-twin orbit fill + precedence) + build green. ⏳ browser-verify: Twins paints rotation/mirror siblings within a Cell (try a multi-cell config + an asymmetric single-cell patch).

**🐛 2026-06-10 — fix: Paint-overlay hover highlight now clipped to the Frame (`fe02aa1`, hash note corrected next commit).** User report (this was the earlier "known minor — revisit if reported"): in Decoration + Frame, hovering could highlight outside the frame outline — hit-targets come from the deliberately UNfiltered field (the frame-Voids signature fix), and the overlay renders in PatternSVG's topmost slot OUTSIDE the frame clip group. Fix: new `PatternSVG.clipEditorOverlayToFrame` prop (Canvas passes `decorationActive`) wraps the overlay in the existing `#pattern-frame-clip` when the frame is clipping. SVG clip-path removes pointer hit-testing too, so the bucket cursor + clicks also stop at the frame edge (incl. the outer "sea" face's huge hit-target). Design-phase overlay stays unclipped (neighbour-stamp vertex dots must remain clickable outside the frame). tsc + 259 vitest + build green. ✅ user-verified in browser ("fantastic").

**🎨 2026-06-10 — Stage 2 Grouping scopes DELIVERED (`076ef75`→`92d43a5` + docs).** User: "more control over how I paint — just the cell, just the patch, individual voids, all voids; same with strands." Shipped the ADR-0005 ladder's `patch` + `instance` rungs behind a per-target **Reach** selector in the Decoration panel: Voids = Matching (congruent) / Repeat (patch = Lattice orbit) / Single (instance = one world Void); Strands = All ('*') / Matching (congruent strand signature) / Single (patch orbit — a single strand still repeats with the Patch; world-instance strands deliberately not offered). New modules: `decoration/scopes.ts` (positioned `<sig>@<x>,<y>` keys, nearest-stamp `orbitOffset` with deterministic tie-break, `buildColourIndex`/`resolveColour`, precedence instance>patch>sig>'*', tolerant numeric matching) and `decoration/strandGroups.ts` (per-Strand congruent signature — closed loops winding-normalised ring like `voidSignature`, open chains canonical over reversal×reflection — plus centroid). `resolve.ts` rewritten scope-aware (returns keyed `PaintVoid[]`; now actually used by `buildDecorationData`). Reducer actions take `{scope,key,colour}` + **same-colour repaint toggles the record off** (extends the strand-button deselect UX to all painting). Renderer: congruent+patch fills stay in the cloned fragment (a coloured rep tiled by `<use>` IS the orbit); `instance` fills are world-space `instanceVoidFills` — PatternSVG splits the fast-path fragment into under/strand `<use>` stacks so they still sit beneath Strands; StrandLayer resolves per-strand strokes from the records (`strandRecords` + `orbitStamps`, replacing the old single `strandColor`). **Cross-mode key stability:** strand centroids reduce through a pan-independent `decorationOrbitRing` on the fast path so patch keys survive a frame/overlay mode switch; Void reps are Voronoi-filtered so they're consistent for free. Paint overlay hover now highlights exactly the group the active Reach would paint. `cell` rung deferred (reserved in schema + docs; see plan Step 19 "Stage 2"). tsc + **259 vitest** (+18 net: scopes 11, strandGroups 5, resolve 7, decoration 7) + build green; dev server boots, HTTP 200. ⏳ browser-verify: Reach selectors paint/unpaint as labelled on the fast-path AND with a Frame; instance fill renders under Strands; per-strand colours correct on multi-cell.

**🎛 2026-06-10 — UX: "Colour all strands" is now a toggle (deselect).** User: "can't deselect colour all strands." Verified the functional path was fine — reducer clears the congruent record on `null` (tested `decoration.test.ts:39`), neither Canvas nor PatternSVG is memo-gated, `StrandLayer` re-renders on the `strokeColor` prop ⇒ render reverts. The gap was discoverability: deselect lived only in a separate, easily-missed "Reset strands" button. Now the Strands-target primary button toggles: no record ⇒ "Colour all strands" (apply); record ≠ picker colour ⇒ "Update strand colour"; record == picker colour ⇒ active-styled "Remove strand colour" (clears). Secondary button relabeled "Reset strands" → "Remove strand colour" (covers clearing after a picker change). `tsc` + 239 vitest + build green. (Stage-1 strand colour is still a single all-strands `'*'` group; per-group strand colour is Stage 2.)

**🐛 2026-06-10 — fix: Voids lose colour at the frame (`<pending>`).** User report in Decoration + frame: painting a congruent Void class skipped the Voids touching the frame edge. Cause: `extractVoids` injects its `bound` polygon's edges as segments (voids.ts:164) so faces close at the boundary — passing the **frame outline** as the bound clipped frame-touching Voids, adding a frame edge to their outline ⇒ different congruent signature ⇒ painting the interior class missed them. Probe (3-way) confirmed: frame-bound gives a distinct edge-class signature; viewport-bound over the frame-filtered field loses them into the outer sea; **viewport-bound over the FULL unfiltered field keeps every Void's interior shape** (the SVG frame clipPath, already active in Decoration at `PatternSVG.tsx:139`, crops the fills visually). Fix (`usePattern.ts` decoration block): never use the frame outline as the extraction bound; when a frame is filtering (`picPolygons !== polygons`) re-PIC the full `polygons` field for extraction only (rendered strands stay frame-filtered/completed as before). Dropped now-unused `isConvexPolygon` import. Regression: `src/decoration/frameVoidSignature.test.ts` pins "a clipping bound changes a Void signature". `tsc` + **239 vitest** + build green.

**Follow-up (same day): worked on left/top but NOT right/bottom.** The replacement extraction bound was the **visible viewport rect**, whose origin `bx`/`by` = `floor(pan/step)*step` (quantised ⇒ shifted left/up), so it sat closer to the frame's right/bottom edges and re-clipped those Voids while leaving left/top clear — exactly the asymmetry reported. Fixed: in the frame case bound the extraction to the **frame outline's bbox + a symmetric margin** (`2·max(edgeLength, boundarySize)`), pan-independent; the full `polygons` field extends ~0.75·vw past visible on every side so it always covers frame+margin when the frame is in view. `tsc` + 239 vitest + build green. ⏳ browser-verify: frame-edge Voids take colour on ALL four sides. Known minor: outer sea Void extracted (non-fast-path, no rep cap) but SVG-clipped away inside the frame; its unclipped paint-overlay hit-target can highlight *outside* the frame (cosmetic; revisit if reported).

**🔧 2026-06-10 — 19.4 snag fixes in flight.** Perf-review resume (post-CLI-crash; nothing was lost, `017a7f9`+`8eb6abe` landed). Review found: (1) known snag — every paint re-runs base PIC + void extraction (`editorBase` keyed on whole `config`, `decorationFills` too); (2) **bug** — multi-cell + `alternateOrientation` blanked painted fills + killed Voids paint (render fast-path fires — stamps stay rotation-0 on a rotated basis — but `decorationFills` bailed on the flag); (3) gate mismatch wastes extraction where the fast-path never fires (triangle rotation-π intra-stamp; boundary-lattice overlay on). **ALL THREE FIXED (`cd64218` + this commit), tsc + 236 vitest + build green.** (#2) dropped the `alternateOrientation` bail — extraction is rotation-consistent. (#1) `editorBase` re-keyed on geometry sub-fields + runPIC's full config read-set (editor `cells`/`activeCellId`/`edgeLength`/`configuration`/`alternateOrientation` + `figures`/`figureRouting`; reducer paint actions preserve the `cells` ref) and the old `decorationFills` split into a geometry-keyed `decorationReps` extraction memo (also deps `figures`+`smoothTransitions` for curves) + a cheap decoration-keyed colouring memo ⇒ **paints no longer re-run PIC or void extraction**. (#3) new shared `periodicFastPathEligible(config, editorFrame, showBoundaryLattice, stamps)` used by BOTH the render gate and the reps memo so the gates can't drift; its rotation check now also skips wasted extraction where the fast-path never fires (triangle rotation-π intra-stamp; boundary-lattice on). **⚠ Stale-snapshot contract:** `editorBase.patch` is a geometry-time snapshot — `frame`/`decoration` on it can be stale; the main memo now takes `patch` from live `config.editor` (geometry still from `editorBase`), and any new consumer must do the same. ⏳ browser-verify: paint with alternate orientation ON shows fills + live bucket; HUD pic ms ≈ 0 while painting; first-paint lag should shrink to pure rasterisation.

**🐛 Browser-verify found a latent rep bug (fixed `88cd235`, ✅ user-confirmed "it's working").** Probe (`src/decoration/decorationReps.test.ts`) showed sparse PIC fields (e.g. default single square, 8 segs) leave the strand stars as disconnected islands, so `extractVoids` emits the background **"sea"** between them as one bound-sized face (area = whole 5d1×5d1 bound); its centroid sits at the origin ⇒ it passed the Voronoi rep filter ⇒ tiled as a full-bound hit-target at EVERY stamp. Pre-existing since `3b65b19` — the earlier heavy multi-cell verify had a fully connected arrangement (coverage 1.000) so no sea existed. Fix: cap reps at `d1²·1.05` — a true periodic Void can't exceed one lattice cell's area (it would overlap its own translates); all shipping bases have cell area ≤ d1². Alternate-orientation reps verified sane by the same probe (same rep set + signatures as unrotated). Known leftover: the non-fast-path flow (frame/vertex-lines) can still hover-highlight a big sea face inside its bound — arguably a legit paint target there (frame background); revisit if reported.

**📐 DOCS (2026-06-06) — Decoration Phase Stage-1 model grilled + spec'd (no code yet).** A grill-with-docs pass nailed the Decoration model. Canonical homes: `docs/adr/0005-decoration-void-and-grouping.md` (new), `docs/adr/0003` amendment (Frame no longer required), `CONTEXT.md` (new entries **Void / Fill / Grouping scope / Paint mode**; sharpened **Decoration**), and the **build spec** in `TESSELLATION_REVAMP_PLAN.md` **Step 19** (sub-steps 19.0–19.4 + acceptance). Memory `project_decoration_stage_idea.md` bumped RAW → SCOPED.

**Locked decisions (D1–D7, see ADR-0005):** Builder-only Phase (`editor.decoration`), Gallery untouched · two targets **Strand colour** + **Void Fill** · a **Void** = bounded face of the *global* strand arrangement (spans tiles) · bound = **Frame preferred, NOT required** (viewport fallback) · **Grouping scope** ladder Congruent→Patch→Cell→Instance, identity-keyed, independent per target, **Stage 1 = Congruent only** · Strand colour = new record overriding `StrandStyle.color` · interaction = **Paint mode** (bucket cursor, active colour, click recolours whole congruent group, faint hover highlight, perf-gated → first-click fallback).

> ⚠️ **STAGE 1 ONLY.** Build ladder-ready (`{scope,key,colour}` records) but ship only the Congruent rung. Deferred: Patch/Cell/Instance rungs, lacing/weaving v2, image tools.

**✅ 19.0 DONE (2026-06-06).** `GroupingScope` / `ColourRecord` / `DecorationConfig` types + `EditorPatch.decoration?` field (`src/types/editor.ts`); `migrateDecoration` + `migrateColourRecord` validators wired into `migrateV3` (`src/editor/migrations.ts`) — absent ⇒ undefined, version-gated, bad records filtered, malformed block dropped. Round-trips via both load paths (`configValidation` + `labDefaults`). Tests: `src/editor/migrations.test.ts` (7). `tsc` clean, **210 vitest** (203→210), build green.

**✅ 19.1 DONE (2026-06-06) — Void extraction spike succeeded.** `src/decoration/voids.ts` (+ `voids.test.ts`, 12). `extractVoids(segments, bound)` = Cyrus–Beck clip → split-at-intersections planar arrangement (snap-fused vertices) → DCEL half-edge face walk (next = CW-most, drop max-|area| outer) → CCW Voids + congruent `signature`. `voidSignature` = interior-angle + edge-length token ring, canonical over rotation+reversal → reflection-invariant FNV-1a 8-hex. **Real 4.8.8 PIC (918 segs, 240² bound) → 25 Voids / 8 congruent classes / coverage 1.000 / 15 ms** — the hole risk did NOT bite (arrangement connected on 4.8.8). Decisions + known limits (holes / spurs / convex-bound-only) in `TESSELLATION_REVAMP_PLAN.md` Step 19.1. `tsc` clean, **222 vitest** (210→222), build green. Module is test-only so far (not imported by app → tree-shaken; wires in at 19.2).

**✅ 19.3 DELIVERED — Stage-1 Decoration working + perf-tuned (2026-06-06). User: "functioning broadly as intended."** Multi-cell patch verified smooth (loading good, zoom good, hover good after the fixes below). Remaining minor: **first-paint lag** — one-time, the first fill rasterises coloured Voids across the whole tiled field at once, and each paint re-runs the base-patch PIC (config identity changes ⇒ `editorBase` memo recomputes). Optional safe fix if it annoys: decouple `editorBase` deps from `editor.decoration` (reducer preserves `cells` ref, so depend on geometry sub-fields, not whole `config`) so paints don't re-PIC. Other deferred: multi-cell COMPOSITION seam-verify (no seams reported, looks fine); curved zoomed-out (~580 ms); covering-rect overlay if hover ever janks again; drag-pan-over-Void.

**Perf fix chain (all 2026-06-06):** entry-timeout grid+tight-bound (`c68ef85`) → fast-path in decoration (`b8fca19`) → tile fills via cloned fragment, no per-view extraction (`aa9a85b`) → gate fills memo (`e371675`) → **multi-cell fast-path** (`9fe6d51`, the user's case) → tile Paint overlay hit-targets instead of re-extracting on pan (`3b65b19`) → memoise hit-targets so hover only redraws the highlight (`6cd5ca1`). pic/strand → ~0, zoom/pan/hover smooth.

--- (original 19.3 build note below) ---

**✅ 19.3 BUILT — Stage-1 Decoration functional end-to-end (2026-06-06).** Commits `e80a7ae` (19.3a phase scaffold) → `cb69b49` (19.3b live wiring) → `1440ce2` (19.3c Paint mode). What works: Decoration phase in the Builder switcher (FigureControls hidden — geometry frozen); `usePattern(decorationActive)` extracts Voids over the bound (Frame outline if convex, else viewport rect), bypasses the periodic fast-path, returns `voidFills`/`strandColor`/`decorationVoids`; `DecorationPaintLayer` (bucket cursor, hover-highlights the congruent Void group, pointerdown Fills it) in PatternSVG's topmost slot; side panel = active colour picker + "Colour all strands" + reset/clear + filled-class count; reducer actions `SET_DECORATION_VOID_FILL`/`SET_DECORATION_STRAND_COLOR`/`CLEAR_DECORATION` (undoable). Strand colour = single panel swatch (one congruent group in Stage 1); Void Fill = canvas click. `tsc` clean, **232 vitest**, build green, dev server boots clean. **Known/deferred (19.4):** hover blocks drag-pan over a Void (onPointerDown stopPropagation); perf-gate the hover highlight on big fields; extractVoids re-runs on pan (≈15ms/900segs — fine); holes/spurs/convex-bound limits from 19.1.

**Browser-feedback fixes (2026-06-06, commits `4c0bb4a` + `5beb530`):**
- **#2 inconsistent group fill** (random unpainted siblings) → `simplifyCollinear` drops collinear/T-junction vertices before signing, so congruent Voids hash equal. ✅
- **#3 no way to exit paint** + **#4 strands-vs-voids** → manual **Paint target** toggle (Off · Voids · Strands) in the Decoration panel; `DecorationPaintLayer` does Void polygons in Voids mode, thick transparent Ray hit-targets (hover-highlights all Strands) in Strands mode. ✅
- **#5 curved Voids treated as straight** → `decoration/flatten.ts` (`flattenStrandsToSegments`, samples Béziers into 8 chords, mirrors StrandLayer); `usePattern` feeds these to `extractVoids` when `curvesEnabled`. Probe: 4.8.8+curves 918→7344 segs, 31 Voids avg 33 verts, 144 ms. ✅
- **#1 PERFORMANCE — entry-timeout `c68ef85` + standing-cost fast-path `b8fca19`.** (a) `extractVoids` got a spatial-grid broad-phase + tight VISIBLE-viewport bound → no more O(n²) hang on entry. (b) Decoration now USES the periodic fast-path (was disabled): PIC runs once on the base patch (pic/strand HUD → ~0, `<use>` clones), and the full extraction field is built by *translating* base segments (`stampSegments`) — no re-PIC. Per-pan cost is just grid extraction. Exact translates ⇒ congruent Voids share signatures (helps #3). Non-periodic (frame/multi-cell/vertex-lines) keep full-PIC via shared `buildDecorationData`. **Still deferred:** curved zoomed-out (~580 ms; flatten needs buildStrands over the field); perf-gate hover→first-click; drag-pan-over-Void swallowed.
- **Bulk fill button follows Paint target** (`b8fca19`): "Colour all Voids" (a `'*'` void-fill default; specific signatures override) in Voids mode, "Colour all strands" in Strands mode.
- **Hover highlight memoised** (`6cd5ca1`): hover lag at high zoom was every pointer-move re-rendering ALL hit-target paths (not just the highlight). Hit-targets now `useMemo`'d on [voids/segments]; highlight is a separate memo on [hovered] ⇒ moving the cursor only redraws the small highlight set. ⏳ verify hover is smooth at high zoom; if the large semi-transparent highlight fill still costs, fall back to stroke-only highlight or the covering-rect approach.
- **Paint overlay no longer re-extracts on pan** (`3b65b19`): the worst-ms >100 spike (pic/strand low) was the overlay extracting the visible field every pan while the tool was on. `decorationFills` now also returns the representative Voids (`reps`); the overlay hit-targets are built by TRANSLATING reps across visible stamps (pure array ops). ⏳ verify pan/zoom worst-ms drops; if the overlay's tiled hit-paths (reps×visible-stamps) still jank, next step is a covering-rect + pointer-lattice-reduction overlay (1 rect, highlight only the hovered void's copies).
- **Multi-cell periodic fast-path** (`9fe6d51`, after `e371675` gated the fills memo): the user's slow patch was **multi-cell** (fast-path was single-cell-only ⇒ full-field PIC+strands every pan, pic/strand ~46/98). `compositionLatticeStamps` is pure-translation and the unit cell is already PIC'd once, so lifted the `!multiCell` guard on the render gate + `decorationFills` (rings via `compositionLatticeStamps`, near-ring filter keeps the field tiny). **⚠ Affects multi-cell COMPOSITION rendering too (deferred "generalise Lever A") — UNVERIFIED for seam artifacts; flag-gated (`perfPeriodicity='0'` / `?perfPeriodicityOff` to revert).** ⏳ browser-verify multi-cell composition + decoration have no strand seams at unit-cell boundaries.
- **Fills now TILE via the cloned fragment** (`aa9a85b`) — fixes "only fills the view + slow pan". Pan-independent `decorationFills` memo extracts ONE representative Void per lattice cell (Voronoi cell of origin, neighbour-ring-closed), coloured by signature, rendered INSIDE the `<use>` fragment ⇒ tiles the whole field for free, instant coverage, **no per-view extraction / no pan re-extract** (stable ref ⇒ fragment stays memoised). Visible-field extraction runs ONLY while painting (target≠Off) for overlay hit-testing. Single-cell periodic only; multi-cell/frame keep the full-field (view-bounded) path. ⏳ browser-verify pan/zoom is smooth + fills cover everywhere.

`tsc` clean, **236 vitest**, build green.

**⏳ NEXT — browser-verify the fixes**, then **19.4** (the deferred perf work above + no-Frame viewport sanity + export-reflects-fills). After that Stage-1 Decoration is shippable; then Stage 2 (Patch/Cell scopes) per ADR-0005.

---

**✅ 19.2 render-path pieces DONE (2026-06-06).** `src/decoration/resolve.ts` (`resolveDecoration(segments, bound, decoration) → { fills, strandColor }`, pure, skips extraction when no Fill records; +6 tests) · `src/rendering/VoidFillLayer.tsx` (filled `<path>` per Void, behind Strands) · `StrandLayer` `strokeColor?` override (falls back to `config.strand.color`) · `PatternSVG` `voidFills?` + `strandColor?` props (VoidFillLayer between Tile & Strand layers; strand override on both branches). **Decision: Decoration bypasses the periodic fast-path** (geometry frozen ⇒ full-field extraction affordable + avoids cross-seam Void splitting under `<use>`). `tsc` clean, **228 vitest** (222→228), build green. `resolve.ts`/`voids.ts` still tree-shaken (no live importer yet).

**NEXT — 19.3 (phase + Paint UI + live wiring):** add the Decoration phase to the Builder phase switcher (hide `FigureControls`); compute `voidFills`/`strandColor` in `usePattern` (extract over Frame outline, else viewport bbox; fast-path OFF when Decoration active) and thread `Canvas → PatternSVG`; Paint tool (bucket cursor + active colour), affected-group hover highlight (perf-gated → first-click fallback), click-apply writing `congruent` ColourRecords, undo via editor history. See `TESSELLATION_REVAMP_PLAN.md` Step 19.3.

---

**✅ SHIPPED + MERGED (2026-06-06) — Builder perf, Lever A default-on.** Branch `perf/builder-render-memoization` was **fast-forward merged into `main` and pushed** (`main` now at `2e26569`). Carries: Findings 1+2 (render memoization), the diagnostic HUD, **Lever A periodicity fast-path (now DEFAULT-ON)**, and the `compositionPeriodicity` test. Canonical detail + two-axis cost model in `memory/project_builder_performance_idea.md`. `tsc` + 203 vitest + build all green.

**What Lever A does + the 2026-06-06 verify.** Renders ONE fundamental domain (PIC + buildStrands on the base patch, reusing `editorBase.baseSegments`) tiled via SVG `<use>`, gated to provably-exact cases (single-cell, rotation-0 stamps, no vertex-lines/frame/boundary-lattice; else falls back to full PIC). **User browser-verified on a heavy single-cell Composition pan: 15fps / 64ms-PIC → smooth 60fps with pic/strand ms ≈ 0.** So this supersedes the old 2026-06-05 pessimism ("pan barely improved") — pan/zoom on covered configs is now SOLVED. Default flipped to on in `utils/perf.ts::periodicityEnabled` (opt out `localStorage.perfPeriodicity='0'` or `?perfPeriodicityOff`).

**⚠ Guarded caveat (do NOT reintroduce):** under the fast-path, `usePattern` returns ONE fundamental domain for `polygons`/`segments` (full field = `<use>` clones in the DOM). So `segmentsRef.current` (→ `exportUnwovenSVG`) would emit a single unit cell. No Builder export consumes it today; guard comments left at `Canvas.tsx` segmentsRef assignment + `perf.ts`. Any future Builder save/export or save-preview page MUST use DOM export (`exportSVG`) or re-derive the full field.

**HUD (dev only, `import.meta.env.DEV`-gated, never in prod):** live in-app toggle (Shift+P or a bottom-left "perf" pill — no console/reload), Builder regen counts + PIC/Strand ms, live fps, a **worst-frame-ms jank indicator** (warns >20ms), and an in-panel **Lever A** A/B button. Enable via the pill or `localStorage.perf='1'`.

**PARKED (deferred, documented) — Lever B (PAINT axis).** The remaining felt-lag is the **global angle-slider drag**, which re-rasterises every `<use>` clone each frame — paint-bound, *separate from pan/zoom* (now fast). User decision 2026-06-06: **park Lever B**, the diagnosis itself is the valuable outcome (HUD `worst ms` reproduces it on demand). If revisited: pan/zoom off the SVG `viewBox` via a GPU-composited CSS transform during the gesture, commit to viewBox on gesture end; touches `worldToScreen` + picker positioning + the rotation `<g>`; build behind a flag. Also deferred: generalise Lever A to multi-cell / ghost-field (gates in the memory).

**Housekeeping done this session:** cleared a repo-corrupting Windows `Zone.Identifier` artifact from `.git/refs/heads/main:Zone.Identifier` (+ hundreds of ADS siblings under `.git/objects/`); `git fsck` clean. Branch `perf/builder-render-memoization` still exists locally + on origin (merged; safe to delete).

---

**Current branch:** `main` (Builder-perf work above is merged in). Prior feature work below (framing, flexible placement, Gallery frame, multi-cell, vertex placement) shipped on the feature branches noted per-entry; check each `⏳` before assuming it's on `main`.

**2026-06-06 — fix: composite Seed edge length not maintained on sides change (`a92eb43`, on `main`). ✅ browser-verified by user ("working well").** Report: in a composite (multi-cell) Patch, increasing the active Cell's Seed sides changed the Seed's visible edge length. Root cause: `SET_CELL_SEED_SIDES` (reducer.ts) rebuilt the Seed via `createSeedTile(sides, state.editor.edgeLength)` — reading **patch** `edgeLength`. In composite Patches the boundary-size slider (`SET_CELL_BOUNDARY_SIZE`, multi-cell branch) rescales `patch.edgeLength` while deliberately leaving each Cell's Seed Tile size untouched ("Seed Tile sizes stay"), so the two drift apart; a sides change then snapped the Seed back to the drifted `patch.edgeLength`. Fix: preserve the **existing** Seed Tile's own `edgeLength` + `rotation` (type-guarded `cell.tiles.find((t): t is EditorRegularTile => t.kind === 'regular' && t.source === 'seed')`), falling back to `patch.edgeLength` only when no Seed exists (e.g. `noSeed` cell). Side benefit: also preserves the boundary-matching rotation (`BOUNDARY_ROTATION[shape]`, e.g. π/4 for the 4.8.8 square Cell) that the old code reset to 0. `tsc` clean; `compositionPeriodicity` tests pass. Committed + pushed to `main`.

**2026-06-05 — fix: vertex placement silent no-op under symmetry (`b62098f`).** User report: "tried a vertex placement, didn't work" → single-cell, picker opened, Place did nothing. Root cause: the vertex picker classified clean vs ⚠-overlap using **single-tile** viability, but under a symmetry mode the reducer places the whole orbit all-or-nothing (`placeTilesOnVertexOrbit` returns null on any orbit-mate collision). So a single-tile-clean orientation with a colliding orbit sibling showed no warning yet placed nothing. Silent-failure rate scaled with symmetry order (rotation 3/27, vertical 5/27, full 13/27 on a default square Cell; `none` 0/27 — why the simple case always worked). Fix mirrors the edge picker's orbit-aware `viableSidesForEdge`: new `vertexOrientationsWithOrbit` + `viableSidesForVertexOrbit` in `editor/orbit.ts` recompute each orientation's `overlaps` as "force-free orbit fails to place"; Canvas uses these so colliding sizes now badge ⚠ and route through the force-confirm modal (→ `force:true` → orbit places). Regression: `src/editor/vertexPlacementOrbit.test.ts`. `tsc` + 201 vitest + build green. ⏳ browser-verify with a symmetry mode on.

**2026-06-05 — n-Ring Frame rotation.** The n-Ring Frame previously had only a Rings slider (no orientation control — shape Frames already rotate). `nRingOutline(cell, rings, rotation=0)` now spins the union outline about the world origin (the active Cell's Boundary is built at `(0,0)`, so it spins in place). Clip-only, consistent with the Shape Frame: the union still follows whole Patch edges, just oriented; the lattice field underneath is unchanged so the rotated outline cuts across tiles at the edge. Canvas passes `frame.rotation`; new Rotation slider (0–360°) in the n-Ring UI block of `TessellationLabMode.tsx`, dispatching via `updateFrameGeom`. `tsc` + build + 12 frameNRing tests green (added a rotation regression: area-preserving, 45° corner at 150·√2). ⏳ browser-verify pending.

**2026-06-01 — Framing relocated to a persistent overlay + node-based completion. ⏳ browser-verify + merge pending.** Framing is **no longer a Phase**: the Frame is a persistent overlay across Design + Composition (read later by Decoration); phase sequence collapses to **Design → Composition → (Decoration reserved)**. Complete-to-frame is **dissolved** — the frame exposes its edge **Frame nodes** (incl. corners) as clickable targets in the ordinary **Complete** mode; a Complete touching a frame node stores its Tile frame-scoped (`frame.completedTiles`, world space, non-repeating), sidestepping the old lattice-offset jank entirely. Canonical design home: `memory/project_framing_stage_idea.md` ("Complete-to-frame — RESOLVED"). Commits: **`b172ecd`** — phase collapse + persistent Frame panel + `editorFraming`→`editorFrame` (frame-presence gated, both phases) in TessellationLabMode/Canvas/usePattern. **`cc7a222`** — `patchSelectable.frameSelectablePoints` + `isPatchSelectableVertex` accepts frame nodes in the `includeNeighbours` branch; Canvas `frameVertices` memo; `EditorVertexLayer` `'frame'` dot variant. **`553723f`** — `multiPickCompleteAcrossPatch` routes `anyFramePick` to a world-space `completeNGap` (synthetic probe cell of all Patch+frame tiles for the guards) → `frame.completedTiles`, no orbit; `chordCompleteAcrossPatch` rejects frame picks; `seedFiguresForEditor` gains `extraTiles` for frame tile types. **`9343d61`** — removed `EDITOR_PLACE_TILE_ON_FRAME_SECTION`/`EDITOR_COMPLETE_TO_FRAME`, `frame.ts::placeRegularNGonOnFrameSection`/`frameCornerStubTiles` (+ tests), history allowlist entries. `tsc` + 193 vitest + vite build all green. **Deferred:** frame symmetry-orbit on completion; chord (2-pick) frame completion (multi-pick only in v1). ADR-0003 has a 2026-06-01 amendment; CONTEXT Frame entry rewritten.

**Follow-ups same session:** **`da07b5c`** — fix: don't clip to frame in Design phase. The frame clip wrapped `StrandLayer`, so neighbour-preview Strands were cut to the frame edge while ghost Tiles (rendered outside the clip group) showed fully ("show strands doesn't work on show neighbours"). New `PatternSVG` `clipToFrame` prop gates the clipPath; Canvas sets it true only for the Gallery or Builder Composition phase — Design keeps the frame as a non-clipping overlay (outline + nodes still draw). **`58aa2e4`** — perf: memoized `TileLayer`/`StrandLayer`/`ControlPointLayer` (`React.memo`). `PatternSVG` renders with the live viewTransform → re-rendered the whole field every pan frame; layers now bail on stable props (usePattern uses the deferred VT + is memoized). `runPIC` confirmed linear. **Builder perf is now PARKED** — remaining levers in `memory/project_builder_performance_idea.md` (decouple Design-phase geometry from viewport; memoize editor overlay + useCallback handlers; Composition lattice-periodicity PIC).

**✅ Browser-verified by user (2026-06-01):** *"framing works well besides the [Builder] performance problems… the relocation has gone smoothly. It may need some perfecting with regards [the] completion mechanic."* Relocation confirmed; frame-node completion works but may want polish (specifics not yet enumerated — gather when the user next hits friction). **⏳ Pending:** completion-mechanic polish (TBD); merge to `main` (this branch carries framing + flexible-placement + Gallery-frame, all unmerged); Builder perf (parked, `memory/project_builder_performance_idea.md`).

**2026-06-01 — Flexible placement + skippable overlap warning (Design Phase + Place mode). ✅ browser-verified by user.** Replaced hard placement scoping (the `viableSidesFor*` picker filters) with flexible placement + a skippable overlap confirmation, mirroring the multi-vertex Complete `force` pattern. Design rationale + full per-slice status in `memory/project_flexible_placement_idea.md` (**canonical**). Core slices: **`b78945f`** — edge + vertex viability probes now use the shared edge-cross `overlapsExisting` (catches partial-overlap false-negatives); `VertexOrientation` gains `overlaps`, `vertexPlacementOrientations` emits overlapping orientations tagged; new `placeableSidesForVertex`. **`605a483`** — `force?` on the 3 placement actions + reducer + all 3 orbit placers (skip overlap gate on force, keep structural resolution; symmetry orbit-mate collisions now caught accurately). **`904f859`** — picker shows ALL `PICKER_SIDES`; overlaps badged dashed-amber + ⚠; vertex page-2 flags per-orientation overlap; `EditorPickerOverlay` gains `forceableSides`. **Confirmation UX (`d63041c` → `55e573c` → `e37a100`):** picking an overlapping size opens `OverlapConfirmModal` — evolved from a centred screen overlay to the Complete-mode Art-Deco styling to a **local popover anchored at the picker** (down-arrow, outside-click/Esc cancels, Accept/Enter commits `force:true`); `Canvas` captures the picker anchor in `overlapConfirm.pos`. `tsc` + build green. Known limits: vertex sizes with no angularly-fitting sector stay disabled; caution copy is generic (no distinct orbit-mate wording).

**2026-06-01 — Vertex strand curve fully decoupled.** When "Decouple vertex parameters" is on, vertex (vertex-line) strands now carry their own independent curve recipe `FigureConfig.vertexCurve` (separate enable + mode/direction/control-points), not just angle/length. `computeCurves` + `ControlPointLayer` pick `vertexCurve` for decoupled vertex-line segments, else `curve`. Curve actions (`SET_CURVE_*`) gained an optional `target: 'edge' | 'vertex'` (new `CurveTarget` in `actions.ts`); reducer routes via `updateCurve`/`curveField`/`curveBase` helpers. `SET_VERTEX_LINES_DECOUPLED` seeds `vertexCurve` from `curve` (deep-copy) so the switch is seamless. UI (`FigureControls`): edge toggle relabels "Curve strands"→"Curve edge strands" when decoupled; "Curve vertex strands" toggle in the decouple block; curve-shape editor gains an `edge | vertex` selector (local `curveTarget` state) that switches the whole shape editor. Also renamed label "params"→"parameters". Optional field, no migration. `tsc` + build green.

**2026-06-01 — Gallery Frame Tier B (lattice-unit sizing) + SCOPE LOCK.** The Gallery **Frame** Size slider now reads in **whole tiling repeat units** instead of raw px. One unit = `|t1|`, the tiling's nearest same-orientation translate at the current scale. `archimedean.ts` now exports `tilingRepeatLength(def, edgeLen)` (thin wrapper over the still-private `getTilingLattice`). `Sidebar.tsx` derives `frameRepeat` from `TILINGS[config.tiling.type]` + `config.tiling.scale`, drives the slider min/max/value in units, and `setFrameUnits` converts back to px. `size` is still **stored in px** — no schema or `readGalleryFrame` change; the slider just snaps to integer multiples of the live repeat. Label reads "N units · Mpx". Aspect + rotation sliders unchanged. Build + `tsc --noEmit` green.

**🔒 SCOPE LOCK (user, 2026-06-01):** Gallery framing is **shape + size ONLY — no tile-completion features.** The clip-only design already meets this (BFS fills the frame; strands hard-clip at the edge). Do NOT port the Builder's completion machinery (`computeFrameSections` / `placeRegularNGonOnFrameSection` / `frameCornerStubTiles` in `editor/frame.ts`) into the Gallery path. Edge resolution stays a future Decoration-stage job. With Tier B done, Gallery framing is considered **feature-complete** per this scope.

**Fix `6f4574d`** — Size slider froze at large tiling repeats. Cause: `frameMaxUnits` forced `minUnits+1` even when one repeat unit already neared the old 1600 px ceiling, so dragging to that max clamped back under the cap and rounded to the same unit (frozen thumb). Hit on hex/octagon/4.8.8 at raised scale (repeat ≥ ~800). Fix: cap units at `MAX_FRAME_UNITS = 16` and raise `MAX_FRAME_SIZE` 1600 → 8000 so the top unit's px never clamps. Round-trip verified across scales 40–3000 (only absurd scale 3000 collapses to 1 unit — a degenerate huge frame). `MAX_FRAME_SIZE` is also the `readGalleryFrame` clamp ceiling, now 8000.

**Pentagon Frame shape `c923ddf`** — `FrameShape` gains `'pentagon'` (point-up, flat base; `SHAPE_PHASE = -π/2` in screen coords). Added `SHAPE_SIDES`/`SHAPE_PHASE` entries (`frame.ts`), Sidebar option (Square · Pentagon · Hexagon · Octagon), and both frame-shape allow-lists — Gallery `configValidation.ts` + Builder `migrations.ts` — so it round-trips. Inherits unit-sizing/aspect/rotation unchanged. Outline + 17 frame tests verified.

Gallery Frame shapes are now **square / pentagon / hexagon / octagon**. To add more: extend `FrameShape`, the two `Record<FrameShape, …>` tables in `frame.ts` (TS enforces exhaustiveness), the Sidebar `<option>`s, and both `FRAME_SHAPES` sets.

**✅ Browser-verified by user 2026-06-01** — Tier A + Tier B + pentagon all confirmed working in-browser ("looks all good"). Gallery Frame (shape + size, clip-only) is **feature-complete** per the scope lock. Not yet merged to `main` (lives on `feat/art-deco-egypt-theme-revamp`).

---

**2026-05-31 — Gallery Frame (Tier A, SHIPPED `aedfecc`).** Clip-only parametric Shape Frame in **Gallery** mode (distinct from the Builder's Framing Phase). The infinite tiling is clipped to a square/hex/octagon outline + visible accent stroke, driven by a new Gallery-only sidebar **Frame** section (shape / size / aspect / rotation). Reuses the existing `editor/frame.ts::frameOutlinePolygon` geometry + PatternSVG's clip+stroke path verbatim — **no completion machinery** (the BFS field already fills the frame, so the janky complete-to-frame problem doesn't arise here).

Files: `types/pattern.ts` (`PatternConfig.frame?: FrameConfig`, shape-only) · `state/actions.ts` + `state/reducer.ts` (`SET_GALLERY_FRAME` → top-level `config.frame`, distinct from the Builder's `SET_FRAME`→`editor.frame`) · `components/Canvas.tsx` (`frameOutline` memo reads `config.frame` when `tiling.type !== 'editor'`; gated off the Lab so it can't leak across workspaces) · `components/Sidebar.tsx` (Gallery `mode === 'main'` Frame section) · `state/configValidation.ts` (`readGalleryFrame` clamps size to `[MIN,MAX]`, defaults aspect/rotation, **drops non-`shape` frames silently** — a missing Gallery frame is harmless).

Build + `tsc --noEmit` green. **Known v1 caveat:** Strands hard-clip at the frame edge (clean cut, no edge resolution) — that's a Decoration-stage follow-up, intentionally out of scope. Placement defaults to world origin (0,0); reposition by panning the pattern under the frame. **Not browser-verified yet** (verify via `npm run dev` → Gallery → Frame section).

**⏭ NEXT — Tier B fast-follow (RAW, ~1–2h):** lattice-unit sizing so the frame is measured in **whole repeat units** (the affordable "patch-based like the Builder" feel). `archimedean.ts` already computes translation vectors internally via `getTilingLattice` (line ~239, private, used for pan-stability seed-snapping) — export it, then convert the Size slider to lattice-cell multiples (size = N × |t1|). Note: Gallery has **no fundamental-domain outline polygon**, only the two vectors — a true Builder-style n-ring patch frame (Tier C) would need to derive + union a domain per tiling and is a much larger, separate piece. Verdict from this session: Tier B is the right stopping point; Tier C not worth it.

---

**2026-05-30 — Framing Phase (Builder Phase 3: Design → Composition → **Framing** → Decoration).** Design rationale + full status live in `memory/project_framing_stage_idea.md` (**canonical**); glossary in `CONTEXT.md` (**Frame** / **Frame node**); ADR-0003 (phase sequence), ADR-0004 (Framing structural-only). Frame config on `PatternConfig.editor` (Builder-only). This block is the per-slice **commit log** only — see the memo for the why.

**Slices shipped (WIP-committed on this branch):**
1. Phase scaffold (`10a0ce8`) — `editorPhase` gains `'framing'`; renders the stamped Composition.
2. Frame data model (`c554c08`) — `FrameConfig` on `EditorConfig`; `SET_FRAME` + history + `migrateFrame`.
3. Outline + clip + UI (`637e384`) — `frame.ts::frameOutlinePolygon` (square/hex/oct); PatternSVG clips to it.
4. Frame nodes (`41a24b2`) — `computeFrameSections` (exact edgeLength spacing + `isStub` remainder).
5. Completion-to-frame (`4b30d64`+`ab68691`) — `placeRegularNGonOnFrameSection`; `EDITOR_PLACE_TILE_ON_FRAME_SECTION` → frame-scoped `completedTiles`.
6. PIC over frame tiles (`4cc859c`) — `usePattern` appends `completedTiles` to the PIC input.
7. Field bounding (`7a8fc3d`) — keep stamped tiles whose centre is inside the frame (Q12).
8a. Auto-fill (`91f9ba3`) — `EDITOR_COMPLETE_TO_FRAME` + Complete/Clear buttons.
8b. Aspect/rotation/origin (`1f985a5`) + node-symmetry fix (`d4ea3a2`, centred half-stubs).
9. Irregular stub fallback (`a75620f`) — `frame.ts::frameCornerStubTiles`, one corner-notch tile per Frame corner.
10. n-ring clip-only type (`3c1c31b`) — `editor/frameNRing.ts` (`nRingCellStamps` / `unionOutline` / `nRingOutline`); single-cell square/hex/triangle; Frame-type select + Rings slider. **Browser-verify pending.**
11. Default-state UX (`ce5ba92`) — Framing is non-destructive; empty state offers both Frame types directly.

**⏸ ON HOLD — complete-to-frame redesign.** User: "very janky — just overlays a single layer of tiles all around the edge." Full diagnosis + the options floated are in the memo ("Complete-to-frame — ON HOLD"). Root: the completion ring is **frame-edge-aligned** but the field is **lattice-aligned** → offset + overlap; clean tile-aligned completion needs the frame to match the lattice (the n-ring already is that). **User is writing a detailed spec — do NOT touch complete-to-frame or its dependents (wrap-to-whole-patch A/B, symmetry-orbit on completion) until it lands.**

**Resume:** continue from the latest `wip:` on this branch. `editorPhase` is local UI state (not persisted); frame *settings* persist on `EditorConfig`. Not blocked: `frameOrigin` click-picker (X/Y sliders already exist), Frame node/section terminology pass. Known minor: the stub fallback skips a thin corner sliver on aspect≠1 frames (degenerate notch; revisit if visible).

---

**2026-05-22 (session 6) — PIC `figureRouting` toggle.** User asked the honest meta-question: are these problems solvable or a product of the mathematics? Answer: partly mathematical (generic PIC has no canonical answer for degenerate pair-A meetings on irregular tilings; historical Islamic patterns on dual Laves tilings essentially don't exist and use bespoke rosette construction in Taprats, not generic PIC). Given the user can't have one "right" answer, surfaced the trade-off as a user-facing control.

- `PatternConfig.figureRouting?: 'auto' | 'edge' | 'centroid'` (default `auto`). New `SET_FIGURE_ROUTING` action + reducer case. Persisted through `configValidation.readPatternConfig`.
- `runPIC` reads `config.figureRouting` and threads it to `emitStarArms`. `useCentroidV = routing !== 'edge' && isConvex` — `edge` falls through to the original Kaplan edge-slide (with same-edge guard); `auto` and `centroid` keep the current centroid V behaviour.
- New segmented control in the Sidebar (under Curves, above Strand Thickness): three buttons — Auto / Edge / Centroid — with tooltips explaining the trade-off.
- New regression test: `figureRouting=edge bypasses centroid V on floret θ=40°` (asserts no segment endpoint at `poly.center` and longest segment ≥ 0.4 × diameter). 167 tests pass.

**Resume protocol:** load floret / kisrhombille / deltoid / heptagonal in browser and try each routing mode. Auto is the same as before this commit. Edge mode restores the slide artifact but keeps every ray. Centroid is the same as auto for now (kept as explicit symmetric override).

---

**2026-05-22 (session 4 + 5) — PIC: centroid V extended to all convex polygons; arm-length caps removed.**

Session 4 (commit `224fdfb`) introduced centroid-routed V on uneven convex polygons only, but user verification with 11 bug screenshots showed "many rays missing and floating shapes" — even-borderline polygons (heptagonal-rosette ratio 0.696) were still dropping their slide pairs via the arm-length cap from `2632e69`, and the per-ray fallback cap from `e451af0` was killing long Kaplan-trim arms on floret θ=30°.

Session 5 fix (this commit):
- **Centroid V now fires on ALL convex polygons** (was: uneven-only). Both `emitStarArms` branches gate on `isConvexPolygon(polyVertices)` rather than `isUneven`. Concave polygons keep the original edge-slide with same-edge guard (`ddcad24`).
- **Arm-length cap removed** from `emitStarArms` (no longer needed since convex always uses centroid V; concave path runs original Kaplan slide which is bounded by the polygon boundary).
- **Per-ray fallback cap removed** from `runPIC` — long Kaplan-trim arms (floret θ=30° 72-unit fallbacks) are restored.
- **Cairo behaviour changes** — the small slide at V0/V4 θ=27.5° is now a centroid V. Cairo regression test still passes (≥8 origin keys, strand pieces > 5 length).
- Probe: heptagonal-rosette θ=30° 6→9 segs; floret θ=30° 8→10; deltoid θ=30°/60° 6→7, 9→10. All 166 tests pass.
- **Visual verification pending** — refresh browser and sweep θ on floret-pentagonal, kisrhombille, deltoidal-trihexagonal, heptagonal-rosette, cairo, tetrakis. Confirm: (a) rays no longer missing; (b) the centroid V is acceptable on Cairo (this is a visible Cairo change vs. the original slide).

If the centroid V is too visible on Cairo specifically, the next iteration is to add a CAIRO-SPECIFIC exception (keep edge-slide on Cairo, centroid V elsewhere) or route through a softer interior point (apothem foot on the bisector of forwardRay/backRay edges) instead of the raw centroid.

---

**2026-05-22 (session 4) — PIC Direction 3 centroid-routed V (FIRST ATTEMPT, superseded by session 5).** User reported after visual verification of session-3 commits: "many of the rays disappear in the middle angles. However it is looking a bit cleaner at least, there is less overlapping." The session-3 trade-off (sparse figures on uneven polygons at middle θ) was too aggressive. Implemented Direction 3 (centroid-routed strands) from the investigation memo's Follow-up section.

- `emitStarArms` (`src/pic/index.ts`): both edge-slide branches (asymmetric + both-positive-outside) on uneven polygons emitted a V routed through `polygonCenter` instead of dropping the pair. Convex-only guard (`isConvexPolygon(polyVertices)`); concave uneven polygons kept the original drop.
- Was insufficient — even-borderline polygons (heptagonal-rosette ratio 0.696) and the per-ray fallback cap continued to drop rays. Replaced in session 5.

---

**2026-05-22 — PIC irregular-polygon edge-slide bugs, session 3 (`e451af0` → `7b08c38`).** Continued the work tracked in `~/.claude/projects/-home-harryjrh-Geometric-Pattern-Creator/memory/project_pic_irregular_polygon_bugs.md` and `INVESTIGATION-PIC-IRREGULAR-POLYGON-BUGS.md`. Four commits today (after the previous session's `ddcad24` Bug-2 same-edge guard + `2632e69` Bug-1 halfSpan cap):
- `e451af0` — edge-ratio gate: polygons with shortest/longest edge ratio < 0.65 ("uneven") get a stricter `0.75 × halfSpan` cap on the asymmetric + both-positive-outside edge-slide branches. Per-ray fallback's nearest-crossing search also capped at halfSpan / 0.75 × halfSpan (same gate). Catches Floret θ=40°, Deltoid θ=30°/50°, Floret θ=30° fallback long-arms.
- `271168f` — drop edge-slide entirely on uneven polygons (both branches, regardless of arm length). Catches the slide-along-boundary visual artifact at Kisrhombille θ=72° (was 18.0-unit boundary slide; now V0 inside pair-A only). Cairo / Tetrakis preserved because they're even (ratio 0.73 / 0.71).
- `7b08c38` — updates `INVESTIGATION-PIC-IRREGULAR-POLYGON-BUGS.md` with before/after table.
- Regression tests added in `src/pic/pipeline.test.ts`: floret θ=40°, kisrhombille θ=72°, floret θ=30° (per-ray fallback). All 164 tests pass.

**Trade-off the user needs to verify visually:** uneven polygons (kisrhombille, deltoid) now produce sparse strand patterns at many θ — kisrhombille θ=30°-72° shows just 2 short arms (V0 inside pair-A only) instead of the previous 4-6 segs with visible boundary slides. The visual artifact ("running along the edge") is gone but figure richness is reduced. If sparseness reads too empty in browser, the documented next step is **centroid-routed strands** (forwardRay.origin → polygonCenter → backRay.origin V-shape, replacing the dropped edge-slide) — see Direction 3 in `INVESTIGATION-PIC-IRREGULAR-POLYGON-BUGS.md`.

**Status as of session end:** user said "make notes so I can close the session" — has NOT visually verified today's commits yet. Probe data in `src/pic/probe.test.ts`; run with `npx vitest run src/pic/probe.test.ts --reporter=verbose` for fresh per-θ segment lengths. Dev server on http://localhost:5173/ when picking back up. Affected tilings to spot-check: `kisrhombille`, `floret-pentagonal`, `deltoidal-trihexagonal`, `heptagonal-rosette`, `nonagonal-rosette`, `decagonal-rosette`, `cairo-pentagonal`, `tetrakis-square`.

---

**2026-05-18 — Step 17.13 vertex placement shipped (`24b0959` → `5cfdeb8`).** New Design-Phase + Place-mode authoring mode: anchor a regular n-gon at a Cell corner or inward-only Boundary corner, pick orientation from a discrete set of snap rotations. Sibling to edge placement (17.3) and boundary-section placement (17.12). Always-on, single-cell only in v1 (multi-cell composition deferred — mirrors 17.12c locked decision b).

Sub-steps landed:
- **17.13a (`24b0959`)** — `src/editor/vertexPlacement.ts`: `ExposedVertex` + `VertexKey` + `computeExposedVertices(cell)` (groups coincident corners, subtracts incident-tile wedges, boundary corners start from the inward wedge `(n-2)π/n` CCW for inward-only enforcement). `placeRegularNGonOnVertex(sides, edgeLength, vertex, rotation, id)` with vertex 0 at the anchor and edge 0→1 leaving at `rotation`. `vertexPlacementOrientations` emits flush-CW / centred / flush-CCW per open sector (collapsed to one when fits ≈ 0). `isVertexPlacementViable` body-overlap + inward-only guard. `viableSidesForVertex` + `hostTileForClick` (closest-tile-to-click disambiguation for the orientation reference — locked decision).
- **17.13b (`3949d7f`)** — `EDITOR_PLACE_TILE_ON_VERTEX { vertexKey, sides, rotation }` action; reducer single-cell-only, single or orbit dispatch. `placeTilesOnVertexOrbit` in `editor/orbit.ts` with `transformVertexRotation(s, rotation, sides)`: pure rotations shift by α, reflections use `2β - rotation + 2π/n + π` (derived from CCW-reversal — new tile's edge 0→1 corresponds to reflected old edge 0→(n-1)). All-or-nothing on viability; centroid dedup for fixed-axis orbit images. Added to `DESIGN_MODE_ACTIONS`.
- **17.13c (`36987ca` + `5cfdeb8` fix-up)** — `EditorVertexPlacementLayer.tsx` (diamond dots, dashed when boundary corner, renders LAST in editor overlay so vertex clicks win over edges/sections). `EditorPickerOverlay.tsx` extended with `mode: 'vertex' | 'edge'`. Vertex mode is two-page: page 1 = shape grid; page 2 = ‹ / › orientation arrows + label ("Flush ⟲ / Centred / Flush ⟳") + `1 / total` counter + Place / Back. Arrow keys + Enter shortcut. Translucent dashed polygon preview of the candidate tile renders on canvas via `placeRegularNGonOnVertex`. `onPlaceTileOnVertex` plumbed Canvas → TessellationLabMode → reducer. Selecting a vertex clears edge / section picker so only one overlay is open.
- **17.13d** — sign-off probes captured (see below). User verified in-browser ("looks good now"). The `5cfdeb8` fix-up bumped the orientation counter from hint-text concatenation to its own monospace line so the 1 / 2 / 3 cycling is obvious at a glance.

**Locked decisions (this conversation, 2026-05-18):**
| # | Question | Resolution |
|---|----------|-----------|
| a | UI mode | Always-on in Design Phase + Place mode (no toggle — mirrors 17.12c). |
| b | Direction picker | ‹ / › arrows cycle through *snap* orientations (flush-CW, centred, flush-CCW per open sector). No continuous rotation. |
| c | Host tile for orientation reference | Closest tile to click point. `hostTileForClick(vertex, cell, clickPoint)` resolves it. |
| d | Boundary corners | Selectable, inward-only (`isVertexPlacementViable` rejects candidates whose centre lies outside the Boundary polygon). |
| e | Symmetry | Orbit-propagate via `placeTilesOnVertexOrbit` — all-or-nothing, identical semantics to edge orbit. |

**Sign-off probes for 17.13** (run after C; user-verified for the canonical scenarios):
1. Square Seed in square boundary, click vertex of Seed → picker shows shape grid (page 1) with viable shapes lit.
2. Pick triangle → page 2 shows `Flush ⟲ · 1 / 3`, arrows enabled. Cycle: Centred · 2 / 3 → Flush ⟳ · 3 / 3 → wraps. Live preview tracks rotation on canvas.
3. Click Place → triangle lands at the vertex flush against the chosen Seed edge.
4. Undo → triangle removed, picker state cleared.
5. Click boundary corner with `noSeed: true` → vertex picker opens; only inward-extending orientations survive viability.
6. `symmetryMode = 'full'` square Cell + vertex click → orbit propagates: 8 tiles land at corner-equivalent positions of the Seed under D₄.
7. Save / load Patch with vertex-placed tiles → round-trips (no schema change; tiles serialise via existing `EditorTile` shape).
8. Vertex click while an edge picker is open → edge picker closes, vertex picker opens. Reverse direction also works (edge click while vertex picker open).
9. **Fix-up `5cfdeb8`** — orientation counter visibility: confirmed users can see all 3 orientations at a glance after the counter moved to its own line.

**Deferred / not in v1**:
- Multi-cell composition support (locked decision b inherited from 17.12 — currently the reducer refuses if `cells.length > 1`).
- Continuous-angle rotation (snap-only is locked).
- "Snap to viable" UX variants beyond the three snap kinds.

---

**2026-05-18 (earlier) — Step 17.12 rebuilt after design grill.** The 17.12c boundary-inward UI shipped earlier today was reworked end-to-end based on a follow-up grill:
- **Boundary-inward placement is now always-on** in Design Phase + Place mode (single-cell). The `EditorCell.boundaryInward` flag and `SET_EDITOR_BOUNDARY_INWARD` action were removed — the section picker is a standard part of design functionality, not a separate mode.
- **New `EditorCell.noSeed: boolean` + `SET_CELL_NO_SEED` action.** When on, the active Cell starts empty (no auto-placed Seed Tile). Refused if the Cell holds any non-Seed Tile (mirrors the existing Seed-sides slider lock). Toggling on wipes the Seed; toggling off re-creates it at the current `seedSides` + Patch `edgeLength`. Helpers tolerate empty Cells: `applyWrap` skips when `cell.tiles.length === 0`; `SET_CELL_SEED_SIDES` keeps `tiles: []` when noSeed is on. Migrator allows `tiles: []` only when `noSeed: true`.
- **`patch.edgeLength` reset is now first-only** (locked decision f honored). Proxy: `cell.tiles.length === (cell.noSeed ? 0 : 1)`. Avoids the silent Composition-lattice jump on every subsequent boundary placement.
- **Tile-priority on click overlap.** Section layer renders BEFORE the edge layer in the same `<g>`, so SVG hit-testing gives the edge layer z-priority on coincident pixels. Sections render transparent at rest (no visual clutter at the boundary), accent on hover/select only. No disambiguation modal in v1 — the soft cases (Seed fills Boundary → section viability rejects everything anyway; placed boundary tile shares an edge → both pickers either reject or place outside) are mostly handled by viability rules. Add the modal if UX reports demand it.
- **`originLocked` semantic corrected** in `EditorDesignControls`: was `cell.tiles.length > 1`; now `cell.tiles.some(t => t.source !== 'seed')` so the Seed-sides slider and No-Seed checkbox both lock properly when the Cell holds any placed/completed Tile (including the noSeed-on case with one placed Tile).
- **Disambiguation popup is deferred** — flagged in the grill as a fallback only if users report friction.

Build green (tsc + vite). **Manual smoke test still pending** — needs in-browser verification of (1) toggling No Seed wipes the Cell to empty, (2) clicking a section in an empty Cell places a tile, (3) Place-mode click on a coincident Tile edge opens the edge picker (tile-priority), (4) the edgeLength reset fires exactly once per Cell.



**2026-05-17 — Builder Complete-mode bug sweep in flight.** Detailed tracker at `BUG_DOC_4_8_8_COMPLETE.md` (root). Read that FIRST before any Complete-mode work; it has the full chronology, fixes (commits `39ff3d4`, `55af253`, `75d7995`, and one pending), open Bug 6 with a concrete re-test repro, and the file index. The summary below is preserved for the prior Phase 2/4/5/6 schema work.

**Last action:** 2026-05-16 — Phase 2 (introduce `EditorCell` + schema v3)
**BUILD GREEN — all 210 tsc errors resolved.** Every helper, the reducer,
and every UI component now operates on the v3 `EditorPatch.cells[]` shape
described in ADR-0001. `migrateEditorConfig` reads v1 / v2 / v3 and always
returns v3, so persisted Lab patches round-trip transparently.

**What changed since the WIP commit:**
- Helpers retargeted to `EditorCell` and given the Patch-shared `edgeLength`
  where they need it: `placement.ts`, `orbit.ts`, `complete.ts`,
  `completeN.ts`, `boundaryInward.ts`, `lattice.ts`, `autoComplete.ts`
  (`autoCompletePatch` → `autoCompleteCell`, `fitBoundarySize` takes
  `edgeLengthFloor`).
- `compositionLattice.ts` collapsed to a Patch walker
  (`compositionToPolygons` / `compositionBoundaryOutlines` /
  `compositionLatticeStamps` / `compositionOneRingStamps` iterate
  `patch.cells`).
- `nonTilingDetection.ts` is now per-Cell (`detectCellTilingStatus`); the
  Lab UI aggregates across `patch.cells` and surfaces the first non-tiling
  Cell as the Patch-level warning.
- `tileTypes.ts` walks `patch.cells` itself (single-Cell and multi-Cell
  Patches share one path).
- `createDefault.ts`: `createDefaultEditorConfig` produces v3 single-Cell
  shape; `createDefault488EditorConfig` produces v3 multi-Cell shape
  directly (no more separate `createDefault488Composition`).
- `migrations.ts` rewritten: v1 / v2 single-shape → one `EditorCell` with
  id `'main'`; v2 composition → each `BoundaryTile` becomes one
  `EditorCell`, lifting `configurationId` / `edgeLength` / `activeTileId`
  onto the Patch. Legacy `origin` / `originSides` field aliases preserved.
- `state/reducer.ts` rewritten: `updatePatch(...)` → `updateActiveCell(...)`
  routing through `withActiveCell`. All per-Cell field reads / writes
  (`shape`, `boundarySize`, `seedSides`, `alternateBoundary`,
  `symmetryMode`, `wrapBoundary`, `boundaryInward`) go through the active
  Cell. Patch-level fields (`edgeLength`, `configuration`, `autoComplete`)
  update the Patch directly. `SET_EDITOR_BOUNDARY_SIZE` multi-cell scales
  every Cell's centre + `boundarySize` + `patch.edgeLength` in lockstep
  (preserves the v2 4.8.8 invariant — Cell edge = lattice edge).
- `state/labDefaults.ts` `loadLabState` pipes any persisted `config.editor`
  through `migrateEditorConfig`; missing / invalid editor patches drop
  silently and the tiling type resets to `''`.
- `hooks/usePattern.ts` branches on `patch.cells.length > 1` instead of on
  `composition`; iterates `patch.cells` for multi-Cell.
- `components/Canvas.tsx` aggregates exposed edges / cycles / boundary
  corners / neighbour vertices from every Cell, transforming each via the
  Cell's `center` + `rotation` into Patch-local coords for rendering.
  Selected-edge viability uses the host Cell + `patch.edgeLength`.
- `components/TessellationLabMode.tsx` UI controls read from
  `activeCell(editor)` for Cell-level fields and `editor.configuration` /
  `editor.cells.length > 1` for multi-Cell branching.

**Commits to land:** the working tree has the full Phase 2 conversion
staged for one commit (`feat(editor): Phase 2 v3 schema migration — build
green`).

**Phase 4 action renames — DONE.** Build green; landed in the commit
after this Phase 2 commit:
- `SET_EDITOR_BOUNDARY_CONFIGURATION` → `SET_BUILDER_CONFIGURATION`
- `SET_ACTIVE_BOUNDARY_TILE` → `SET_ACTIVE_CELL`
- `SET_EDITOR_BOUNDARY_SHAPE` → `SET_CELL_SHAPE`
- `SET_EDITOR_BOUNDARY_SIZE` → `SET_CELL_BOUNDARY_SIZE`
- `SET_EDITOR_ORIGIN_SIDES` → `SET_CELL_SEED_SIDES`
- `DESIGN_MODE_ACTIONS` allowlist updated.
- `SelectedEdge.hostBoundaryTileId` (and `ExposedEdge.hostBoundaryTileId`)
  renamed to `hostCellId` across Canvas / EditorEdgeLayer /
  TessellationLabMode / exposedEdges.

`SET_ACTIVE_CELL` still uses payload key `tileId` (legacy) — deferred
along with the rest of the comment sweep so the rename + sweep stay
mechanical.

**Phase 5 comment sweep + payload rename — DONE.** Landed in the
commit after Phase 4. Build green.

- Code-comment vocabulary swept across Canvas.tsx, TessellationLabMode.tsx,
  PatternSVG.tsx, customTessellations.ts, mainConfigs.ts, editor/history.ts,
  editor/useEditorHistory.ts: "strand mode" → "Composition Phase",
  "design mode" → "Design Phase", "main mode" → "Gallery", "boundary
  tile" → "Cell", "strand-editor mode" → "Composition Phase".
- `migrations.ts` / `types/editor.ts` `BoundaryTile` mentions left as-is
  — those refer to the actual v2 legacy type names the migrator reads.
- `SET_ACTIVE_CELL` payload key renamed `tileId` → `cellId`
  (actions.ts + reducer.ts + 2 call sites in TessellationLabMode.tsx).

**Phase 6 — Lacing removal — DONE.** Landed in the commit after Phase 5.
Build green; bundle gzip dropped ~1.5kb.

- `PatternConfig.lacing` → `PatternConfig.strand: StrandStyle`
  (`{ width, color, background }`). `background` carries what
  `lacing.gapColor` had been doing as the canvas background.
- Action `SET_LACING` → `SET_STRAND_STYLE`.
- `StrandLayer.tsx` lost the over/under crossing detection, gap
  splitting, and two-pass render — now a single `<path>` per Strand.
- Sidebar Lacing collapsible section deleted; the Strand Thickness
  slider stays and dispatches the new action.
- Legacy `lacing` shape migrates to `strand` on load: file imports
  (`configValidation.ts:readStrandStyle`) + lab-state-v1 localStorage
  (`labDefaults.ts:loadLabState`).
- `feedback_lacing.md` memory deleted; `project_lacing_removal.md`
  captures the new state.

**Outstanding items** (deferred — not blocking):
- Identifier-level naming still uses some legacy terms (`editorStrandMode`
  prop, `editorPhase: 'design' | 'strand'` state). Strict SESSION_STATE
  scope was comments only; identifier renames can land later.

---

### ⚠ Phase 2 resume plan (FULLY COMPLETED — kept for reference)

**Branch state on resume:** the WIP commit (next session: look at the
most recent commit on this branch tagged `wip:`) introduces the v3 type
design in `types/editor.ts` and updates four helpers. The remaining ~20
files still reference v2 fields and fail to compile.

**What's already done** (committed as WIP — DO NOT push to main):
- `types/editor.ts` rewritten to v3 shape:
  - New `EditorCell` (id, shape, center, rotation, boundarySize,
    seedSides, tiles, alternateBoundary?, symmetryMode?,
    boundaryInward?, wrapBoundary?).
  - New `EditorPatch` (cells: EditorCell[], activeCellId, edgeLength,
    configuration?, autoComplete?).
  - `EditorConfig = EditorPatch & { version: 3 }`.
  - Legacy `BoundaryComposition`, `BoundaryTile`, `V2InnerPatch` kept
    as `@deprecated` types — read by migrator only.
  - `CellShape` is the canonical name; `BoundaryShape` is an alias for
    migration.
- `editor/active.ts` rewritten to v3 adapter:
  - `activeCell(patch)`, `allCells(patch)`, `withActiveCell(patch, cell)`,
    `withCellById(patch, id, cell)`. Replaces `activePatch` / `allPatches`
    / `withActivePatch`.
- `editor/buildEditorPolygons.ts` retargeted: `editorBoundaryVertices`
  and `editorTilesToPolygons` now take `EditorCell`.
- `editor/boundary.ts` retargeted: `computeAllCycles`,
  `computeOuterBoundary`, `computeBoundaryCycle` take `EditorCell`.
- `editor/exposedEdges.ts` retargeted: `computeExposedEdges(cell,
  edgeLength?)` takes `EditorCell` plus the optional Patch edgeLength
  for the conforming check.

**What's NOT done** (resume here, in this order):
1. `editor/placement.ts` — `isPlacementViable`, `placeRegularNGonOnEdge`,
   `viableSidesForEdge` take Cell input.
2. `editor/symmetry.ts` — already takes CellShape via `boundarySymmetries`;
   verify call sites pass cell.shape.
3. `editor/orbit.ts` — `orbitEdges`, `placeTilesOnOrbit`, `orbitTileIds`,
   `placePolygonsOnOrbit`, orbit-aware `viableSidesForEdge` take Cell.
4. `editor/complete.ts` + `editor/completeN.ts` — gap-fill operations
   take Cell; may also need Patch for cross-Cell context.
5. `editor/autoComplete.ts` — `autoCompletePatch` becomes
   `autoCompleteCell`; `fitBoundarySize` takes Cell.
6. `editor/boundaryInward.ts` — `computeBoundarySections(cell)`,
   `placeRegularNGonOnBoundarySection`.
7. `editor/lattice.ts` — `editorLatticeStamps` takes Cell;
   `editorOneRingNeighbourStamps` takes Cell.
8. `editor/compositionLattice.ts` — collapses substantially: under v3
   the multi-cell layout is just `patch.cells`. Functions become Patch
   walkers: `compositionToPolygons(patch)` iterates cells and stamps.
9. `editor/nonTilingDetection.ts` — Patch-vs-Cell-Boundary area compare.
10. `editor/tileTypes.ts` — `editorTileTypes(patch)` walks `patch.cells`;
    `seedFiguresForEditor` likewise.
11. `editor/createDefault.ts`:
    - `createDefaultEditorConfig` produces v3 single-cell shape.
    - `createDefault488Composition` / `createDefault488EditorConfig`
      collapse into one `createDefault488EditorConfig` producing v3
      multi-cell shape with `cells: [...]` directly.
12. `editor/sampleConfig.ts` — produce v3 shape.
13. `editor/migrations.ts` — rewrite to migrate v1 / v2 → v3:
    - v1 / v2 single-shape: wrap fields into one Cell (id: `'main'`);
      patch holds `cells: [cell]`, `activeCellId: 'main'`, `edgeLength`,
      `autoComplete`.
    - v2 composition: each `BoundaryTile` → `EditorCell`; collapse
      `BoundaryComposition.{configurationId, activeTileId, edgeLength}`
      onto `EditorPatch.{configuration, activeCellId, edgeLength}`.
    - Map legacy `BoundaryShape` octagon allowance: octagon now allowed
      on any Cell in a multi-cell Patch; single-cell Patches keep the
      triangle/square/hexagon restriction at the picker (not the type).
14. `state/reducer.ts` — every `updatePatch(state, p => ...)` becomes
    `updateCell(state, c => ...)` operating on `activeCell(patch)`.
    Action handlers that mutate Cell-level fields (boundaryShape →
    cell.shape, boundarySize → cell.boundarySize, seedSides → cell.seedSides,
    symmetryMode → cell.symmetryMode, alternateBoundary →
    cell.alternateBoundary, wrapBoundary → cell.wrapBoundary,
    boundaryInward → cell.boundaryInward) route via `withActiveCell`.
    Patch-level fields (edgeLength, configuration, autoComplete) update
    the Patch directly.
15. `state/labDefaults.ts` — initial state uses v3 shape.
16. `hooks/usePattern.ts` — branches once on `patch.cells.length > 1`
    rather than on `composition`; iterates `patch.cells` for multi-cell.
17. `rendering/PatternSVG.tsx` — boundary outline list comes from
    `patch.cells` rather than `composition.tiles`.
18. `components/Canvas.tsx` — `editor.cells.find(...)` lookups; remove
    `editor.composition` branches.
19. `components/EditorEdgeLayer.tsx`, `EditorPickerOverlay.tsx`,
    `EditorVertexLayer.tsx` — same shape navigation.
20. `components/TessellationLabMode.tsx` — heavy: navigate `patch.cells`,
    use `activeCell(patch)` for Cell-level field reads, route writes
    through reducer actions (most stay the same except for action
    renames in Phase 4).

**Strategy for the resume:** work bottom-up — fix helpers first
(steps 1–13), then reducer (step 14), then UI (steps 15–20). Each batch
should drop tsc errors monotonically. Commit when tsc passes; do not
push to remote until the build is green.

**Phase-4 / Phase-5 action items** (queued behind Phase 2):
- Rename reducer actions: `SET_EDITOR_BOUNDARY_CONFIGURATION` →
  `SET_BUILDER_CONFIGURATION`; `SET_ACTIVE_BOUNDARY_TILE` →
  `SET_ACTIVE_CELL`; `SET_EDITOR_BOUNDARY_SHAPE` → `SET_CELL_SHAPE`;
  `SET_EDITOR_BOUNDARY_SIZE` → `SET_CELL_BOUNDARY_SIZE`;
  `SET_EDITOR_ORIGIN_SIDES` → `SET_CELL_SEED_SIDES`. Update
  `DESIGN_MODE_ACTIONS` allowlist.
- Comment sweep: replace "strand mode" → "Composition Phase",
  "design mode" → "Design Phase", "main mode" → "Gallery", "boundary
  tile" → "Cell" in code comments.
- Lacing removal (per `feedback_lacing.md`) — currently broken; slated
  for reintroduction under Decoration Phase. Independent of the above.

---

### Vocabulary alignment session — what shipped

Shipped:
- `CONTEXT.md` — canonical glossary (Lab / Builder / Gallery, Patch /
  Cell / Boundary / Tile, Phase / Phase-switch, Ray / Strand / Figure,
  Tiling / Composition / Configuration, Seed Tile / Tile source).
- `docs/adr/0001` — Patch always has Cells (recursive shape, requires
  v2 → v3 schema migration).
- `docs/adr/0002` — Complete (not Fill) — Fill reserved for Decoration
  colour-fill.
- `docs/adr/0003` — Phase sequence Design → Composition → Framing →
  Decoration (last two reserved).
- `CLAUDE.md` — rewritten against the new vocabulary.
- `TESSELLATION_REVAMP_PLAN.md` + `RESEARCH-TILING-CONFIGURATIONS.md`
  + this file — vocabulary-mapping headers added (full-prose sweep deferred).
- UI labels — `TessellationLabMode.tsx`, `Sidebar.tsx`,
  `FigureControls.tsx`: Builder header, Gallery toggle, Ray length,
  Seed sides, Composition phase button, plus tooltips on Phase,
  Boundary, Editing Cell, Boundary size, Lattice edge, Complete,
  Strands, Lacing, Contact angle.

Commits: `a099e10` (docs + ADRs + CONTEXT.md), `f24cde2` (UI labels).

**Queued for next session — code-internal alignment** (deferred from this
session because it changes runtime behaviour / type shape and deserves
its own focused pass):
1. **Schema migration v2 → v3** per ADR-0001 — every `EditorPatch`
   carries `cells: EditorCell[]`; legacy `tiles[]` wraps into one Cell.
2. **Type renames**: `BoundaryTile` → `EditorCell` (or `Cell`),
   `BoundaryComposition` collapses into `EditorPatch.cells`,
   `EditorTileOrigin` value `'origin'` → `'seed'`, field
   `EditorTile.origin` → `EditorTile.source`, `originSides` →
   `seedSides`.
3. **Reducer action renames**: `SET_EDITOR_BOUNDARY_CONFIGURATION` →
   `SET_BUILDER_CONFIGURATION`, `SET_ACTIVE_BOUNDARY_TILE` →
   `SET_ACTIVE_CELL`, etc.
4. **Sweep code-internal comments** that still say "strand mode",
   "design mode", "main mode" (CLAUDE.md is the only doc that's been
   fully rewritten — large planning docs carry mapping headers only).
5. **Lacing removal** (per `feedback_lacing.md`) — currently broken;
   slated for reintroduction under Decoration Phase. Could happen
   independently.

**Prior in-flight work** (still pending — does not block the above):
Step **17.12 boundary-inward authoring mode** — sub-step A (foundation)
shipped in `8c935a2`. B (reducer + first-tile placement) and C (UI /
section highlights + mode toggle) are queued. The boundary-inward UI
copy should land in the new vocabulary from the start.

### What's in 17.12a (`8c935a2`)
- New `src/editor/boundaryInward.ts`:
  - `BoundarySection` interface (`edgeIndex`, `sectionIndex`, `p1`,
    `p2`, `midpoint`, `sectionLength`).
  - `SECTION_FRACTION_AT_MIN_SIZE = 0.30` /
    `SECTION_FRACTION_AT_MAX_SIZE = 0.10`, linearly interpolated over
    boundary size [80, 800] and clamped outside.
  - `sectionFractionForBoundarySize` + `sectionCountForBoundarySize`
    (count = `round(1 / fraction)` so each boundary edge divides
    evenly).
  - `computeBoundarySections(patch)` walks `editorBoundaryVertices`
    (honours `alternateBoundary`) and emits sections CCW.
  - `placeRegularNGonOnBoundarySection(sides, section, id)` builds a
    regular n-gon flush against the section on the interior side,
    with edge length = section length. CCW convention matches
    `placeRegularNGonOnEdge` (vertex 0 = `section.p2`, vertex 1 =
    `section.p1`).
- `EditorPatch.boundaryInward?: boolean` field added; migration in
  `src/editor/migrations.ts` accepts it so saved patches round-trip.
- **No reducer or UI yet** — strictly geometry + data model. App
  behaviour is unchanged on `main`-equivalent paths.

### Locked design decisions (this conversation, 2026-05-11)
| # | Question                       | Resolution |
|---|--------------------------------|-----------|
| a | Origin tile interaction        | **Keep both.** Origin tile and its exposed edges stay clickable. Boundary-section highlights are *additional* targets, not a replacement. |
| b | Composition scope              | **Single-shape only in v1** (triangle / square / hexagon). Composition (4.8.8) follows in a later arc. |
| c | Section schedule               | Linear: fraction 0.30 at boundarySize ≤ 80 → 0.10 at boundarySize ≥ 800, clamped. Section count = `round(1 / fraction)`. |
| d | First-tile shape               | Reuse `PICKER_SIDES = [3,4,5,6,7,8,9,10,12]`. Regular n-gons only. |
| e | Symmetry orbit                 | Route via `placeTilesOnOrbit` so `symmetryMode` behaves consistently with edge placement. `'none'` ⇒ single-section. |
| f | `patch.edgeLength` conflict    | **First boundary-section placement resets `patch.edgeLength`** to the section length. The pre-existing origin tile's exposed edges then become non-conforming (Decision 14a) and inert in the picker. |

### Sub-step plan (pick up here)
- **17.12b — Reducer.** New action `EDITOR_PLACE_TILE_ON_BOUNDARY_SECTION`
  payload `{ sectionIndex: number; edgeIndex: number; sides: number }`.
  Implementation outline:
  - Resolve the `BoundarySection` from the payload via
    `computeBoundarySections(activePatch)` and the `(edgeIndex,
    sectionIndex)` pair.
  - Build a tile via `placeRegularNGonOnBoundarySection`.
  - If `editor.symmetryMode && editor.symmetryMode !== 'none'`, route
    through `placeTilesOnOrbit` — needs a small extension since
    `placeTilesOnOrbit` currently takes an edge, not a section.
    Cleanest path: write a `placeTilesOnBoundarySectionOrbit` sibling
    that transforms the section under each symmetry element, builds
    the tile, and gates by overlap.
  - **Reset `patch.edgeLength = section.sectionLength`** before
    appending the tile so subsequent Place flow inherits the new
    edge length (decision f).
  - Re-seed figures via `seedFigures` + run `applyWrap` envelope (the
    standard tile-mutating envelope from the existing
    `EDITOR_PLACE_TILE_ON_EDGE` path).
  - Add action to `DESIGN_MODE_ACTIONS` for undo/redo coverage.
- **17.12c — UI.**
  - New `src/components/editor/EditorBoundaryInwardLayer.tsx`
    rendering the section highlights as clickable overlays inside
    `PatternSVG`'s `editorOverlay` slot. Mirror `EditorEdgeLayer`'s
    pointer-event pattern (invisible thick hit-area, stop pan).
  - Show this layer when `patch.boundaryInward && editorMode === 'place'`.
    Standard exposed-edge layer stays visible in parallel (decision a).
  - Checkbox **"Boundary-inward placement"** in
    `EditorDesignControls` — gates the new layer + persists with the
    patch. Disabled when composition is active (decision b).
  - Click a section → open the existing `EditorPickerOverlay` at the
    section midpoint → user picks an n-gon → dispatch
    `EDITOR_PLACE_TILE_ON_BOUNDARY_SECTION`. After commit, the picker
    closes.
  - When `patch.edgeLength` has been reset by a boundary placement
    (decision f), the origin tile's exposed-edge picker should
    render those edges dashed/inert — the existing `conforming` flag
    on `ExposedEdge` already handles this; no new code needed if
    `editor.edgeLength` is the comparison source of truth.

### Sign-off probes for 17.12 (run after C)
1. Square boundary at default size (400) + "Boundary-inward
   placement" off → no section highlights, behaviour identical to
   pre-17.12 (regression check).
2. Toggle Boundary-inward on with no tiles placed yet → boundary
   edges show ~10 section highlights (square edge 400 / section
   ~50). Hovering highlights one, click opens picker at midpoint.
3. Pick a 4-gon → square tile lands flush against the section on
   the interior side. Origin tile (the default centred square)
   remains. `patch.edgeLength` is now the section length.
4. Origin tile's exposed edges should now appear dashed/inert
   because their length no longer matches `patch.edgeLength`.
   Boundary tile's free edges expose normally.
5. Triangle boundary at min size (80) → ~3 sections per edge
   (fraction ≈ 0.30); hex boundary at large size (800) → ~10
   sections per edge (fraction ≈ 0.10). Visual count should
   match.
6. `symmetryMode = 'full'` + Boundary-inward + click one section →
   tile propagates to all orbit-equivalent sections. `'none'` +
   click one section → only that section fills.
7. Save / load patch with `boundaryInward: true` set →
   round-trips through `loadPatternConfig` and re-renders with the
   flag intact.
8. Undo after a boundary-section placement → tile removed,
   `patch.edgeLength` restored to its prior value (verifying the
   snapshot captures the edge-length reset).
9. Composition (4.8.8) → checkbox is disabled and section
   highlights don't render (decision b).

### Captured this session
- `/idea` — vertex placement with direction picker
  (`project_editor_vertex_placement_idea.md`). Sibling to 17.12.
  Tiles can be placed on a single vertex; picker gains a second
  page where the user picks the new tile's rotation around the
  shared vertex.

### Roadmap sync (2026-05-11)
- `project_editor_custom_boundary_idea.md` — promoted
  `LIVE 2026-05-10` → `DELIVERED 2026-05-10`.
- `project_editor_per_edge_placement_idea.md` — corrected RAW →
  `DELIVERED 2026-05-06` (already shipped at 17.4 re-enable via
  `symmetryMode='none'` default).
- `MEMORY.md` index reorganised into `## Delivered` and `## Ideas /
  Future` sections; duplicate framing/decoration entries removed.

---

**Earlier 2026-05-11 — Rosette figure type removed (`f7f812d`).**
Single-arc cleanup PR per the `/idea` memo. Star is now the only
strand figure type; the rosette-patch tessellations (pentagonal /
heptagonal / nonagonal / decagonal / hendecagonal / hexadecagonal)
and Taprats rosette presets are untouched per user scope decision.

- `FigureConfig.type` narrowed to `'star'`; `rosetteQ` / `rosetteS`
  fields dropped.
- `SegmentKind` no longer includes `'petal'`; the petal-emission
  block in `pic/index.ts` and the petal guards in
  `strand/computeCurves.ts` + `rendering/ControlPointLayer.tsx`
  are gone.
- `SET_ROSETTE_Q` and `SET_FIGURE_TYPE` actions deleted (no more
  button bar between star/rosette in Lab or Main).
- `FigureControls.tsx` lost `figType` / `rosetteQ` props and the
  Petal shape (q) slider. `Sidebar.tsx` + `TessellationLabMode.tsx`
  no longer plumb them.
- `loadPatternConfig` coerces legacy `type: 'rosette'` to `'star'`
  and strips `rosetteQ` / `rosetteS` so existing saved configs
  (file or localStorage) still load and render as plain stars.
- Memory: `project_remove_rosette_idea.md` deleted on delivery;
  `project_rosette_deprecated.md` also deleted (superseded — the
  feature is gone, no need to track "don't invest"). MEMORY.md
  index updated.

`npx tsc --noEmit` green, `npm run build` green, all 135 tests pass.

**Earlier 2026-05-10 — Editor v2 4.8.8 composition feature
parity with single-shape patches. Three tools added in one pass:

1. **Alternate orientation per active tile** — `SET_EDITOR_ALTERNATE_BOUNDARY`
   now routes through `updatePatch`, flipping just the active boundary
   tile's inner-patch boundary. The cell vectors + `BoundaryTile.center`
   / `rotation` are untouched so the unit cell still tiles by translation.
   Checkbox in `EditorDesignControls` no longer hidden under composition.
2. **Show neighbours preview in composition** — new
   `compositionOneRingStamps(composition)` in `compositionLattice.ts`
   returns 8 cell-level translation stamps. `usePattern` and the Canvas
   neighbour-vertex layer both branch on composition: ghost polygons +
   ghost boundary outlines + ghost outer-cycle vertex picks all stamp
   the merged unit cell (octagon + square together, per stamp).
3. **Cross-tile edit/delete in composition** — `ExposedEdge` and
   `SelectedEdge` gained an optional `hostBoundaryTileId`. Canvas
   aggregates exposed edges from every boundary tile (each tagged with
   host id) and renders each edge under its own `BoundaryTile`
   transform. `EditorEdgeLayer` disambiguates by all three keys.
   `TessellationLabMode.handleSelectEdge` auto-dispatches
   `SET_ACTIVE_BOUNDARY_TILE` when the user clicks an edge in a
   non-active host so the existing `EDITOR_PLACE_TILE_ON_EDGE` and
   `EDITOR_DELETE_TILE` reducer cases (which route through
   `activePatch`) target the right inner patch.

Round-trip verification: `migrateBoundaryComposition` /
`migrateBoundaryTile` / `migratePatchFields(allowOctagon=true)` already
cover composition save/load via `loadPatternConfig`; `structuredClone`
preserves the composition object intact through localStorage.

Earlier same day — Editor v2 boundary configurations
**4.8.8 (octagon + square)** went LIVE. Cell-edge slider behaves with
single-shape parity (scales cell + boundary outline + tile centres
but not the origin polygons). Tile placement (picker) was live in
composition. Wrap-boundary toggle worked per-active-tile.
Complete-mode vertices exposed across every boundary tile, and
completion routed to whichever tile actually hosted the picks.

Phase log:
- `93dcdd4` Phase 1 — `EditorPatch` + `src/editor/active.ts`
  adapter; ~12 helper signatures migrated. No behaviour change.
- `b3c98ee` Phase 2 — octagon polygon (`BoundaryShape += 'octagon'`,
  `BOUNDARY_SIDES[octagon]=8`, `BOUNDARY_ROTATION[octagon]=3π/8`,
  D8 symmetry). Octagon never assignable to a top-level
  `boundaryShape` (migration's allow-list keeps it inside
  `BoundaryTile.shape` only).
- `13a6a63` Phase 3 — `BoundaryComposition` + `BoundaryTile` +
  `EditorConfig.version: 2`. `createDefault488EditorConfig()` +
  `migrateEditorConfig` accepts both v1 (legacy) and v2 with
  optional composition.
- `1d30054` Phases 4 + 7 — two new actions:
  `SET_EDITOR_BOUNDARY_CONFIGURATION` (snapshots history) and
  `SET_ACTIVE_BOUNDARY_TILE` (pure pane swap, excluded). Existing
  per-patch reducer cases route via new `updatePatch` →
  `activePatch` / `withActivePatch`.
- `1a0a247` Phase 5 — `src/editor/compositionLattice.ts`:
  `compositionToPolygons`, `compositionBoundaryOutlines`,
  `compositionLatticeStamps` (4.8.8 cell vectors `(L(1+√2), 0)`
  and `(0, L(1+√2))`). `usePattern` branches once on `composition`.
- `d703dec` Phase 6 — picker now shows 4 entries (Triangle /
  Square / Hexagon / 4.8.8). Active-tile sub-picker
  ("Editing: [Octagon] [Square]") under composition. Single-shape
  controls (Alternate orientation, Boundary size, Wrap boundary)
  hide when composition is active. Strand panel aggregates tile
  types via `allPatches`. Canvas transforms picker overlay to
  cell-local while keeping validation in patch-local.

Bug-fix passes after Phase 6:
- `21d6609` activePatch / allPatches / withActivePatch were trivial
  passthroughs — composition mutations stripped the composition.
  Branch on `editor.composition`. Strand panel cards now aggregate
  both inner patches' tile types correctly.
- `e4ed2c1` Cell-edge slider was scaling everything proportionally
  (origin tiles too) — wrong parity. Slider now only updates
  `composition.edgeLength` + each `patch.boundarySize`.
- `f8ef4ac` Slider needed to also scale `BoundaryTile.center` so
  positions track the new cell vectors (otherwise octagon and
  square boundaries drifted apart and overlapped as the cell grew).
- `7814b46` (REVERTED in 6e44e69) — briefly emitted boundary
  outlines as polygons; broke single-shape parity (polygon scaled
  with slider).
- `6e44e69` Reverted to single-shape parity:
  `compositionToPolygons` returns the inner patch tiles (origin
  polygons, fixed size), boundary outlines stay visual via
  `compositionBoundaryOutlines`. Slider min clamped to 100 (the
  seeded edge) so dragging down can't pinch BoundaryTile centres
  past what fixed-size origin polygons can fit (the previous
  overlap symptom).
- `2cae2ad` SESSION_STATE log of the bug-fix arc + v1 design
  contract.
- `d67e3a7` Re-enabled the tile placement picker in composition
  mode (was hidden under v1 stance). Edges already computed in
  patch-local + parallel-transformed to cell-local for rendering;
  dispatch keys (tileId, edgeIndex) stable so EDITOR_PLACE_TILE_ON_EDGE
  routes through updatePatch correctly. At the seeded cell edge,
  origin = boundary so placements would land outside the cell —
  becomes useful once the user scales past 100.
- `34374b9` Wrap-boundary toggle for composition. Per-active-tile:
  fits `composition.edgeLength` to the active patch via
  `fitBoundarySize` and propagates to every BoundaryTile (boundary
  outline + scaled centres) so the 4.8.8 invariant — octagon edge =
  square edge = cell edge — holds. SET_EDITOR_BOUNDARY_SIZE clears
  wrap on every patch (manual override). SET_ACTIVE_BOUNDARY_TILE
  re-runs applyWrap after the pane swap so wrap follows the new
  active tile.
- `1fe08ee` Complete-mode vertex layer aggregates outer cycles +
  pocket cycles + boundary corners across every BoundaryTile
  (transformed via each tile's own centre + rotation). New reducer
  helpers `inverseBoundaryTransform` + `completeOnComposition` route
  EDITOR_COMPLETE_GAP / EDITOR_COMPLETE_N_GAP to whichever tile
  actually hosts the picks (active first, falling back to siblings).

**v1 design contract (4.8.8):**
- `composition.edgeLength` drives cell vectors and is the slider
  target. Seeded at 100 (matches `DEFAULT_EDGE_LENGTH`).
- Each `BoundaryTile.patch` has an origin tile sized to the seeded
  edge with `rotation = BOUNDARY_ROTATION[shape]` so origin = boundary
  outline at default.
- PIC processes the origin polygons; boundary outlines are visual
  only via `compositionBoundaryOutlines`. At the seeded edge the
  strand pattern reads as 4.8.8; scaling up grows the boundary frame
  around fixed origins (lattice tiles via the boundary outlines when
  `showBoundaryLattice` is on).
- Picker (`EditorEdgeLayer`) and Complete vertex layer
  (`EditorVertexLayer`) are both live. Picker edges come from
  `activePatch(editor)`; Complete vertex sets aggregate across every
  boundary tile in composition.
- Reducer routing through `activePatch` / `allPatches` /
  `withActivePatch` (`src/editor/active.ts`) is the single seam
  between wrapper-aware code (reducer, persistence, history,
  Canvas overlay coords) and per-patch consumers (every geometry
  helper). `withActivePatch` preserves composition; the wrapper
  mirrors the active patch's per-patch fields so legacy single-shape
  reads stay coherent.

**Architectural map (4.8.8 v1):**
- `src/types/editor.ts` — `EditorPatch` (per-patch shape) + `EditorConfig
  extends EditorPatch & { version, composition? }` + `BoundaryComposition`
  + `BoundaryTile`. `BoundaryShape = 'triangle'|'square'|'hexagon'|
  'octagon'`. Octagon never assignable as a top-level boundaryShape —
  migration's allow-list keeps it inside `BoundaryTile.shape`.
- `src/editor/active.ts` — `activePatch` / `allPatches` /
  `withActivePatch`. Composition-aware.
- `src/editor/createDefault.ts` — `createDefault488EditorConfig` +
  `createDefault488Composition`. Origin tiles seeded with
  `rotation = BOUNDARY_ROTATION[shape]` so origin = boundary at
  default.
- `src/editor/compositionLattice.ts` — `compositionToPolygons` (origin
  tiles, transformed), `compositionBoundaryOutlines` (visual outlines),
  `compositionLatticeStamps` (cell vectors at `composition.edgeLength`),
  `compositionCellBasis`. Triangle's intra-stamp pattern in
  `lattice.ts` is intentionally NOT reused (different semantics).
- `src/editor/migrations.ts` — `migrateEditorConfig` switches on
  `r.version` (1 = legacy single-shape; 2 = single-shape OR
  composition). v1 patches load with composition absent.
- `src/state/reducer.ts` — wrapper-aware. New actions
  `SET_EDITOR_BOUNDARY_CONFIGURATION` (history) +
  `SET_ACTIVE_BOUNDARY_TILE` (excluded — pure pane swap that re-runs
  applyWrap). Helpers `updatePatch`, `completeOnComposition`,
  `inverseBoundaryTransform`. `applyWrap` handles per-active-patch
  wrap fit in composition + propagates to every BoundaryTile.
- `src/hooks/usePattern.ts` — branches once on `composition`.
- `src/components/TessellationLabMode.tsx` — Boundary picker has
  4 entries (Triangle / Square / Hexagon / 4.8.8). Composition
  shows the "Editing: [Octagon] [Square]" segmented tab + a Cell
  edge slider (min 100, max 400) wired to SET_EDITOR_BOUNDARY_SIZE.
  Wrap toggle is shared with single-shape, scoped to active patch
  in composition. Strand panel aggregates tile types via
  `allPatches`.
- `src/components/Canvas.tsx` — picker overlay computes exposed
  edges in patch-local (active patch via `activePatch`), parallel-
  transformed to cell-local for rendering. Complete-mode cycles +
  boundary corners aggregate across every BoundaryTile in
  composition.

**Sign-off probes for the 4.8.8 boundary configuration:**

Single-shape regression:
1. New patch → triangle / square / hexagon → place + delete +
   Complete → undo / redo. Behaviour identical to pre-refactor.
2. Save to library + reload from library — single-shape patches
   survive.

4.8.8 composition:
3. New patch → Boundary picker shows **4.8.8** as a 4th entry.
4. Click 4.8.8 → octagon + square outlines render at their cell
   positions; "Editing: [Octagon] [Square]" appears under the
   picker; alternate orientation control hides; cell-edge + wrap
   boundary controls show, scoped to the active tile.
5. Active = Octagon → drag cell-edge slider up → octagon and
   square boundaries grow proportionally, origin polygon at each
   centre stays at its seeded size (single-shape parity).
6. Cell-edge slider min is 100; the slider can't drag below the
   seeded edge (which would pinch boundary centres tighter than
   the fixed-size origin polygons can fit).
7. Active = Octagon → toggle Wrap boundary on → cell-edge fits
   to octagon's tiles. Switch active to Square → wrap follows
   the new active tile (cell-edge refits to square).
8. Active = Octagon → click an exposed edge of an interior tile →
   placement picker opens at the cell-local edge midpoint →
   choose a polygon → tile lands inside the octagon's patch.
   Switch to Square → same flow lands inside the square's patch.
9. Complete mode → vertex layer shows dots from every boundary
   tile (octagon outer-cycle vertices AND square outer-cycle
   vertices, plus boundary corners + pockets if any). Picking
   two vertices from the same tile completes a gap inside that
   tile (router finds the right host tile from the picks; active
   tile is tried first). Picks split across tiles silently no-op.
10. Strand mode → cells stamp across the viewport via cell
    vectors at `composition.edgeLength`. With showBoundaryLattice
    on, octagon + square outlines tile cleanly at any cell-edge.
    PIC strands flow at shared edges when contact angles match.
11. Strand panel → cards appear for every distinct tile type
    across both inner patches (octagon-8, square-4, plus any
    user-placed shapes inside either).
12. Picking Triangle / Square / Hexagon while 4.8.8 is active →
    exits composition with a fresh single-shape patch in the
    chosen shape (destructive, undoable via the design-mode
    history stack).
13. Undo across composition switch → single-shape patch restored
    intact. Active-tile pane swap is **not** undoable (the active
    tile changes back via the picker, not via undo).
14. Save composition to Lab library + reload page → composition
    entry round-trips. saveJSON to file → loadJSON → both inner
    patches survive intact.
15. Load a legacy v1 single-shape patch (saved before this
    feature) → loads as v2 with composition absent.

**Previous milestone:** 2026-05-07 — Step **17.11b** (orbit
propagation for multi-vertex Complete) shipped + signed off
(`73f5f81`).

New `placePolygonsOnOrbit(editor, picks, idPrefix)` in
`src/editor/orbit.ts` mirrors `placeTilesOnOrbit`'s conventions:
applies each subgroup element to each pick, gates by
vertex-coincidence with the union of patch-outer / boundary /
pocket / neighbour vertex sets snapshotted from the initial
editor, dedups by tile centroid, and builds the placements
cumulatively against a working state — aborts (returns `null`)
if any orbit copy fails `completeNGap`. `symmetryMode='none'` ⇒
identity-only group ⇒ identical to 17.11 single-instance
behaviour. Reducer's `EDITOR_COMPLETE_N_GAP` now routes through
this helper instead of the bare `completeNGap`.

**Sign-off probes for 17.11b:**
1. `symmetryMode='none'` — multi-vertex Complete still produces
   exactly one tile (regression check vs. 17.11 sign-off probes).
2. Square + `'full'` (D4) + Ctrl-pick a corner-gap polygon →
   Enter → all 4 corners fill in one gesture.
3. Hexagon + `'full'` (D6) + Ctrl-pick a corner-gap polygon →
   Enter → all 6 corners fill.
4. Triangle + `'full'` (D3) + Ctrl-pick → all 3 corner gaps fill.
5. Square + `'rotation'` only + Ctrl-pick → 4 rotated copies fill,
   no reflections.
6. Square + `'vertical'` mirror only + Ctrl-pick on the right →
   the seed + the left mirror image fill (2 tiles).
7. Asymmetric patch — square + an extra placed tile that breaks
   D4 + `'full'` + Ctrl-pick a gap on the asymmetric side → only
   the seed places (orbit images that would land in non-existent
   gaps are silently dropped via the vertex-coincidence gate).
8. Cross-boundary case — square + `'full'` + Ctrl-pick spanning
   the boundary edge to a neighbour vertex → 4 corner-meet tiles,
   one per stamp corner.
9. Undo after orbit commit — Ctrl/Cmd+Z reverts the entire orbit
   set in one undo step (single action = single history entry).
10. Pick on the symmetry axis — Ctrl-pick 3 vertices that lie on
    the vertical mirror with `'full'` → the vertical-reflection
    orbit image deduplicates with itself (centroid dedup), no
    duplicate tile.

Earlier 2026-05-07 — Step **17.11** (multi-vertex Complete:

Earlier 2026-05-07 — Step **17.11** (multi-vertex Complete:
cross-boundary + enclosed pocket) shipped + signed off. First
sub-step of Step 17 v2 done. User confirmed multi-vertex
completions work, click order produces the expected polygon, and
the preview/hint UI guides cleanly. Tracking memo
`project_editor_complete_n_gap.md` deleted on delivery; `MEMORY.md`
line removed.

Two follow-ups captured in the plan (not blocking sign-off):
1. **Neighbour-vertex Ctrl/Cmd-click** — `b6a2568` moved
   `editorOverlay` to be the topmost child of the rotation `<g>` in
   `PatternSVG`. Strand strokes had been catching clicks at
   neighbour coordinates because they painted above the editor
   overlay. Awaiting browser confirmation that neighbour picks now
   register.
2. **Chord-mode click-on-neighbour silently no-ops.** No modifier
   + click 1 patch + click 1 neighbour → `completeGap` can't find
   the neighbour on any cycle → returns null, picks reset, no tile.
   Path forward: either auto-promote chord → multi when the second
   click lands on a neighbour, or refuse the click with a hint.
   Decide before next neighbour-fill iteration.

Locked design (this conversation):
- Click order = polygon order (user owns ordering).
- Validity: N≥3, simple polygon, centroid exterior to every existing
  tile. Mid-pick preview tints red while invalid.
- Cross-boundary tile = plain `EditorIrregularTile` straddling the
  boundary edge (Decision 5 covers it; no new tile kind).
- No pocket auto-detect — pocket cycle vertices are merely *exposed*
  as click targets. User picks them like any other vertex.
- Plain (no-modifier) 2-vertex chord flow unchanged — Ctrl/Cmd is
  purely the "I want N>2" modifier.
- Releasing Ctrl/Cmd does **not** commit; picks remain visually
  highlighted. **Enter** commits, **Esc** cancels.
- Symmetry-orbit propagation parked as 17.11b follow-up.
- Standard `ctrlKey || metaKey` cross-platform.

**17.11 commit chain (2026-05-07):**
- `9f505a6` — plan + cycle detection (17.11.0).
- `06011b5` — pocket + neighbour vertex exposure (17.11.1+17.11.2).
- `424dee4` — multi-pick state machine (17.11.3).
- `80fbc2c` — completeNGap + Enter to commit (17.11.5+17.11.6).
- `9406ee9` — preview polygon with validity tint (17.11.4).
- `1a64d8f` — progress notes + sign-off probes.
- `b6a2568` — fix: 17.11.7 layer-order (neighbour-vertex clicks).

**Sign-off probes for 17.11.7:**
1. Existing 17.5 chord regression — square + 4 corner triangles → no
   modifier → click 2 adjacent triangle apexes → corner gap fills as
   today (one tile, single click sequence).
2. Enclosed pocket — build a patch with an interior triangular hole
   (3 tiles forming a triangular gap inside the patch). Pocket
   vertices should appear as accent-tinted dots distinct from the
   outer-cycle dots. Ctrl/Cmd-click the 3 pocket vertices in CCW
   order → preview polygon shows accent fill → press Enter → one
   irregular tile fills the pocket. Subsequent click on an outer
   vertex without modifier should start a fresh chord pick (not
   extend the previous multi-pick).
3. Cross-boundary — square or hex patch with one or two corners
   missing → "Show neighbours" on → ghost dots at neighbour stamps'
   outer cycles render at ~0.45 opacity. Ctrl/Cmd-click 1 patch
   vertex + 2 neighbour vertices forming a corner-gap polygon →
   Enter → tile commits with vertices straddling the boundary.
   Strand-mode lattice should show one continuous fill at the
   meeting point (not three sub-pieces).
4. Self-intersection — Ctrl/Cmd-click 4 vertices in a bowtie order
   (2 patch + 2 across) → preview tints red with dashed stroke →
   Enter no-ops → Esc clears.
5. Centroid-inside-tile — Ctrl/Cmd-click 3 vertices that bracket
   tiles (rather than a gap) → preview tints red → Enter no-ops.
6. Duplicate vertex — Ctrl/Cmd-click the same vertex twice →
   preview tints red.
7. Esc cancellation — at any pick depth, Esc clears all picks
   (chord OR multi).
8. Cancel button — at picks.length ≥ 1, Cancel button shows in the
   hint area; click it → all picks cleared.
9. Undo — after a multi-vertex commit, Ctrl/Cmd+Z reverts the
   completed tile (action is in DESIGN_MODE_ACTIONS).
10. Cross-platform — on Mac, Cmd-click engages multi mode the same
    as Ctrl-click on Linux/Windows.

If 17.11.7 finds bugs, fix them as a follow-up commit before sign-off.
After sign-off, delete `project_editor_complete_n_gap.md` from memory
and remove its line from `MEMORY.md` (per memory hygiene rule).

**Parked follow-up:** 17.11b — orbit propagation for multi-vertex
Complete (apply `editor.symmetryMode` to mirror the completed polygon
across the orbit, the way 17.4 mirrors `EDITOR_PLACE_TILE_ON_EDGE`).

Earlier 2026-05-06 — Step 17.4 re-enabled + signed off.
Symmetry-axis subgroup picker (`9015ac0`) plus follow-up fix
(`7be4ef4`) so the polygon picker hides side counts whose orbit
images would fail viability (the original symptom: octagon offered
on a square origin under Full mode, click silently did nothing).
Default mode is `'none'` (legacy 17.3 behaviour); user opts into
`'full' | 'rotation' | 'vertical' | 'horizontal'` via the
`<select>` between Origin sides and Wrap boundary in the Editor
Design controls. Triangle hides "Horizontal mirror" since
equilateral triangles have no horizontal mirror axis. Idea memo
deleted on delivery; plan decision row flipped from archived to
re-enabled. Two related ideas remain captured for future work:
`project_editor_cross_boundary_complete_idea.md` and the new
`project_editor_enclosed_pocket_idea.md` (multi-vertex-gap → one
tile mechanic).

Earlier 2026-05-06 — Lab UI polish: collapsible sections
+ custom Save/Rename modal (`69e1f7b`, fix `9ddb1d5`). All four
sidebar sections (Editor / My Tessellations / Strands / Display)
now have chevron-toggle headers matching Main mode; open/closed
state persists per-section to `lab-sidebar-collapsed-sections` in
localStorage. New `src/components/TextPromptModal.tsx` replaces the
two `window.prompt` calls with an in-app dialog (Esc / backdrop /
Cancel dismiss; Enter to confirm; focus + select on open; empty
input disables confirm). The modal sits at `--bg-elevated` so it
reads opaque against the canvas (initial commit used a non-existent
`--bg` variable that fell through to transparent — fix in
`9ddb1d5`).

Earlier 2026-05-06 — sub-step **17.9** code-complete:
undo / redo (Q12). New `src/editor/history.ts` defines
`DESIGN_MODE_ACTIONS`, `HISTORY_DEPTH = 50`, and
`HISTORY_COALESCE_MS = 500`. New `src/editor/useEditorHistory.ts`
hook wraps the base dispatch — for any action in
`DESIGN_MODE_ACTIONS`, snapshots the prior `EditorConfig` to a `past`
stack (capped at 50, FIFO eviction); consecutive same-type actions
within 500ms coalesce into one entry so a slider drag is one undo
step. `LOAD_CONFIG` clears the entire stack. New action
`EDITOR_RESTORE_SNAPSHOT` (payload `EditorConfig | null`) is the
restore primitive used by undo/redo: when payload is null it drops
`editor` and zeroes `tiling.type`, otherwise it sets `editor` and
re-seeds figures (no `applyWrap` — snapshot already carries its own
boundary size). Strand-mode actions (figure tuning, lacing, curves)
explicitly bypass the stack so flipping back from Strand never
resurfaces stale figure tuning. Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z
(plus Ctrl+Y) bound globally while Lab is mounted; ignored when
focus is in an input/textarea/select so the library Save / Rename
prompts aren't hijacked. `EditorDesignControls` gained an Undo /
Redo header row above the Phase toggle, visible in both phases per
Q12 ("preserved across Design ↔ Strand flips").

Earlier: 2026-05-06 — sub-step **17.8** code-complete:
persistence validation + migration scaffold. New
`src/editor/migrations.ts` exports `migrateEditorConfig(unknown)`:
takes an unvalidated value (from JSON / localStorage), checks shape,
returns a clean `EditorConfig` or `null`. The version dispatch is the
intended hook for future `EditorConfig.version` bumps; only `1` is
valid today. New `src/state/configValidation.ts` exports
`loadPatternConfig(unknown)` + `ConfigValidationError`: validates
`tiling`, `figures`, `lacing`; rejects retired tiling types
(`layered-mandala`, `composition`); routes the optional `editor`
field through `migrateEditorConfig`. `loadJSON` now returns a
validated `PatternConfig` and rejects with a `ConfigValidationError`
on malformed input; `App.handleLoadJSON` surfaces the message via
`window.alert`. `customTessellations.listSavedTessellations` runs
each entry through `loadPatternConfig` and skips bad rows with a
warning so one corrupt entry doesn't blank the whole library.

Earlier 2026-05-06 — UI move: auto-complete checkbox now lives inside
the Mode section's Complete branch; only surfaces when Complete is
selected (`af06d66`). Wrap boundary stays above the Mode toggle since
it applies in both Place and Complete.

Earlier: 2026-05-06 — split 17.7's `match-boundary` flavour
out into a separate design-mode "Wrap boundary" toggle. Auto-complete
keeps its single checkbox (no dropdown) and always runs until-convex
on Design→Strand flip. `EditorConfig.wrapBoundary` is a new optional
flag; when on, `applyWrap` recomputes `boundarySize` to hug the patch
after every tile mutation (place / complete / delete / origin-sides /
boundary-shape / alternate / auto-complete run). Manual drag of the
boundary-size slider clears the flag, so the slider stays meaningful
when wrap is off. New reducer helper `applyWrap(state)` threads the
fit through tile-mutating cases. Type / action changes:
`AutoCompleteFlavor` removed; `SET_EDITOR_AUTO_COMPLETE_FLAVOR`
removed; `SET_EDITOR_WRAP_BOUNDARY` added. `autoCompletePatch` no
longer takes a flavor and returns `{ tiles }` only — `fitBoundarySize`
is the standalone helper for wrap. UI in `EditorDesignControls`:
"Auto-complete on entering Strand editor" + "Wrap boundary"
checkboxes; small caption under the boundary-size slider when wrap
is on ("Driven by Wrap boundary — drag to override.").

Earlier: 2026-05-05 — sub-step **17.7** code-complete:
auto-complete on flip (Decision 11). New `editor/autoComplete.ts`
exports `autoCompletePatch(editor)` and `fitBoundarySize`.
Walks the patch's outer cycle (CCW, via existing
`computeOuterBoundary`), finds the first reflex vertex (cross of
incoming × outgoing edges < 0), and dispatches `completeGap` on the
prev/next neighbours; loops up to 64 passes or until convex.
`EditorConfig` gained an optional `autoComplete?: { enabled }`
field; new reducer actions `SET_EDITOR_AUTO_COMPLETE_ENABLED` and
`EDITOR_RUN_AUTO_COMPLETE`. The latter is idempotent on already-
convex patches. `EditorDesignControls` shows an
"Auto-complete on entering Strand editor" checkbox.
`TessellationLabMode` dispatches `EDITOR_RUN_AUTO_COMPLETE` on the
Design→Strand transition when the opt-in is on. Auto-completed
tiles persist as first-class `'completed'` polygons (Decision 16)
so flipping back to Design leaves them editable / deletable.

Earlier: 2026-05-05 — sub-step **17.6** code-complete in two
parts.

**17.6a (`7056a9f`)** — canonical-signature `tileTypeId` for irregular
tiles per Q11 (Option B): regular `"<n>"`, irregular
`"<n>i:<8-char hex>"` from interior-angles + edge-length-ratios
quantised to 4 d.p., reduced to lex-min cyclic / reflective rotation,
FNV-1a hashed. New `editor/tileTypeId.ts` + `editor/tileTypes.ts`
expose `tileTypeIdFor`, `tileTypeLabel`, `editorTileTypes`,
`seedFiguresForEditor`. Reducer's editor cases all run through a
`seedFigures` helper (Q15: lazy + additive — deletes never strip
figures, so re-placing the same shape restores tuning). Strand panel
in Lab now lists one card per distinct tile type in the patch
("Triangle" / "Square" / … for regulars; "Irregular A/B/C…" for
irregulars in first-seen order).

**17.6b** — strand-editor lattice preview + Design / Strand phase
flip. New `editor/lattice.ts` returns translation-stamps covering the
viewport for square (basis (L,0)/(0,L)) and hex (basis (√3·L,0) /
(√3·L/2, 1.5L)). Triangle defers to a follow-up (needs 2-orientation
alternation); strand mode on a triangle boundary shows a single
stamp with an explanatory note. `usePattern` accepts an
`editorStrandMode` flag; when on, it generates polygons by stamping
`editorTilesToPolygons` at every lattice translation, runs PIC over
the whole stamped set, and returns no `boundaryOutline`. `Canvas`
hides the edge / vertex / picker overlays in strand mode.
`TessellationLabMode` owns a `editorPhase: 'design' | 'strand'`
flag (UI-only); `EditorDesignControls` shows a Design / Strand
editor toggle at the top, and in strand phase replaces the design
rows with a hint card.

Earlier: 2026-05-05 — sub-step **17.5** code-complete:
manual Complete operation. Single-gap version (no orbit propagation
since 17.4 is parked). New `editor/boundary.ts` walks exposed edges
into a CCW outer-boundary cycle. New `editor/complete.ts` resolves
the gap between two picked vertices by trying both arcs and keeping
the one whose chord-and-arc polygon's centroid is **outside** the
patch (handles concavities + rejects convex-side chords); then
prefers a regular-polygon fit (sides + angles within tolerance) and
falls back to an irregular `EditorIrregularTile` per Decision 10/12.
New reducer action `EDITOR_COMPLETE_GAP` (payload `{pA, pB}`). New
`EditorVertexLayer` SVG layer of clickable boundary dots; `Canvas`
swaps it in for the edge layer when `editorMode === 'complete'`.
Editor section now has a Place / Complete mode toggle + a hint
caption, with Esc / Cancel to drop a half-completed pick. Acceptance
probe: square origin + 4 placed triangles → switch to Complete, click
two adjacent triangle apexes → corner gap fills with an isosceles
(irregular) tile.

Earlier same day — boundary-size + origin-sides UX
follow-ups. Per-shape default boundary edge lengths
(`DEFAULT_BOUNDARY_SIZE_BY_SHAPE = { triangle: 460, square: 400,
hexagon: 200 }`) so all three boundaries read at a comparable visual
scale; slider max bumped 500 → 800. `SET_EDITOR_BOUNDARY_SHAPE` now
also snaps `boundarySize` to the new shape's default (consistent
with the existing tile-reset semantics). Origin-sides slider is
greyed out and labelled "Locked — clear the patch to change the
origin shape" once any tile beyond the origin has been placed, so a
stray drag can't wipe the patch.

Earlier same day: sub-step **17.4 archived** the same
day it was built. Built first as `e30fdb9` (orbit-symmetric
placement + delete under D3/D4/D6), then the user tried it in the
browser and didn't like how it felt — but wasn't yet sure what
alternative they wanted. Rather than iterate blindly we **parked
the whole feature**: moved `editor/symmetry.ts` and `editor/orbit.ts`
to `archive/editor-orbit-17.4/` (with a restoration `README.md`),
and reverted the reducer to 17.3's single-edge placement + tile
delete. The `project_editor_symmetry_axes_toggle_idea.md` `/idea`
was updated to note that re-enabling propagation should be bundled
with a symmetry-axis subgroup picker (full / rotation-only /
vertical / horizontal / none) — it shouldn't ship as full-D_n-by-
default again.

Earlier: 2026-05-04 — sub-step **17.3** shipped (`ccc7da0`):
single-edge tile placement. New geometry helpers
`computeExposedEdges`, `placeRegularNGonOnEdge`, `isPlacementViable`
(Decision 7 angle-sum check + Decision 14a non-conforming gate),
`viableSidesForEdge` filtering `PICKER_SIDES = {3,4,5,6,7,8,9,10,12}`.
New `EditorEdgeLayer` renders inside `PatternSVG`'s rotation `<g>`
via a new `editorOverlay` slot — each exposed edge has an invisible
hit-area; pointer events stop propagation so pan doesn't fire.
Non-conforming edges render dashed and inert. New
`EditorPickerOverlay` is a screen-space HTML popover positioned via
a new `worldToScreen` helper in `Canvas` that respects pan, zoom
and the rotation `<g>`. New reducer action
`EDITOR_PLACE_TILE_ON_EDGE` re-validates and appends a placed tile.
`TessellationLabMode` owns `selectedEdge` state and dispatches the
placement. Awaiting visual sign-off.

Earlier: 17.2 shipped 2026-05-04 (`f9d6197`) — Design-mode shell;
follow-up `0aff7fb` resets placed tiles when shape / origin sides
change. 17.1 shipped 2026-05-03 (`e199aee`) — data model +
read-only render. `94f651c` made Lab editor-only.

**2026-05-06 — Step 17.4 re-enabled + signed off** (`9015ac0` +
fix `7be4ef4`). Restored `src/editor/symmetry.ts` +
`src/editor/orbit.ts` from `archive/editor-orbit-17.4/` and
parameterised `boundarySymmetries(shape, mode)` with the new
`SymmetryMode` = `'full' | 'rotation' | 'vertical' | 'horizontal'
| 'none'`. Default on `editor.symmetryMode` is absent → reads as
`'none'` (current 17.3 single-edge behaviour) so legacy patches
load unchanged. Reducer's `EDITOR_PLACE_TILE_ON_EDGE` and
`EDITOR_DELETE_TILE` route through `placeTilesOnOrbit` /
`orbitTileIds` when mode ≠ none; orbit-aware delete filters the
origin tile out defensively. Picker UI in `EditorDesignControls`
is a `<select>` between Origin sides and Wrap boundary;
"Horizontal mirror only" is hidden for triangle (no horizontal
mirror axis on an equilateral triangle).
`SET_EDITOR_SYMMETRY_MODE` is a design-mode action so undo/redo
covers it. Follow-up fix (`7be4ef4`): `viableSidesForEdge` in
`orbit.ts` runs an orbit-wide probe so the picker hides side
counts whose orbit images would fail viability — replaces the
silent-fail behaviour the user hit on octagon-into-square. Plan
doc decision row for 17.4 flipped from archived to re-enabled.
Idea memo `project_editor_symmetry_axes_toggle_idea.md` deleted
(DELIVERED).

**2026-05-06 — Steps 17.6c + 17.6d signed off.**

**17.6c — Triangle strand-mode lattice.** `editorLatticeStamps`
now handles triangle via a 2-orientation cell (source + 180°-flipped),
basis derived from boundary edge midpoints (handles
`alternateBoundary` for free). `usePattern`'s strand-mode stamping
applies stamp rotation around the patch centroid before translation,
for polygons and the optional boundary-lattice outlines.
`supportsLatticePreview` returns true for all shapes now.

**17.6d — Design-mode neighbour preview.** "Show neighbours" toggle
in Editor Design controls renders one ring of low-opacity ghost
stamps around the patch. `editorOneRingNeighbourStamps` returns 8
offsets for square, 6 for hex, 3 for triangle (the edge-shared
down-triangles flipped 180°). Two sub-toggles when on: "Show
boundaries" (ghost outlines via `boundaryOutlines`) and "Show
strands" (ghosts join the PIC input so strands flow across stamp
edges). Disabled while `wrapBoundary` is on (boundary moves mid-edit).
Standalone preview; cross-boundary Complete fill (the 17.5b idea)
stays parked but is easier to plan for now that gaps are visible.

**2026-05-06 — Main "My Patterns" library shipped + signed off.**
Reversed plan decision #10. New `state/configLibrary.ts` factory
(storage-key parameterised) backs both libraries.
`state/customTessellations.ts` became a thin wrapper using
`lab-tessellations-v1`; new `state/mainConfigs.ts` wraps
`main-configs-v1` so namespaces stay separate. UI lifted into
`components/ConfigLibraryPanel.tsx` and plugged into both Lab's
"My Tessellations" and Main's new "My Patterns" sidebar section
(between Display and Export). Panel takes a controlled `activeId`
so external resets — Lab's Clear / New / Sample, Main's Load JSON
— can wipe selection.

**17.9 signed off 2026-05-06** — undo/redo confirmed working.

**2026-05-06 — sub-step 17.10 code-complete: non-tiling patch
detection + UI tag.** New `src/editor/nonTilingDetection.ts`
exports `detectPatchTilingStatus(editor)` — shoelace-area compare
of `computeOuterBoundary` vs `editorBoundaryVertices` with a 1%
relative tolerance. Returns `{ kind: 'tiling' }` or
`{ kind: 'non-tiling', reason: 'underfills' | 'overflows' | 'empty' }`.
`TessellationLabMode` renders a small `NonTilingWarning` block
inside the strand-mode info card when the status is non-tiling
("Patch doesn't fill the boundary — stamped copies will leave
gaps." / "Patch extends past the boundary — stamped copies will
overlap."). Diagnostic only; no auto-fix per scope. This is the
last v1 sub-step — Step 17 v1 complete pending visual sign-off.

**Next action:** Step 17 v1 is feature-complete. All shipped
sub-steps (17.0–17.10, plus 17.4 re-enabled) are signed off
through 2026-05-06. Pick-up options for the next session, in
rough priority order (no commitment yet):

1. **Cross-boundary Complete fill** + **enclosed-pocket Complete
   fill** (`project_editor_cross_boundary_complete_idea.md` +
   `project_editor_enclosed_pocket_idea.md`). Captured as related
   ideas — both about resolving multi-vertex gaps as a single
   irregular tile rather than as N pieces. Co-design recommended.
2. **Step 15** k-uniform tiling generator (parked).
3. **Step 16** quasi-periodic tilings (parked).
4. **Step 18** Girih substitution (parked).
5. Other Lab UX or strand-rendering polish — open list.

17.8 sign-off probes (carried forward — confirm before 17.9 sign-off):
1. Save 3 patches across categories → reload → all persist.
2. Save → load JSON round-trips wrap/auto-complete flags.
3. Devtools-corrupt one library row → bad row skipped on reload.
4. Import unrelated JSON → friendly alert.

17.7 sign-off probes (2026-05-06) — confirmed working:
- Auto-complete checkbox alone fills concave dents on flip.
- Wrap boundary toggle on → boundary hugs patch live in Design.
- Build out tiles with wrap on → boundary follows.
- Drag boundary-size slider with wrap on → wrap clears, slider takes
  over.

After 17.7 sign-off:
1. New square patch + a few placed tiles → flip to Strand editor →
   patch should appear stamped on a square grid covering the viewport.
   Strand panel cards drive global strand tuning.
2. Hex patch with placed tiles → strand mode → hex lattice stamping.
3. Triangle patch → strand mode → single stamp with the deferred-lattice
   notice.
4. Place a tile in design mode, flip to strand, edit contact angle,
   flip back to design — the figure tuning should persist (Q15
   stickiness).
5. Build a patch with one irregular completed tile and one regular
   placed tile → strand panel should list both as separate cards
   ("Irregular A" + "Triangle" or similar).

**17.5 deferred items still in 17.6a:** none — canonical-hash + lazy
seeding shipped here. **17.6c follow-up:** triangle 2-orientation
lattice (alternating up/down stamps). Will file as `/idea` if you want
to formally park it.

Visual sign-off on 17.5 probes:
1. New square + place 4 triangles on its edges → Complete mode →
   pick two adjacent triangle apexes (across one corner) → the
   corner gap fills.
2. Repeat the click for the other 3 corners → all 4 corners filled.
3. Hex origin + place 6 triangles → Complete the corner gaps.
4. Convex chord (pick two non-adjacent vertices on a still-convex
   patch) → no fill (gap centroid is inside the patch, rejected).
5. Pick a vertex twice → cancels the pick (no fill).
6. Cancel button + Esc both reset the half-completed pick.

Strand rendering on irregular completed tiles will look provisional
until 17.6 (canonical-signature hash + per-polygon synthetic
figures-map). That's deferred and expected.

**17.4 parking note:** archived under `archive/editor-orbit-17.4/`.
When the user is ready, re-enable bundled with the symmetry-axis
subgroup picker (see `project_editor_symmetry_axes_toggle_idea.md`)
— don't ship full-D_n-by-default again.

**17.3 visual review (2026-05-04):** user confirmed it works well
overall. Two follow-ups landed in the same session:
1. Picker icon contrast — buttons were too dark; switched to
   accent-bordered + accent-coloured icons (`fix(picker): brighten
   icons` follow-up commit). Look for further refinement if still
   under-contrast in light theme.
2. Overlap detection — angle-sum at shared endpoints missed
   non-adjacent tile overlaps for large candidate n-gons (e.g.,
   placing a 12-gon on a small square's edge wrapping past
   neighbours). `isPlacementViable` now also runs a centre-in-polygon
   check both ways via `pointInPolygon` against `regularPolygonVertices`
   of the candidate. Should catch the cases the user saw.

**17.3 deferred:** symmetry conservation is *not* enforced on
single-edge placements — the user can still build asymmetric
patches. Captured as `/idea`
(`project_editor_symmetry_enforcement_idea.md`, MEMORY.md updated).
Decision: defer until 17.4 lands the orbit, then optionally add a
"Strict symmetry" checkbox that *refuses* asymmetric placements
(distinct from 17.4's default which *propagates* placements
across the orbit).

**To rebuild context in a fresh session, read:**
1. This file (status anchor).
2. `TESSELLATION_REVAMP_PLAN.md` — full plan, Steps 4–8 / 12 / 13 marked
   ARCHIVED but kept for design history. The Step 17 brief at the bottom
   is the live one.
3. `archive/tessellation-lab/README.md` — what's archived and which
   helpers may be worth lifting back into the editor.
4. `CLAUDE.md` (project) — repo conventions and architecture overview.

---

## Goal
Improve tessellation options and add UI customisability. The user-editable
tessellation editor (Step 17) is the remaining ambition; everything else
on the original plan has either shipped, been archived, or been parked.

## Terminology (locked 2026-04-26)
- **Tessellation** — underlying polygon tiling (squares, hexagons, etc.).
- **Strand** — a line in the decorative PIC pattern overlaid on a tessellation.

UI strings use these. Internal code still uses "tiling" / "lineLength" in
some identifiers; deferred refactors, not user-visible.

## Status snapshot

Plan steps live in `TESSELLATION_REVAMP_PLAN.md`. One-liner status:

- [done] Phase 0 — architectural decisions, terminology, Option-B restructure
- [done] Steps 1–3 — Lab scaffold + existing tessellations + hexadecagonal-rosette
- [archived 2026-05-03] Steps 4–8 — preset catalogue, mandala engine + presets, composition + presets
- [done] Steps 9–11 — Lab polish, `FigureControls` lift, Lab Strands panel
- [archived 2026-05-03] Steps 12–13 — mandala strand renderer, composition strand renderer + match-up
- [done] Step 14 — Lab-local library (`state/customTessellations.ts`)
- [done] **Step 17 v1** — user-editable tessellation editor. 17.0–17.10 shipped + signed off. 17.4 re-enabled 2026-05-06 behind the `SymmetryMode` subgroup picker.
- [parked] Steps 15, 16, 18 — k-uniform generator, quasi-periodic, Girih substitution

## Live architecture (post-cleanup, post-17.3)

- `TilingCategory` = `'archimedean' | 'rosette-patch'` (live tree). The
  editor patch is signalled by `tiling.type === 'editor'` plus
  `config.editor` payload — it has no `TilingDefinition` entry because
  it doesn't fit the static-tiling schema.
- `PatternConfig` carries `tiling`, `figures`, `lacing`, optional
  `edgeAngles`, optional `smoothTransitions`, and **optional `editor?:
  EditorConfig`** (Q13 Option C). `EditorConfig` has its own inner
  `version: 1`.
- `EditorConfig` shape: `{ version, boundaryShape, boundarySize,
  originSides, edgeLength, autoComplete?, wrapBoundary?, tiles:
  EditorTile[] }`. `EditorTile` is a
  tagged union of `EditorRegularTile` and `EditorIrregularTile` with
  an `origin: 'origin' | 'placed' | 'completed'` discriminator (single
  array per Decision 12).
- `SavedSourceCategory` = `'archimedean' | 'rosette-patch' | 'editor'`.
- Reducer actions: PIC + figure controls, plus editor actions —
  `EDITOR_NEW`, `EDITOR_CLEAR`, `SET_EDITOR_BOUNDARY_SHAPE`,
  `SET_EDITOR_BOUNDARY_SIZE`, `SET_EDITOR_ORIGIN_SIDES`,
  `EDITOR_PLACE_TILE_ON_EDGE`. Knob handlers are no-ops when no
  patch is active. Shape / origin-sides changes reset `tiles` to
  `[origin]` (orbit / origin invalidates downstream tiles).
  `EDITOR_PLACE_TILE_ON_EDGE` recomputes `computeExposedEdges`,
  re-validates with `isPlacementViable`, and appends an `origin:
  'placed'` tile.
- `usePattern` dispatches: editor branch first (`tiling.type === 'editor'
  && config.editor` → `editorTilesToPolygons` + `runPIC` +
  `editorBoundaryVertices`), then the existing archimedean /
  rosette-patch branches. Editor patches bypass viewport
  quantisation since they're finite. `PatternData` now carries an
  optional `boundaryOutline: Vec2[]` populated only in editor mode.
- `tileTypeIdFor()` keys regular tiles as `"<n>"`. Irregular tiles get a
  provisional `"<n>i:provisional"` placeholder until 17.5 lifts the
  canonical-signature hash from `archive/tessellation-lab/`.
- `PatternSVG` has no clipPath plumbing — single tile + strand layer.
  At 17.2 it accepts an optional `boundaryOutline: Vec2[]` and renders
  it as a non-interactive dashed accent polygon below `TileLayer`
  (via the local `BoundaryOutline` sub-component). At 17.3 it gained
  an `editorOverlay?: ReactNode` slot rendered above `TileLayer`
  inside the rotation `<g>`; `Canvas` plugs in `EditorEdgeLayer` and
  positions the picker via screen-space `worldToScreen`.
- `App.tsx` has no `activePresetId` state.
- `TessellationLabMode` chrome (post-17.2): header, **Editor
  section** which swaps based on patch state — when active, shows
  design controls (3 boundary-shape buttons + boundary-size slider
  + origin-sides slider + Clear); when inactive, shows New patch /
  Show sample patch. "My Tessellations" library (Save / Rename /
  Duplicate / Delete + saved-entries dropdown), Strands panel
  (currently inert in editor mode — wired at 17.6 per Q15),
  Display section. The standard tessellation Type dropdown /
  Scale / Reset / Info panel were removed in `94f651c` — Lab is
  editor-only.
- Editor defaults (`src/editor/createDefault.ts`): square boundary,
  boundarySize 200, originSides 4, edgeLength 100. Origin rotation
  is 0 across all combos; boundary rotation is `-π/2` for triangle /
  hex (point-up) and `π/4` for square (axis-aligned), defined in
  `BOUNDARY_ROTATION` inside `buildEditorPolygons.ts`.
- Migrations: `loadLabState` resets retired tiling types to `''` and
  strips dropped payloads; `listSavedTessellations` skips retired-type
  entries with `console.warn`. `'editor'` is *not* retired and passes
  through.

## Decisions still in force after the pivot

1. Lab is a separate mode; Main is unchanged.
2. Tessellation-first rendering in Lab; strands are an optional overlay.
3. Lab-resident custom work — no Main-mode bridge.
4. Library is Lab-only, persists to `lab-tessellations-v1` localStorage.
5. Existing JSON `saveJSON` / `loadJSON` remains the canonical share format.

Architectural decisions specific to mandala / composition (strict-divisor
layer rule, hard-frame fallback, verified-pairs allow-list, etc.) are
moot now those features are archived.

## Blockers
None. 17.3 visually signed off (with two follow-ups that shipped
in the same commit). 17.4 (orbit propagation) is queued.
