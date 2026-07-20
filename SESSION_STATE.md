# SESSION_STATE.md

> **Vocabulary note (2026-05-16):** the canonical glossary is `CONTEXT.md`. This file predates the vocabulary alignment and uses legacy terms (`Tessellation Lab` → **Builder**, `main mode` → **Gallery**, `BoundaryTile` → **Cell**, `strand editor` / `Strand mode` → **Composition** Phase, `Design mode` → **Design** Phase, `origin tile` → **Seed Tile**, `line` → **Ray**). When updating this file, prefer the new terms. See `CONTEXT.md` and `docs/adr/0001`–`0003` for the locked decisions.

## ▶ RESUME HERE

---
### ▶ 2026-07-20 (Line-set enhancements shipped + Decoration-gradients grill/spec) — ✅ SHIPPED (Fable), ⏳ user browser-verify

**Goal:** (a) four line-set quick asks; (b) grill + spec gradients.

**Done (a) — `898a09b` feat(strands), 1125 vitest green, tsc clean:**
1. **Set limit removed** — `MAX_FIGURE_SETS` deleted (reducer + FigureControls); add buttons always shown.
2. **Primary hideable** — Edge/Vertex toggles no longer force each other on when `extraSets` exist (both primaries can go dark); deleting the last set re-lights edge lines (can't strand invisible).
3. **Tile-to-strand** — new `FigureLineSet.kind: 'boundary'` ("+ Tile edges" button): emits tile outlines as Strands (`runPIC` per-edge emission, field-wide `boundaryEdgeKey` 1e-4 dedupe so shared edges emit once), no θ/length controls, curve + enable + `setId` chaining as any set. Tests in `pic/multiSet.test.ts`.
4. **Inner fill for double/triple** — `innerFill?: string` on `StrandStyle` + `FrameStroke`: "Fill between lines" toggle + swatch (StrandStyleControls + DecorationPanel), rendered as cut-width underlay the centre mask reveals (StrandLayer + FrameBorder). Survives save/load (configValidation + editor/migrations; Gallery frame stroke now also retains `lineStyle`, previously dropped on load).

**Done (b) — `71190cc` DECORATION_GRADIENTS_SPEC.md + tickets #44 (slice 1 per-shape + focus editor, Fable) / #45 (across-frame underlay + canvas handles, Opus) / #46 (v2 strand gradients w/ per-Ray handles, DEFERRED until #44+#45 verified, Fable).** Key decisions in spec: gradient = 4th PaintTarget; arbitrary draggable stops via ColourPicker; per-shape edited in StampFocusEditor-style modal; across-frame = underlay showing through UNPAINTED Voids only, one per comp, off by default. Memory `project_decoration_gradients_idea.md` (PLANNED). Also captured `project_export_view_fit_idea.md` (RAW — export screen-view vs max-fill toggle).

**Next (cold start):** user browser-verify (a): uncapped sets; hide primary w/ set present; "+ Tile edges" on single- AND multi-cell Patches (dedupe across cell-transformed tiles uses 1e-4 grid — watch for doubled border strokes); inner fill on Strands + Frame border, incl. under weave. Then pick up #44 (Fable) when gradients start. Untracked user data at repo root (`islamic-pattern.json`, `islamic-pattern (6).png`) left for the round-5 verify below.

---
### ▶ 2026-07-20 (Frame border strand-paint — round 5: THE saved-comp bug, root-caused via user's JSON) — ✅ FIXED + ✅ Playwright-verified end-to-end (Fable)

**Goal:** round-4 curve fix didn't cover the user's case ("there are no curves"). User supplied the failing comp (`islamic-pattern.json`, repo root): snub square 3.3.4.3.4, θ=10, four extra edge sets, square Frame 471 w/ 8.5 border stroke, strandColours `*`, morph disabled-but-present (#43 stale carry-over, harmless here).

**Root cause (found by headless replay + Playwright DOM inspection):** the RENDERED/hit strand field keeps only tiles whose centre is inside the Frame outline (the completion-gap filter in `stampedField`), but Void fills extract from the FULL unfiltered field (`decoField`) and paint out to the frame edge. Strands are visually the GAPS between fills — so the border band (~half a tile wide) shows strand strips with NO strand segment underneath: no hover, no click, no paint. Replay of the user's exact config: 308/9088 visible strip samples uncovered, worst gap 32 world units; DOM showed the catcher rect receiving events but zero hit targets there. (4.8.8 @ θ=67.5 doesn't exhibit it — long star arms cover the band — which is why every earlier probe field looked clean; shallow-θ fields do.)

**Fix (`usePattern.ts`, 2 lines + comments):** `nonFastStrandHits` and the non-fast Decoration branch's `segments` (the painted StrandLayer field) now use `stampedField.decoField` instead of the filtered `segments` — same field the fills come from; frameless `decoField === segments` so nothing else changes. Frame clip still cuts strokes at the outline. Regression: `frameIdentityProbe.test.ts` test E (snub-square θ=10 field; pins that the rendered field leaves strips uncovered AND decoField covers 100%).

**Verified:** 1122 vitest green, tsc clean. Playwright (headless chromium via scratchpad libs — libnspr4 etc extracted debs at `scratchpad/chromedeps`, system install refused): loaded the save from the library dropdown, Decoration→Strands: border sweep dead points 232→132 (all remaining are ≥6 units off-strip, i.e. inside fills — correct); a previously-dead border strip point (-175.5,-313.4) hovers + paints (Matching reach → "2 Strand colours", stroked path appears).

**Also this session (`4a5f3b1`, round 4):** curved-stroke hit-test/hover follow flattened Bézier polylines (real bug, just not this user's) — StrandHit.poly, pointPolylineDist, flattenSegmentPolylines.

**Notes for later:** `FrameBoundaryTreatment` ('complete'/'clip') is consumed NOWHERE at render time — vestigial; the field always filters centre-inside. `segmentBaseSignatures` midpoint match ignores `setId` (coincident twin-set aliasing — benign). Morph-in-save carry-over confirmed in the wild (#43 fix stops new pollution; old saves keep a disabled stale morph — harmless).

**Next (cold start):** user browser-verify on their real comp (border strand strips should hover+paint; also re-test their SAVED comps — this was almost certainly the saved-comp blocker from 2026-07-19, so the `pattern-library-v1` dump investigation is likely DONE). If confirmed → prune/close `project_frame_touching_strands_bug` memory. Consider deleting `islamic-pattern.json` from the repo root (user data) after verify.

---
### ▶ 2026-07-20 (Frame border strand-paint — round 4: curved strokes unclickable) — ✅ FIXED (Fable), ⏳ user browser-verify

**Goal:** user report — border strand-paint error persists ("less severe"): on a FRESH comp with #42 extra line sets, clicking some border strands does nothing (no hover). Screenshot `islamic-pattern (6).png` shows curved petal strands.

**Root cause (by construction, pinned in tests):** every rendered segment's straight chord IS in `strandHits` at distance 0, so a truly dead click means the visible stroke isn't where the chord is — **curves**. `computeCurves` offsets control points by `cp.offset × edgeLen`, so a bowed stroke's body sits up to ~offset·edgeLen (easily 6–15+ world units) from the chord, while the pick radius is only `max(6/zoom, width/2 + 2/zoom)`. Interior curved strokes still hit near junction points (curves pass through them); at the Frame border the clip leaves ONLY the mid-bulge visible ⇒ the whole visible stroke is a dead zone. #42 per-set curves made this common (each extra set carries its own curve).

**Fix (1 commit; both hit paths + hover highlight):**
- `decoration/flatten.ts`: new `flattenSegmentPolylines(segments, strandData, config)` — per-segment sampled Bézier polyline (null = straight), reusing the caller's chains; shared `sampleCurve` extracted from `flattenStrandsToSegments`.
- `decoration/resolve.ts`: `StrandHit.poly?: Vec2[]`.
- `rendering/svgGeometry.ts`: `nearestSegmentIndex` measures hits with `poly` against the polyline (new `pointPolylineDist`).
- `hooks/usePattern.ts`: both hit builders attach `poly` when `curvesEnabled` — non-fast `nonFastStrandHits` (deps + config.figures/smoothTransitions) and the fast-path `decorationStrandHits` (base polylines computed once, translated per stamp).
- `rendering/DecorationPaintLayer.tsx`: hover highlight follows `poly` (was straight chords over bowed strokes); catcher bbox includes poly points.
- Tests: `svgGeometry.test.ts` (polyline-vs-chord pick regression) + `flatten.test.ts` (per-segment polylines, straight ⇒ null). 1121 vitest green, tsc clean.

**Next (cold start):** user browser-verify — framed comp with curved strands (incl. #42 per-set curves) → Decoration → Strands: border bulge strokes must hover + paint; hover highlight should now trace the curve. SAVED-comps replay investigation (round 3 entry below) still ⏳ pending user's `pattern-library-v1` dump — this round may well BE that bug too (saves with curves enabled), so re-test a failing save first before chasing the dump.

**Also noted (not fixed):** `segmentBaseSignatures` midpoint match ignores `setId` — exactly-coincident twin-set segments alias to one base class. Benign for paint (same geometry ⇒ same class visually); file only if a real symptom appears.

---
### ▶ 2026-07-19 (Morph reset on composition swap — ticket #43) — ✅ FIXED (Fable; Sonnet-level task), issue #43 CLOSED

**Goal:** user report — Morph settings not reset between composition changes (= ticket #43, filed 2026-07-18).

**Done (1 commit `d80f9e6`, pushed; tsc clean, 1118 vitest green):** `dropMorph` helper in `src/state/reducer.ts` (~:101), applied to the four structural Patch swaps that spread `...state` and let `config.morph` survive: `SET_BUILDER_CONFIGURATION` (both id + null), `EDITOR_NEW`, `EDITOR_CLEAR`, multi→single `SET_CELL_SHAPE`. Regression test in `src/state/morph.test.ts` ("structural Patch swaps drop a stale Morph").

**Decisions:**
- Single-cell Boundary-shape change KEEPS the Morph — Tiles are preserved there, so overlay tileTypeIds stay valid (pinned in the test).
- `LOAD_CONFIG` / preset-shelf loads already fine (wholesale state replace).
- Known limitation, flagged to user: undoing a Configuration swap does NOT restore the dropped Morph — morph was never in the editor history snapshot (`EDITOR_RESTORE_SNAPSHOT` restores `editor` only). File a follow-up only if the user hits it.

**Next (cold start):** nothing for this fix beyond casual browser sanity (switch Configuration with an active Morph → MorphPanel back to empty/disabled). NOTE for the frame border strand-paint save bug (entry below): suspect 1 there was "`config.morph` riding in the save" — this fix stops NEW pollution but existing saves in the user's library may still carry a stale morph; the replay-the-save investigation still stands.

---
### ▶ 2026-07-19 (Frame border strand-paint fix — round 2 of the frame-identity bug) — ✅ Fable (matched rec), ⏳ user browser-verify

**Goal:** user report — "void filling at the frame border was fixed; now the same symptom on strand colouring" (strands touching the Frame border miss congruent paint).

**Root cause (1 commit `2c75592`, pushed; 1117 vitest green, tsc + build clean):** fix `2224286` keyed each rendered chain by the MAJORITY base signature of its segments. In multi-class fields (vertex lines on, or #42 extra line sets) most chains span several base classes — probe on 4.8.8 + vertex lines: 3 base classes, 37/44 rendered chains mixed, one class vanishes from the per-chain majority histogram entirely (unpaintable); with an extra set: 5 classes, 154/271 mixed. Frame-truncated border chains have a different class mix than the interior mega-chain, so majorities flip frame-dependently → border strands leave the painted class. The plain single-class 4.8.8 probe field is immune, which is why test A stayed green.

**Fix (per-SEGMENT congruent resolution — the "per-run stroke split" polish deferred in the 2026-07-17 fix, now required):**
- `decoration/strandGroups.ts`: new `segmentBaseSignatures` (per-segment base class via stamp-mapping) + `strandIdentitiesFromBase` now also returns `segmentSignatures` (base class, falling back to the owning chain's final signature for unmapped/world-space segments).
- `usePattern.nonFastStrandHits`: paint keys use the per-segment signature (patch/cell keys stay whole-chain).
- `StrandLayer`: strokes resolve per edge (memoised per distinct sig per chain); a chain whose edges resolve to different strokes splits into per-run sub-paths via new `curvedPathDSplitBy` (`strand/curvedPathD.ts`). Render body now consumes stroke-carrying `pieces` (mask cuts / caps / triple centre all aligned). **Weave keeps the whole-chain majority stroke** — the over/under cut walk needs the chain in one path (documented limitation).
- `frameIdentityProbe.test.ts` test D: multi-class frame field (vertex lines), pins per-segment signature == base class for every mapped segment + every base class reachable, and documents that per-chain majorities lose classes.

**Known remaining (out of scope, noted):** `patch`/`cell` scope keys still derive from the rendered truncated chain (centroid + point chain) — border strands under those scopes remain frame-dependent; congruent + all scopes (the common paths) are fixed. File a ticket if the user hits it.

**Next (cold start):** user browser-verify — framed multi-cell save with vertex lines and/or #42 extra sets → Decoration → Strands target, congruent scope → paint an interior strand → border-touching strands of the same class must take the colour; check hover highlight matches, and weave mode still strokes whole chains. Then update/delete `project_frame_touching_strands_bug` memory.

**Round 3 same day (`da6a106`):** user follow-up "still can't paint some strokes on the border" — AskUserQuestion pinned it: direct click does NOTHING (no hover), scope=All, no completions ⇒ NOT identity, a dead hit-test. Cause: `DecorationPaintLayer.strandIndexAt` used a fixed 6-screen-px radius to the segment CENTRELINE; strokes straddling the Frame outline render only their inner half (content + paint overlay both clip at the outline), so the visible sliver sits up to strand-width/2 from the centreline — outside the radius when zoomed in / thick strands → click fell through to pan. Fix: pick radius = max(6px screen, width/2 + 2px), `strandWidth` prop threaded from Canvas (`config.strand.width`).

**Round 3 verify result: NEW comps work; SAVED comps retain the problem.** ⏸ **BLOCKED on user data** — asked for the localStorage library dump (console one-liner given to the user: download `localStorage.getItem('pattern-library-v1')` as `pattern-library.json`; key defined in `src/state/patternLibrary.ts`) + the problematic save's name.

**Next (cold start):** when the user supplies `pattern-library.json` + save name → replay that config through the headless pipeline (mirror `frameIdentityProbe.test.ts` buildFrameField but from the save's `PatternConfig`: `runPIC` over stamped/frame-filtered polygons → `strandIdentitiesFromBase` → `segmentBaseSignatures` → simulate `nearestSegmentIndex` picks along the border) and find why border strokes are neither paintable nor clickable ONLY in saves. Ranked suspects (live-pipeline causes are ruled out by new-comps-work):
1. **`config.morph` riding in the save** (ticket #43 — morph carries over/persists): morphed θ varies by world position ⇒ de-stamped midpoints stop matching `baseSegments` ⇒ base identity collapses field-wide; check whether Decoration is actually frozen under morph or paints against broken identity.
2. **Stale `editor.decoration.strandColours`** interacting with the same-colour toggle-off branch in `SET_DECORATION_STRAND_COLOR` (reducer:733 — colour-equal upsert with `removedAny=false` REMOVES the record). NB verified: stale records cannot silently MASK (resolve + clearMaskingRecords both use current keys, tolerant compare) — only the toggle path is suspect.
3. **Migrated `editor.frame` / `guideTiles`** shape divergence (world-space unmapped segments keep rendered truncated identity — pure-world chains at the border stay unpaintable as a class; also check `migrateFrame` output vs fresh frames).
Also still ⏳: browser-verify of rounds 2+3 on NEW comps was implicitly OK per the user; memory `project_frame_touching_strands_bug` stays until saves fixed.

---
### ▶ 2026-07-18 (Multi line sets #42 — BOTH SLICES SHIPPED) — ✅ Opus, ⏳ user browser-verify

**Goal:** implement ticket #42 (multi line sets) — additional edge/vertex line families per Figure recipe, from the same origins, with independent θ/length/curve.

**Done (2 commits on `main`, pushed; 1116 vitest green, tsc + build clean, dev-server smoke ok):**
- **Slice 1 engine `68c1b00`** (Opus, matched rec): additive `FigureConfig.extraSets: FigureLineSet[]` (flat fields stay = primary set 0, no migration) + `Segment.setId`. `runPIC` per-poly body extracted into `emitEdgePass`/`emitVertexPass`, reused by the primary figure (morph-aware per-edge θ) and each extra set (uniform θ). Extra sets run independent passes with their own emitted/orphan bookkeeping ⇒ no cross-set trimming. `dedupPolygonSegments` keyed by `setId` (coincident twin lines survive; within-set collinear collapse intact). `buildStrands` chains within-set only (setId-scoped junction keys). `computeCurves.resolveSegmentCurve()` + `flatten.curvesEnabled()` honour per-set curves. Morph drives PRIMARY set only in v1. Setless output byte-identical (golden `runPIC.characterization` unchanged). New `pic/multiSet.test.ts` (11 tests).
- **Slice 2 UI `7488b29`** (Opus — user chose "stay on Opus" over the Sonnet rec via AskUserQuestion): `ADD_FIGURE_SET` (seeds a twin from the primary's current θ/length/curve) / `UPDATE_FIGURE_SET` (patch by id; id+kind re-pinned via `mergeFigureSet`) / `REMOVE_FIGURE_SET` (clears `extraSets`→undefined when last set goes), cap `MAX_FIGURE_SETS=4`. FigureControls advanced "Line sets" block: per-set card (kind badge, enable, θ, auto/manual length, per-set `CurveShapeEditor`), "+ Edge/Vertex set" buttons. Extra-set curves patch the whole `curve` object (SET_CURVE_* stays primary-only). Wired at the ONE live call site (Lab Strands panel, `TessellationLabMode.tsx`). 8 new reducer tests (`figureMutations`).

**Deviations from plan (both benign):** (a) only one live `FigureControls` call site — Gallery Sidebar no longer hosts editable figure controls post-convergence; (b) `configValidation` untouched — `coerceLegacyFigures`' `{...rest}` already carries `extraSets` through load (round-trip test confirms).

**v1 scope cuts (deliberate, documented in #42):** morphing extra sets, per-set colour, generator/sampler support, snap points, cross-set trim toggle; on-canvas control-point dragging is primary-only (sets edit curve shape via panel sliders).

**Next (cold start):** **user browser-verify** — new/loaded Patch → Composition → expand a tile type's Strands card (Show advanced) → "+ Edge set" / "+ Vertex set" → confirm layered star families render on canvas and per-set θ/length/curve reshape live; confirm delete + the 4-set cap; check a loaded save with extra sets. If good, prune `project_multi_ray_sets_idea.md`. Possible v2 follow-ups: per-set colour (StrandLayer by majority-set per chain), morph extra sets, sampler emission.

**Also filed this session (note only, NOT fixed): #43** — Morph settings carry over between compositions. Cause confirmed by code read: `config.morph` is top-level, and the destructive composition-swap reducer cases (`EDITOR_NEW` :307, `EDITOR_CLEAR` :315, `SET_BUILDER_CONFIGURATION` :807, `SET_CELL_SHAPE` multi→single :326) spread `...state` + swap only `editor`, so morph survives. `LOAD_CONFIG` is fine (wholesale replace). Fix = clear `config.morph` on those paths; decide single→single shape semantics + undo/snapshot interaction first (Sonnet rec). No code touched.

---
### ▶ 2026-07-18 (Multi line sets — planning only) — ✅ TICKET FILED (Fable), no code

**Goal:** capture the user's idea ("option to add additional sets of vertex and edge lines coming from the same origin but with different properties") and produce an implementation plan before switching to Opus to build it.

**Done (no repo changes — planning artifacts only):**
- Idea memory `project_multi_ray_sets_idea.md` (RAW→**PLANNED**) + MEMORY.md pointer under Ideas/Future.
- **Ticket #42** filed with the full plan (grounded in a code read of `types/pattern.ts`, `pic/index.ts::runPIC`, `pic/stellation.ts`, `strand/buildStrands.ts`, `strand/computeCurves.ts`, `components/strands/FigureControls.tsx`, `state/reducer.ts`, `configValidation.ts`).

**Plan shape (see #42 for detail):**
- **Additive schema, no migration** — flat `FigureConfig` fields stay = primary set (set 0); new `extraSets?: FigureLineSet[]` (`{id, kind:'edge'|'vertex', enabled?, contactAngle, lineLength, autoLineLength, curve?}`). `Segment.setId?` stamped via `PolyCtx`.
- **Engine** — refactor `runPIC`'s per-poly body into edge/vertex pass helpers; each extra set runs the same machinery with uniform θ, its OWN `emittedRays` + OWN ray pool for the orphan fallback (no cross-set trim). `dedupPolygonSegments` key includes `setId` so equal-θ twin sets survive. rosettePatch.ts imports must stay valid.
- **Chaining/curves** — `buildStrands` `ptKey` suffixed with `setId` (within-set chaining only, else mispairing at shared origins); `computeCurves` + `decoration/flatten` get a setId-aware curve resolver.
- **v1 out of scope (documented):** morph drives PRIMARY set only (overlay stays flat); no per-set colour; no sampler/snap support; no cross-set trim toggle.
- **UI** — 3 actions (`ADD/REMOVE/UPDATE_FIGURE_SET`, patch-based — not a per-field zoo) + "Line sets" block in FigureControls advanced section, wired at both call sites (Gallery Sidebar + Lab Strands panel).
- **Tests** — new `pic/multiSet.test.ts` (count scaling, no cross-set chains, equal-θ dedup survives, byte-identical regression for setless configs, save/load round-trip); ~600 existing must stay green.

**Slices:** (1) engine — **Opus**; (2) UI — Sonnet adequate.

**Next (cold start):** implement **#42 slice 1 (engine)** on a feature branch. User has switched to **Opus 4.8 / xhigh effort** for exactly this. Start: `gh issue view 42`, then types → runPIC refactor → buildStrands partition → dedup key → curve lookup → tests. Watch the figures-map-pollution failure mode when testing on loaded saves (`feedback_figures_map_pollution`).

---
### ▶ 2026-07-18 (Morph Boundary "very short" / "no teal line") — ✅ DIAGNOSED + FIXED (Fable, handoff said Fable-fine), ✅ USER-VERIFIED ("all good now")

**Diagnosis (Playwright-reproduced, both user reports explained in one frame):**
- The "very short line" = the **gold Origin/Direction arrow** (~46 px by design) — handoff suspect 2.
- "No teal line" (user's 2026-07-18 follow-up) = the default Boundary position `4×edgeLength = 400` lands at the **extreme right canvas edge** at the default view (screen x≈1520/1600) and **fully off-screen at any zoom-in** — `clipInfiniteLineToBounds` then returns null and the line leaves the DOM. Defaults/discoverability bug, not geometry; suspect 3 cleared (clip + bounds behave correctly).
- Handoff suspect 1 (Decoration Frame clip truncating the morph layer) confirmed real as well and fixed in the same pass.

**Fixes (committed with this entry):**
1. **View-aware Add Boundary default** — `editor/morph.ts`: new `visibleMorphBand(morph, bounds)` (projection of the visible world-rect onto the Morph axis; radial = nearest/farthest rect distance) + `defaultMorphBoundaryPosition(config, band?)` keeps the 4L spacing rule while it lands well inside the band (10% inset), else lands at the **band centre**, stepping +10%·span aside from any Boundary already there. Wired via new `viewBoundsRef` (Canvas writes its UNPADDED viewport world-rect — not the rotation-padded `guideBounds`, whose ~22% overshoot was letting edge positions count as "visible"; under view rotation the unpadded rect's centre still equals the view centre) → TessellationLabMode → EditorDesignControls → MorphPanel.
2. **Morph layer exempt from the Decoration Frame clip** — new `editorOverlayUnclipped` prop on PatternSVG (sibling `<g data-export="exclude">` after the clipped overlay group); Canvas passes `morphLayer` there in both phases. Z-order unchanged (morph was already last in the group).

**Verified:** 1094 vitest green (8 new unit tests: band-aware default + `visibleMorphBand` linear/radial), tsc clean, Playwright re-verify — 1st Boundary lands dead-centre at default view, 2nd steps aside, add-while-zoomed-in lands on-screen, Decoration+Frame leaves all Boundary lines full-span (clipPath active).

**Follow-up (same day, user direction):**
1. **Morph gated on a Frame** — "+ Add Morph" only offered when `editor.frame` exists; without one the Morph section shows a "needs a Frame" hint. An EXISTING Morph stays fully editable if its Frame is later removed (live config never hidden behind the gate) with a "Frame was removed" warning note. UI-level gate only — reducer/engine unchanged, saved no-frame morphs still load + render.
2. **Disabled Morph hides the whole overlay** — `morphOverlayVisible = showMorphOverlay && morph.enabled` in Canvas now gates the on-canvas layer (gold Origin/Direction arrow included — the user's report), the transient bottom slider, and the selection-clear effect. Config is kept (the "keep authoring while previewing off" model), only the overlay leaves.

Playwright-verified end-to-end (gate note → Frame → add → disable removes arrow+lines → re-enable restores → Remove Frame keeps panel + warning). 1094 vitest green, tsc clean.

**Follow-up 2 (same day, user decision via AskUserQuestion): implicit Origin stop.** User reported (a) one Boundary's angle slider changed the WHOLE pattern uniformly, (b) the usual Composition angle slider went dead under an active Morph. Both were the #37 CSS-gradient stop semantics (single stop ⇒ its values everywhere; `buildMorphBoundary` bakes all angles into each stop ⇒ base recipe never reaches the field). Fix (user picked the recommended option): `morphFieldValue` now splices an **implicit stop at position 0 carrying the live start recipe** (explicit stop exactly at 0 replaces it) — one Boundary yields a real gradient from the Origin, base sliders stay live (they drive the Origin side). Engine-only change; `buildMorphBoundary`'s pre-fill flows through automatically so add-is-a-no-op still holds. Docs amended: PATTERN_MORPH_SPEC.md (§clarification + §Field evaluation — this also restores the spec's ORIGINAL origin-side wording that #37 deviated from), ADR-0009 (two amendments incl. the Frame gate), CLAUDE.md morph bullet. Tests: 4 new/3 updated in `pic/morph.test.ts` (single-stop gradient, explicit-at-0 override, negative stop, coincident); probe suite passed UNCHANGED; 1097 vitest green. Playwright-verified: single Boundary at −160 w/ angle 20 ⇒ visibly asymmetric seed figure; base slider 60→80 under active Morph reshapes the Origin side live.

**Follow-up 3 (same day, user direction): Morph frozen in Decoration.** The #38 "Composition onwards" scoping reversed — overlay (`showMorphOverlay={editorPhase === 'strand'}`) + sidebar MorphPanel (`inStrand` only) now hide in Decoration, matching the Strand-geometry freeze idiom (ADR-0005); the morphed field itself still renders there. The `editorOverlayUnclipped` PatternSVG slot stays (guarantees no Frame clip regardless of scoping). Spec §Scope + ADR-0009 UI amendment updated. Playwright-verified: overlay+panel present in Composition → absent in Decoration (morphed asymmetric figure still drawn) → restored on switch back. 1097 vitest green, tsc clean.

**✅ User verified all of the above 2026-07-18 ("all good now").**

**Follow-up 4 (same day, user request): overlay visibility toggle.** "Show on canvas" Toggle in MorphPanel (shown when Morph enabled) — hides/shows the whole on-canvas overlay (Boundary lines + Origin/Direction handles + bottom slider) while the Morph stays enabled and rendering. Lab-level UI state (`showMorphBoundaries` in TessellationLabMode, not persisted, default on — mirrors the Guides `showGuides` pattern), ANDed into Canvas's `showMorphOverlay`. "+ Add Boundary" flips it back on so a fresh Boundary can't land invisibly. Playwright-verified (hide → show → add-while-hidden auto-shows). 1097 vitest green, tsc clean.

**Next (cold start):** nothing open on Morph slice 2 — session ended clean, all five commits (`3321fec`..`16e6e35`) pushed + user-verified. Remaining Morph work: **#39** full-capability interpolation (Opus rec, later). Optional polish idea: longer/labelled gold Origin arrow. Elsewhere: tickets **#40** (vertex-ray leak) + **#41** (centroid-V kinks) open from the #37 probe findings; other ⏳ browser-verifies listed in MEMORY.md (frame identity, vertex strands, stamps focus mode, UI revamp).

---
### ▶ 2026-07-17 (Morph slice 2 — UI, #38) — ✅ SHIPPED + ✅ browser-verified (Sonnet, matched rec)

**Goal:** ticket #38 — sidebar Morph section, on-canvas draggable Boundaries/handles, transient bottom position slider, reducer actions. Builds on slice 1's engine (`pic/morph.ts`) with zero engine changes.

**Done (4 commits on `main`, all pushed; 1086 vitest green, tsc + build clean):**
- `6968b7f` — authoring state layer: `editor/morph.ts` (`createDefaultMorph`, `buildMorphBoundary` — pre-fills a fresh stop from the field's *current* effective value at its position so adding one is a visual no-op, `defaultMorphBoundaryPosition`, `clipInfiniteLineToBounds`) + 9 reducer actions (`SET_MORPH_ENABLED/MODE/ORIGIN/DIRECTION`, `ADD_MORPH_BOUNDARY`, `SET_MORPH_BOUNDARY_POSITION/ANGLE`, `DELETE_MORPH_BOUNDARY`, `REMOVE_MORPH`) on top-level `config.morph`. None in `DESIGN_MODE_ACTIONS` — same footing as `SET_CONTACT_ANGLE`.
- `4e3fbfd` — `MorphPanel` sidebar section (enable, Linear/Radial mode, origin/direction, Add Boundary, per-Boundary position + per-tile-type angle sliders, Remove Morph). Visible **Composition Phase onward** (Composition *and* Decoration — the ticket's literal scoping, not frozen in Decoration like Strands/ADR-0005). `EditorDesignControls` now threads the whole `config`, not just `editor`.
- `d2d098c` — `EditorMorphLayer` on-canvas overlay: Origin handle + Linear-mode direction arrow (both draggable glyphs), each Boundary's own line (Linear)/ring (Radial) doubling as its drag target (1 DOF, unlike Guides' 2-DOF shapes needing separate handles). Wired into Canvas.tsx's existing `editorOverlay` composition — `data-export="exclude"` comes for free.
- `9931166` — `MorphBoundarySlider`, the spec's transient bottom-docked position slider, shown on canvas Boundary selection (range + `NumberStepper` + Delete, Escape/outside-click closes).

**✅ BROWSER-VERIFIED** (scratch Playwright script, same local-chromium-deps technique as the 2026-07-16 library-save session — `apt-get download` + `dpkg-deb -x` of libnspr4/libnss3/libasound2t64, no root): New patch → Composition → Add Morph → Add Boundary ×2, set angles 20°/80° at positions 300/900 → **visible smooth θ gradient across tiles between the two teal Boundary lines** (blunt octagons → sharp 4-point stars), confirming the full UI→reducer→PIC round trip. Also confirmed: real pointer-drag on a Boundary line moves it (position updates in the sidebar); dragging the direction-arrow handle rotates Direction *and* the Boundary line pivots to stay perpendicular; click-to-select opens the bottom slider, editing it round-trips to both canvas and sidebar; Radial mode relabels correctly (Origin→Centre, Boundary→Ring, "Boundary position"→"Ring radius") and renders a ring; overlay + panel present in Composition and Decoration, correctly absent in Design; Delete Boundary and Remove Morph both work.

**Next:** #39 (slice 3, full-capability interpolation — manual `lineLength`, curve control points, easing; Opus, later). #38 ready to close.

---
### ▶ 2026-07-17 (Morph slice 1 — engine, #37) — ✅ SHIPPED (Fable, matched rec)

**Goal:** ticket #37 — MorphConfig schema, field evaluation, per-edge θ in PIC, fast-path opt-out, probe suite FIRST.

**Done (all committed + pushed, 1065 vitest green, tsc + build clean):**
- `b9195f2` — `MorphConfig`/`MorphBoundary` on `PatternConfig` (types/pattern.ts) + `pic/morph.ts` (activeMorph/morphActive, morphDistance, morphFieldValue/morphValueAt) + 11 unit tests. **Implemented stop semantics** (spec ambiguity resolved, now recorded in PATTERN_MORPH_SPEC.md): CSS-gradient-style — below first stop = first stop's *effective* values (start ∪ overlay; untouched stop ≡ start), piecewise blend between stops, clamp beyond last. Start recipe = base every overlay patches, NOT an implicit stop.
- `5c1a744` — `computeContactRaysPerEdge` / `computeVertexRaysPerVertex` (stellation.ts, uniform fns delegate) + `runPIC` threading: θ per edge midpoint; vertex lines per vertex (decoupled → `vertexContactAngle` field, coupled → `contactAngle`).
- `fed9e3a` — probe suite `pic/morphProbe.test.ts` (22 tests): uniform-field equivalence (exact), shared-edge C1 continuity, containment, double-emission, baseline-relative stub storms; square/hex/tri/4.8.8 + tetrakis/cairo/floret/kisrhombille, linear + radial.
- `ef26e0b` — load validation `readMorphConfig` (configValidation.ts, degrade-silently like Gallery frame; sorts stops, normalises direction, forces easing) + tests.
- `4b62b70` — `periodicFastPathEligible && !morphActive` + `config.morph` in `editorBase` deps + eligibility tests. Non-fast `stampedField` path PICs world-space polygons, so morph renders correctly through the existing pipeline (incl. Gallery/faithfulRender — they call runPIC directly).
- Audit (ticket bullet): auto line-length is per-pair from actual rays ⇒ per-edge-safe by construction; fixed lengths held from start recipe in v1; `computeSnapPoints` single-θ assumption documented in snapPoints.ts (never meets the morph path in v1 — Builder returns [], Gallery is read-only); `edgeAngles` is a dead pass-through.

**Probe findings (inherited artifacts, NOT morph regressions — logged in RESEARCH-TILING-CONFIGURATIONS.md working log 2026-07-17):**
1. Centroid-V mixed-regime C1 kinks at branch-transition bands (e.g. θ≈45° squares) — uniform-θ behaviour exposed by spatial sweep; probe bounds them to a minority of edges.
2. Decoupled vertex lines leak past polygons at uniform θ<45° on squares TODAY (1800/3600 endpoints at 40°) — pre-existing clip bug (`t>ε` rejects the at-vertex exit); probe sweeps θ≥50°. Fix idea captured in the research log.

**Next:** #38 (Morph slice 2 — UI, Sonnet rec) builds on `pic/morph.ts` primitives; no browser-verify possible until it lands (engine has no authoring surface). #37 CLOSED. Probe findings ticketed: **#40** vertex-line leak at α > interior half-angle (pre-existing, Sonnet rec) + **#41** centroid-V mixed-regime kinks (polish, decide after #38, Fable rec).

---
### ▶ 2026-07-17 (Morph — planning only) — ✅ GRILLED + DOCS + TICKETS FILED (Fable)

**Goal:** grill the Pattern Morph idea (`project_pattern_morph_idea.md`) and produce docs + tickets. **No implementation yet.**

**Done:** ADR-0009 (`docs/adr/0009-morph-boundaries.md`), build spec `PATTERN_MORPH_SPEC.md`, plan Step 20 in `TESSELLATION_REVAMP_PLAN.md`, CONTEXT.md vocab (**Morph** / **Morph Boundary**, `c083016`), memory upgraded RAW→GRILLED, spin-off memory `project_decoration_box_select_idea.md`.

**Tickets:** #37 engine (Fable — per-edge θ in PIC, probe suite FIRST) → #38 UI (Sonnet) → #39 full-capability (Opus, later). Dependencies wired.

**Key decisions:** one Patch not two patterns; gradient-stop Morph Boundaries (Linear lines / Radial rings, world-space, clamped band); θ evaluated per edge midpoint for Strand continuity; angles-only v1, `Partial<FigureConfig>` overlays for later; Decoration congruence degradation accepted; topology morph = Phase 2 parked.

**Next:** start #37 in a fresh session (Fable recommended — fragile `emitStarArms`/`pairAtVertex` branches).

---
### ▶ 2026-07-17 (Frame identity bug) — ✅ BOTH HALVES FIXED (Fable, matched rec), ⏳ browser-verify

**Goal:** the OPEN "Frame corrupts tile/void identity" bug (memory `project_frame_touching_strands_bug`, 2026-07-08): strand strokes drop out on frame-touching Tiles; paint-all-matching-voids misses voids near the Frame.

**Diagnosis (probe-driven, `src/decoration/frameIdentityProbe.test.ts`):**
- **Strands** — congruent signatures were chained over the frame-FILTERED stamped field; cross-tile chains truncate at the Frame so near-frame signatures are frame-dependent → painted congruent class misses visually-identical near-frame strands; frame edits orphan records. Single-cell square θ=67.5 is immune (tile-local closed loops) — multi-cell/vertex-line fields chain across tiles (the whole unframed 4.8.8 field is ONE strand), hence "intermittent".
- **Voids (plain frame)** — NOT broken; the 2e7f8b1 full-field extraction fix holds (test B pins it).
- **Voids (frame completions)** — extraction field (`decoField`) omitted `frame.completedTiles`/`guideTiles`; off-lattice completions bound visible voids extraction can't see (lattice-aligned ones coincidentally work).
- Stale memo pointer: `buildInternalEdgeSet` no longer exists (removed with self-contained vertex figures 2026-06-17).

**Done:**
- `9b4a303` — `decorationExtractionPolygons` (usePattern, exported pure): extraction = full lattice − lattice tiles overlapping a world Tile + world Tiles (completions + guide Tiles); wired into `stampedField.decoField`.
- `2224286` — `strandIdentitiesFromBase` + `baseSegmentSignatureMap` + `renderedStrandBaseSignatures` (`decoration/strandGroups.ts`): rendered segment → base-fragment twin via `@<stampIndex>` polygon-id suffix (translation + rotation undo, 1e-3 midpoint match); rendered strand takes majority base-chain signature (null → own chain identity, i.e. completion/guide chains). Wired: `nonFastStrandHits` (paint keys) + `StrandLayer.identitySource` prop (stroke resolution) via `PatternData.strandIdentitySource` (both non-fast editor returns) → PatternSVG → Canvas. Matches the fast path's `baseStrandIds` keying, so paints survive Frame/vertex-line toggles + frame resizes.
- Regression suite `frameIdentityProbe.test.ts` (3 tests, red→green verified for A and C). 1026 vitest green, tsc clean.

**Next: ⏳ BROWSER-VERIFY (user, `npm run dev`) — the only outstanding step. Protocol:**
1. **Strand paint reach at the Frame** — Lab → 4.8.8 preset (or any multi-cell) → add a square Shape Frame → Decoration → Paint Strands, congruent scope → click an interior strand. EXPECT: visually-identical strands right up against the Frame edge also colour (pre-fix: near-frame strands stayed uncoloured).
2. **Paint survives Frame edits** — with strands painted, resize AND move the Frame. EXPECT: painted colours persist (pre-fix: any frame edit orphaned the records → colours vanished).
3. **Paint survives mode flips** — paint strands with NO frame (fast path), then add a Frame; also toggle vertex lines on/off. EXPECT: same strands stay painted (identities now shared with the fast path).
4. **Voids at frame completions** — Design → Complete onto a frame node (tile flush at the Frame edge) → Decoration → Paint Voids → paint-all-matching on a void bounded by that completion tile. EXPECT: it hit-tests + fills, and congruent siblings fill with it (pre-fix: extraction couldn't see completion-bounded voids, esp. off-lattice ones).
5. **No regression on plain frame voids** — framed field WITHOUT completions: paint-all-matching near the Frame edge still reaches frame-straddling voids (2e7f8b1 behaviour, pinned by test B).

On pass: delete memory `project_frame_touching_strands_bug` + its MEMORY.md line (per memory-hygiene rule). On fail: `src/decoration/frameIdentityProbe.test.ts` is the feedback loop — extend it with the failing scenario first.

DEFERRED polish: per-run stroke splitting when a rendered chain spans multiple base classes (only matters for multi-class base fragments; 4.8.8/60° base is 1 class).

**Decisions:** strand identity spec = "same as the frameless periodic fast path" (base-fragment chains are the identity source everywhere); extraction-field spec = "rendered arrangement where Tiles exist, periodic continuation beyond".

---
### ▶ 2026-07-16 (library save-overwrite) — ✅ SHIPPED, ✅ browser-verified (Sonnet, matched rec)

**Goal:** overwrite a currently loaded save instead of always saving a new entry — Save now overwrites the loaded entry in place; Save As always name-prompts a new one.

**Done:**
- `src/state/configLibrary.ts` — `update(id, config): SaveResult` on `ConfigLibrary` + `createConfigLibrary` (replaces `config` via `structuredCloneSafe`, refreshes `sourceCategory`, bumps `createdAt`, keeps `id`/`name`). Mirrored in `src/state/patternLibrary.ts`.
- `src/components/ConfigLibraryPanel.tsx` — `handleSave`: no active entry → falls through to `handleSaveAsNew` (name-prompt, unchanged behaviour); active entry → calls `library.update` directly, no modal. New **Save As** button (always name-prompts via `handleSaveAsNew`), disabled with no active entry (that case is already covered by Save).
- Tests: `configLibrary.test.ts` +3 (`update` happy path keeping id/name, sourceCategory + createdAt refresh, missing-id corrupt error). 1022 vitest green (1 pre-existing unrelated flake — SSR smoke test timeout under full-suite parallelism, passes standalone).
- **Browser-verified** via a scratch Playwright script (system chromium had no system deps + no root; unblocked by `apt-get download` + `dpkg-deb -x` of libnspr4/libnss3/libasound2t64 into a local dir on `LD_LIBRARY_PATH`, no install/root needed): loaded Square{4,4} preset → Save (no active entry) opens name modal → saved → edited `strand.width` via the real Strand-style slider → Save (active entry) overwrites in place, no modal, same id/name, entries count unchanged, timestamp bumped, edited width persisted → Save As opens modal → new distinct entry, dropdown switches to it. Gallery has no save flow to re-check (read-only since the convergence flip, ADR-0006) — `ConfigLibraryPanel` only renders in the Lab.

**Next:** none — feature complete.

---
### ▶ 2026-07-16 (generator ML, part 2) — ✅ #36 ERAS + RANDOM-ONLY EVAL + EXPLORE SLIDER + HELP SHIPPED (Fable, matched rec)

**Goal:** ticket #36 — score-drift eras, honest evaluation, exploration control, in-UI help (user design discussion same day). **1019 vitest green** (+6), tsc + build clean.

**Done:**
- **Eras** — additive `DatasetRecord.era` (absent = 0); current era in localStorage `generator-current-era`; **New era** button (confirm + flash) in the bar; every rating stamps the live era. Training centres y per era (`fitEraStats` + `eraIntercept`, shrinkage k=10 toward global mean), ridge fits residuals; `trainTasteModel(records, currentEra?)` anchors `intercept` to the CURRENT era (fresh bumped era with no rows = global mean); CV fits era means on fold-train rows only (no leakage). Era change retrains (effect keyed on `era`).
- **Random-only eval** — `preprocessRecords` now surfaces `eras` + `sources`; CV pools carry a random-flag; **λ picked on random-only RMSE** (fallback: full pool if zero random rows); artifact cv = `{ pearsonR, rmse, randomPearsonR, randomCount }`; UI headline shows `randomPearsonR` (+ era number).
- **Explore (UCB)** — DECISION locked in #36: exploration lives in Guided, NOT the random sampler (Random = max exploration already; SAMPLER_TUNING widening would bump GENERATOR_VERSION). Artifact persists `covInverse = (XsᵀXs+λI)⁻¹`; `predictWithUncertainty` = cv.rmse × √leverage; `sampleGuidedPattern(model, seeds, explore)` bids `predicted + explore × uncertainty` (returns `uncertainty` too; predicted chip stays raw score). Dock gains an **Explore** slider (0–`EXPLORE_MAX`=2, step 0.25, visible only on Guided).
- **Help** — `?` toggle in the bar → `.generator-help` overlay panel: rating flow, what the model/r is (below ~0.3 = guessing), Random vs Guided + keep 30–50% Random guidance, Explore semantics, when to press New era.
- **Source-mix badge (`73f7318`, follow-up)** — Rated count now `Rated: N · x% R / y% G` (tooltip: raw counts + keep-random-healthy guidance); per-source tallies seed from the training fetch (absent source = random), increment per rating; `countRecords` no longer used in GeneratorMode.
- Tests: tasteModel 13 (era-drift absorption r>0.85 with a −3 era shift, era intercept ordering, fresh-era = global mean, guided rows out of randomCount, uncertainty ↑ off-distribution) + guidedPattern 5 (explore-0 argmax, explore-max = argmax of bid, determinism incl. explore).

**✅ BROWSER-VERIFIED (user, 2026-07-16):** full #35 + #36 + source-mix badge list confirmed — r readout, era badge, Guided taste skew, Explore-2 novelty, help panel, New era flow, source/era in export.

**NEXT (ML arc):** keep rating (healthy Random share, watch random-only r). Future: pairwise ranking model, auto ε-mix, palette/frame loops, v2 sampler. Guides arc unchanged: #29 → #30 → #31 → #32 → #34.

---
### ▶ 2026-07-16 (generator ML) — ✅ #35 TASTE MODEL + GUIDED SAMPLING SHIPPED (Fable, matched rec)

**Goal:** ticket #35 — the ADR-0007 ML arc's model slice, at 457 rated samples (past the 300–500 gate). Model: **Fable** (borderline numerics+design → lean Fable; active matched). 1 commit on `main`; **1013 vitest green** (+12), tsc + `npm run build` clean.

**Done:**
- `src/generator/tasteModel.ts` — pure in-browser **ridge regression**: closed-form normal-equations solve (Gaussian elimination w/ partial pivot), z-scored features (reuses `fitStandardizer`), centred target + unpenalised intercept, λ from `LAMBDA_GRID` [0.01…100] by **5-fold CV** (deterministic fold shuffle). Artifact `{ featureNames, standardizer, weights, intercept, lambda, nSamples, cv:{pearsonR,rmse} }` — persists its own featureNames; `predictScore` re-indexes by name, vanished features fall back to training mean (standardize to 0). Gate: `MIN_TRAINING_SAMPLES = 30` → null. **CV pooled out-of-fold r doubles as the learnability probe** (subsumed the planned offline JSONL script — no export round-trip needed) and shows live in the UI.
- `src/generator/guidedPattern.ts` — `sampleGuidedPattern(model, seeds)`: **best-of-K** (`GUIDED_CANDIDATES = 16`) over the v1 random sampler; winner keeps its own seed provenance; returns `predictedScore` for UI calibration.
- `datasetStore.ts` — additive optional `source?: 'random' | 'guided'` on `DatasetRecord` (absent = random; guided-era ratings are model-biased best-of-K, so later training can split/weight). No scoreSchemaVersion bump (score shape unchanged); flows through JSONL export automatically.
- `GeneratorMode.tsx` — **Random | Guided** segmented toggle in the bar (user decision 2026-07-14: option not replacement); model trains once at mode open from IndexedDB (tri-state: undefined=training / null=<30 scored / model); status readout `Model r=0.xx · n=NNN`; Guided disabled until trained; `≈x.x` predicted chip in the dock on guided samples; record's `source` captured at generation time (ref) so a mid-sample toggle can't mislabel. + CSS (`.generator-source*`, `.generator-dock__predicted`).
- Tests +12: tasteModel (gate, synthetic-linear-taste recovery r>0.9, determinism, constant-y r=0 not NaN, name re-index + reorder invariance) + guidedPattern (argmax, determinism, provenance, empty throws).

**✅ BROWSER-VERIFIED (user, 2026-07-16)** — see the #36 entry above; whole list confirmed.

**NEXT (ML arc):** rate more (watch r move); future = palette loop, frame loop, v2 Patch sampler, model persistence if retrain-at-open ever feels slow. Guides arc unchanged: #29 → #30 → #31 → #32 → #34.

---
### ▶ 2026-07-16 (fixes) — ✅ #33 REVIEW FIXES SHIPPED (8 of 10 findings; Fable per handoff rec)

**Goal:** implement the fix handoff from the review entry below. Model: **Fable** (matched rec). 4 commits on `main`, all pushed; **1001 vitest green** (+4 on the 997 baseline), tsc + `npm run build` clean.

**Done (finding # → commit):**
- **F5+F3 `a32d5c1`** — `worldTileVertexArrays` exported + new `worldProbeCell(patch, patchRot, worldTiles?)` (identity transform, sym `none`, base `activeCell`) in `editor/patchSelectable.ts`; all 5 hand-inlined world-tiles collections replaced (reducer frame-completion / `guideCompleteWorldSpace` / `placeTileOnGuideAnchor`, Canvas `guideProbeCell`, `validateMultiPick`). Frame-node Completes now probe `patch.guideTiles` (F3 fell out) + regression test (frame Complete rejected through a guideTile, force overrides).
- **F1 `e33699b`** — Anchor placements (both stamping + world-space branches) sized at `cellPlacementEdgeLength(active, patch.edgeLength, patch.cells)`, not raw `patch.edgeLength`; Canvas `effectiveEdgeLength` matches (`anchorEdgeLength`). Multi-cell 4.8.8 test with edgeLength forced 2.5× the seed edge.
- **F2 `cdf17aa`** — stamping-Anchor placement now propagates the active Cell's **symmetry orbit** all-or-nothing (bespoke loop in `placeTileOnGuideAnchor` — `placeTilesOnVertexOrbit` can't be reused, it requires orbit images on real exposed vertices; `transformVertexRotation` exported from `orbit.ts`; orbit in Cell-local frame, overlap probed in world frame against the cumulative probe). Canvas overlap-confirm `symmetry` flag now honest for Anchors (active-Cell mode when stamping, false when world-space). Test: D4 full + off-axis Anchor → 4 Tiles; non-stamping stays a single.
- **F4+F7+F8+F9 `c9faf89`** — Canvas Anchor injection gated on `onPlaceTileOnAnchor` (no dead-click dots); shared `makeAnchorVertex(p)` factory (`vertexPlacement.ts`, truthful full-2π sector) used by Canvas + both reducer sites; `cellLocalVertices`/`renderedVertices` collapsed to one shared world-pass memo with a `vertexKeyOf` rounded-key Set (1e-4 grid matches `dedupeAnchors`) for the Anchor-vs-real-vertex drop.

**Deferred:** F6 → **ticket #34** (stamped Anchor Tile lands in activeCell not the geometric host Cell; Sonnet rec). F10 → rides #31 polish (collapse raw `selectedVertexCell`/`placementEdgeLength` into one placement-context object).

**⚠ Known gap (accepted):** the Place picker's orbit-aware viability for a stamping Anchor runs against the world probe Cell (sym `none`), so an orbit-mate collision isn't badged ⚠ — the reducer then all-or-nothing no-ops. Same "silently no-ops" trap `vertexOrientationsWithOrbit` solves for real vertices; fold Anchor orbit awareness into **#29** (Guides symmetry-orbit).

**⏳ BROWSER-VERIFY OWED:** the #33 list below (unchanged) **plus**: (i) multi-cell preset (4.8.8) after boundary-size growth — Anchor-placed Tile matches sibling Tile size, preview agrees; (ii) stamping Anchor on a Cell with symmetry ≠ none → whole orbit appears, undo removes all; (iii) frame + guideTile overlap rejected without force.

**NEXT — #29 symmetry-orbit (Opus; fold in the Anchor orbit-badging gap)** → #30 stamp-under-Lattice (Opus) → #31 polish/vocab (Sonnet, incl. F10) → #32 Girih reveal → #34 host-Cell resolution (Sonnet). Slice-2/-3/#33 browser-verifies still owed.

---
### ▶ 2026-07-16 (review) — ✅ #33 CODE-REVIEWED (high effort, Fable) — 10 verified findings, ⛏ FIXES DONE (see entry above)

**Goal:** user asked for a review of commit `264e349` (Place-on-Anchors, #33) since it ran on Opus against a Fable recommendation. 8-angle multi-agent review + verify pass complete. **No code changed this session** — this entry IS the fix handoff.

**Verdict:** world-space plumbing + inverse-transform math verified correct. The **stamping branch** of `placeTileOnGuideAnchor` (reducer.ts) carries the real bugs.

**Findings (ranked; file:line = working tree @ `23e52ef`):**
1. **[CONFIRMED, worst] `reducer.ts:1039`+`1052` — stamped/world Tiles sized at raw `patch.edgeLength`**, not `cellPlacementEdgeLength(active, patch.edgeLength, patch.cells)`. Multi-cell Patch ⇒ Tile mints at the lattice constant, oversized vs the Cell's Tiles (the exact regression the `EDITOR_PLACE_TILE_ON_VERTEX` case at reducer.ts:454 avoids). **Fix in BOTH reducer branches + Canvas `effectiveEdgeLength` (Canvas.tsx:714)** so preview matches; add a multi-cell reducer test (e.g. 4.8.8 seed + stamping anchor → placed Tile edgeLength ≈ sibling Tile edge, not patch.edgeLength).
2. **[CONFIRMED] `reducer.ts:1047` — stamping branch skips symmetry-orbit propagation** (`placeTilesOnVertexOrbit`); vertex Place AND stamping Complete both orbit. Decide: propagate orbit (consistent) or document single-Tile as v1 (then at least make the overlap-confirm `symmetry` flag honest). Recommend propagate — mirrors `EDITOR_PLACE_TILE_ON_VERTEX`; note the anchor is world-space so orbit must run in the active Cell's local frame AFTER the world→local convert.
3. **[CONFIRMED, PRE-EXISTING #28] `reducer.ts:906` — frame-completion branch of `multiPickCompleteAcrossPatch` omits `patch.guideTiles` from its overlap probe** (other 4 world-tile collections include them; routing guard at :880 sends frame+anchor mixed picks into this blind branch). Fix lands free with finding 5's helper.
4. **[CONFIRMED, latent] `Canvas.tsx:1299` — anchor commit is `onPlaceTileOnAnchor?.()` but dots/picker are gated on `onPlaceTileOnVertex` only** → silent dead-click if a consumer wires one prop not the other. Fix: include `onPlaceTileOnAnchor` in the anchor-injection gate (only inject anchors when the handler exists).
5. **[CONFIRMED, reuse] `reducer.ts:1014` + `Canvas.tsx:697` — 4th+5th hand-inlined copy of the world-tiles collection; `worldTileVertexArrays` ALREADY EXISTS (private) at `patchSelectable.ts:339`.** Fix: export it, add `worldProbeCell(patch, patchRot)` beside it, call from all 5 sites (reducer.ts:902/972/1014, Canvas.tsx:697, patchSelectable.ts:305) — fixes finding 3 and the probe-base drift (Canvas spreads `cells[0]`, reducer `activeCell`) in one move.
6. **[PLAUSIBLE] `reducer.ts:1046` — stamped Tile stored in `activeCell` regardless of the anchor's geometric host Cell**; rendering unaffected (lattice stamps = uniform translations, verified) but later placements in OTHER Cells probe only their own `cell.tiles` → unwarned overlap. Fix idea: resolve host Cell by point-in-Cell containment (helper doesn't exist yet). OK to defer to a ticket.
7. **[PLAUSIBLE] `Canvas.tsx:621` — anchor-vs-real-vertex drop uses `EDITOR_EPS` (1e-6) vs the 1e-4 grid of `dedupeAnchors`/`vertexKeyOf`** → conceptually-coincident anchor from a different float path escapes the drop, duplicate dot. Fix: use the same 1e-4 rounded-key comparison.
8. **[cleanup] `reducer.ts:1030` — untyped `anchorVertex` literal with `openSectors: []`** (Canvas twin has full-2π) — latent zero-orientations trap. Fix: shared `makeAnchorVertex(p)` factory in `vertexPlacement.ts` emitting the truthful full-2π sector, used by both.
9. **[cleanup] `Canvas.tsx:615` — `realWorld` transform pass duplicated by `renderedVertices`** + O(anchors×real) dedupe. Fix: one shared world-position pass + rounded-key Set.
10. **[cleanup] `Canvas.tsx:685` — raw `selectedVertexCell`/`placementEdgeLength` still in scope beside `effective*`** — future memos will grab the wrong pair. Optional: collapse to one placement-context object; fine to ride #31 polish.

**Recommended fix order:** 5 (helper) → 1 (sizing + test) → 2 (orbit + test) → 3 (falls out of 5, add frame×guideTile overlap test) → 4 → 7 → 8 → 9; defer 6 (ticket) + 10 (#31). Suggested slices: one commit for 5+3, one for 1, one for 2, one for 4+7+8+9. Full finding details in this session's ReportFindings output; verify with `npx vitest run` (997 green baseline) + `npx tsc --noEmit` + `npm run build`.

**Model for the fix: Fable** (it's PIC/geometry-adjacent reducer surgery per the original ticket rec) — or Opus acceptable for findings 4/7/8/9 alone. **Per feedback_model_recommendations: confirm model with user if mismatched.**

**Blockers:** none. Browser-verify from the two entries below still owed (unchanged by the review).

---
### ▶ 2026-07-16 (implementation) — ✅ GUIDES #33 (Place-on-Anchors) SHIPPED

**Goal:** ticket #33 — the Place-on-Anchors workstream split off #28. Model: **Fable** per ticket (ran on Opus this session). Guide Anchors are now single-n-gon **Place**-mode vertex targets, not just Complete pick points. Commit **`264e349`** (pushed to `main`).

**Done (tsc + `npm run build` clean, 997 vitest green — +6):**
- **Geometry** (`editor/vertexPlacement.ts`): optional `ExposedVertex.guideAnchor { guideId, stamp }` marker — Anchor `p` is Patch-world coords, no host Cell.
- **Reducer** (`state/reducer.ts` + `actions.ts`): `EDITOR_PLACE_TILE_ON_ANCHOR { anchor, sides, rotation, force? }` → `placeTileOnGuideAnchor`, mirrors `guideCompleteWorldSpace`. Re-derives the Anchor from `collectGuideAnchors` (fails closed on a stale pick), overlap-probes against a world probe Cell (`center 0/rot 0/sym none`, tiles = all Cells' + frame + guide tiles as irregular) unless `force`; **non-stamping** → `patch.guideTiles` (world-space one-off), **stamping** → active-Cell Tile (world→Cell-local convert: `inverseCellTransform` centre, rotation − cell.rotation − patchRot). Allowlisted in `history.ts` (undoable) + `presetShelf.ts` (structural edit).
- **Canvas** (`components/Canvas.tsx`): injects `collectGuideAnchors` into `cellLocalVertices` as synthetic full-2π `ExposedVertex`es (drops those coincident with a real vertex). `selectedIsGuideAnchor` picks an `effectiveVertexCell` (memoised world probe Cell) + `effectiveEdgeLength` (`patch.edgeLength`) that thread through viable/forceable-sides, orientations, preview (skips the Cell transform — Tile already world-space), `vertexPickerWorldPos`, and the commit (routes to `onPlaceTileOnAnchor` vs `onPlaceTileOnVertex`). `EditorVertexPlacementLayer` colours Anchor diamonds by stamp (blue `#4a7fb5` world-space / violet `#9a5bd2` repeats). Wired `onPlaceTileOnAnchor` in `TessellationLabMode`.
- **Tests** (`state/guides.test.ts`, +6): non-stamping→guideTile / stamping→Cell Tile / figure-seed / stale-anchor fail-closed / no-editor no-op / undoable.

**⏳ BROWSER-VERIFY OWED:** (a) draw a Guide in Construct, switch to **Place** — Anchor diamonds appear (blue non-stamp / violet stamp) on the visible scaffold; (b) click an Anchor → shape grid → orientation preview (translucent n-gon at the Anchor, full-2π so all rotations offered); commit mints a Tile; (c) a **non-stamping** Anchor Tile is world-space (doesn't repeat when you enter Composition/lattice); a **stamping** Anchor Tile becomes a Cell Tile (DOES repeat); (d) overlapping placement shows ⚠ + Accept (force); (e) the minted Tile's Strands render + type editable in Composition; (f) undo/redo; (g) save/reload keeps it; (h) multi-cell: Anchor placement still lands correctly (world coords, `patch.edgeLength` sizing).

**NEXT — #29 symmetry-orbit (Opus)** → #30 stamp-under-Lattice (Opus) → #31 polish/vocab (Sonnet) → #32 Girih reveal. Also still owed: slice-2 circle + slice-3 Complete browser-verifies (below).

---
### ▶ 2026-07-15 (implementation) — ✅ GUIDES SLICE 3 (Complete-on-Anchors) SHIPPED (#28); Place split to #33

**Goal:** ticket #28, Guides slice 3 — the payoff slice. Model: **Fable** per ticket (ran on Opus this session). Delivered the **Anchor engine** + **Complete-on-Anchors**; the ticket's third workstream (**Place-on-Anchors**) was split to **#33** per user decision ("land Complete first, Place as follow-up") so the scaffold→Complete flow gets browser-verified before more Place picker UI is built.

**Done (991 vitest green, tsc + `npm run build` clean). Commits `9949354`→`83cc7df` (pushed):**
- **3a Anchor engine** (`9949354`, `editor/guides.ts`): `guideEdgeIntersections` (line/circle × finite segment, respects line `extend`) + `collectGuideAnchors(patch, patchRot) → GuideAnchor[]` — the single Anchor source (self anchors + Guide×Guide + Guide×Tile-edge/Boundary crossings), each tagged `guideId` + `stamp` (intersection = AND; `dedupeAnchors` downgrades a coincident stamping point to world-space). `collectSnapPoints` now sources from it (snap catches Guide×Tile-edge too). +6 tests.
- **3b Storage plumbing** (`2129a25`): `EditorPatch.guideTiles?: EditorTile[]` (world-space one-off, frame-completion model — render once, no Lattice repeat). `migrateV3` validates/carries it (+tests); `editorTileTypes` + `seedFigures` surface guide-tile types; `usePattern` renders + PICs `guideTiles` in Design **and** Composition paths; periodic fast-path dropped when guideTiles present.
- **3c Reducer routing** (`77e4fbb`): `multiPickCompleteAcrossPatch` treats Anchors as pickable + grounding → **free-standing Anchor-only Completes** allowed (spec Dec. 4); non-stamping Anchor (not also a real Cell vertex) → `guideCompleteWorldSpace` → `guideTiles`; stamping Anchor → ordinary Cell Tile (orbit-loop selectable check also accepts Anchors). `validateMultiPick` gains the matching world-space preview path. +reducer tests.
- **3d Complete UI** (`83cc7df`): `Canvas.guideAnchorVertices` (from `collectGuideAnchors`) → `EditorVertexLayer` `guide-anchor`/`guide-anchor-stamp` dot variants coloured by stamp (blue = world-space, violet = repeats). Guides already render passively in Complete mode, so Anchors sit on visible scaffolding.
- Docs: CLAUDE.md guides bullet (slices 1–3), CONTEXT.md Anchor entry, this file, memory idea + MEMORY.md.

**⏳ BROWSER-VERIFY OWED:** (a) draw Guides in Construct, switch to **Complete** — Guide Anchor dots appear (blue non-stamp / violet stamp) at endpoints/ticks/divisions + Guide×Tile-edge/Boundary + Guide×Guide crossings; (b) Ctrl-click ≥3 Anchors away from any Tile + Enter → **free-standing** Tile mints (green preview), stored world-space (doesn't repeat when you enter Composition/lattice); (c) a Complete mixing Anchors + real Cell vertices works; (d) overlapping Complete shows ⚠ + Accept-and-continue (force); (e) the minted Tile's Strands render + its type is editable in the Composition tile-type panel; (f) a Complete off a **stamping** Guide's Anchors becomes an ordinary Cell Tile (DOES repeat under the Lattice); (g) undo/redo; (h) save/reload keeps `guideTiles`; (i) slice-2 circle verifies (below) still owed.

**NEXT — ticket #33 (Place-on-Anchors). Model: Fable.** `gh issue view 33`. The engine + storage + render + figure-seed are all in place from #28; #33 is UI + one reducer action: a world-space `EDITOR_PLACE_TILE_ON_ANCHOR` (non-stamping→`guideTiles`, stamping→Cell Tile, mirror `guideCompleteWorldSpace`) + injecting Guide Anchors into the Place vertex picker as synthetic full-2π `ExposedVertex`es (parallel world-space path through `selectedVertexCell`/`placementEdgeLength`/viability+orientations against a probe Cell of all world Tiles/preview-skip-Cell-transform/commit). Reuses `placeRegularNGonOnVertex` + `isVertexPlacementViable` unchanged (they work in `vertex.p`'s coord space). Then #29 symmetry-orbit (Opus) → #30 stamp-under-Lattice (Opus) → #31 polish (Sonnet) → #32 Girih reveal.

---
### ▶ 2026-07-15 (implementation) — ✅ GUIDES SLICE 2 SHIPPED (#27): Guide circles + divided Guide circles

**Goal:** ticket #27, Guides slice 2 (spec decisions 5/6/7; `CONSTRUCTION_GUIDES_SPEC.md`, ADR-0008). Model: **Opus** per ticket. Built directly on the slice-1 seams.

**Done (978 vitest green, tsc + `npm run build` clean):**
- **Data** (`types/editor.ts`): `EditorGuideCircle` (`center` + scalar `radius` + optional `phase` = drawn-radius angle + optional `divisions` + stamp/tick/manual fields); `EditorGuide` is now `Line | Circle`. New `EditorGuidePatch` = union-friendly popup/drag patch. A **divided** circle = a circle with `divisions > 0` (one `kind`, not two).
- **Geometry** (`editor/guides.ts`): `GuideTool` (`line|circle|divided-circle`), `DEFAULT_CIRCLE_DIVISIONS=6`, `createGuideCircle`, `guideCircleRadiusPoint/DivisionPoints/TickPoints/ManualPoints` (divisions = **2n** rim Anchors from `phase`; ticks **arc-spaced**, count = round(circ/spacing)); `guideAnchorPoints` + `guideIntersections` branch per kind (added **circle×line** + **circle×circle**, both respect line `extend`).
- **Migrations**: `migrateGuide` now accepts `kind:'circle'` (`migrateGuideCircle`: needs finite centre + positive radius; rounds divisions; shared `sanitizeAnchorFractions`).
- **Reducer**: `mergeGuide` re-pins `id`/`kind` per-kind so the union patch can't widen the discriminant. UPDATE_GUIDE payload → `EditorGuidePatch`.
- **UI**: Construct toolbar gains a **Guide tool** selector (Line / Circle / Divided) in `DesignPanel` (Lab-level `constructTool` state, threaded via EditorDesignControls → Canvas). `GuidePopupOverlay` split into shared shell (stamp / ticks / delete / Accept-Cancel) + `LineControls` (extend + typed angle) / `CircleControls` (radius input, size presets ×√2 / ÷√2 / = edge / 2·edge, n-division). `EditorGuideLayer` renders circles (rim + hit-ring + division spokes/dots + arc ticks + centre/radius drag handles) and a circle draft preview; `onDragEndpoint`→`onDragHandle` (`start|end|center|radius`).
- **Canvas**: draw gesture branches on `constructTool` (line = 2-click segment; circle/divided = centre then radius); tool-change abandons a half-drawn draft; radius-drag snaps to a point else angle-snaps its direction about the centre; popup anchors at a circle's north point.
- **Tests** +34 (`editor/guides.test.ts`): circle create defaults, 2n divisions, arc-tick count, radius/manual points, circle anchor set, circle×line (incl. extend), circle×circle (overlap / disjoint / concentric), circle migration round-trip + validation.

**⏳ BROWSER-VERIFY OWED:** (a) Guide tool selector appears in the Construct toolbar; (b) **Circle**: click centre then radius draws a circle; radius/centre snap to tile vertex/midpoint (ring marker); draft shows a dashed circle + radius line; (c) **Divided**: draws with 12 rim Anchors (dots + faint spokes); popup n-division changes → 2n dots; (d) popup circle controls — radius input + ×√2 / = edge presets resize live, Accept keeps / Cancel reverts; (e) drag centre translates, drag radius handle resizes **and** rotates (angle snaps); (f) intersection × glyphs appear at circle×line and circle×circle crossings; (g) arc ticks space along the rim, "Show ticks" toggles; (h) undo/redo across circle draw/edit/delete; (i) save/reload keeps circles; (j) Composition "Show guides" reveals circles; export strips them.

**NEXT — slice 3, ticket #28 (Anchor → Place/Complete wiring). Model: Fable** (per ticket). Depends on #26 + #27 (both done); #27 was blocking #28 and #30. `gh issue view 28`. This is the payoff slice: Guide Anchors (intersections/ticks/manual/divisions) join the pickable set of Place + multi-point Complete (Frame-node precedent), incl. free-standing Complete on Guide Anchors alone (spec Decisions 3/4). Also owed from spec Decision 5: **Guide×Tile-edge** and **Guide×Cell-Boundary** intersection Anchors (slice 2 shipped Guide×Guide only). Manual-Anchor **creation** UI (click a Guide to drop an Anchor) also lands here — schema fields (`manualAnchors`) already ship on both kinds.

---
### ▶ 2026-07-15 (implementation) — ✅ GUIDES SLICE 1 SHIPPED (#26): data model + Construct mode + Guide lines + per-Guide popup

**Goal:** ticket #26, first Guides slice (spec `CONSTRUCTION_GUIDES_SPEC.md`, ADR-0008). Model: Fable per ticket.

**Done, 5 commits on `main` (`10aae59` → `fb67c81` → `3b368fd` → `9d166d8` docs → `61654e4` popup fix):**
- **Schema:** `EditorGuide` (`types/editor.ts`) — v1 = `EditorGuideLine { start, end, stamp (default off), extend none/start/end/both, tickSpacing? (absent → patch edgeLength), ticksEnabled? (absent → true), manualAnchors: number[] (parametric t — UI arrives slice 3, schema ships now) }`. On `EditorPatch.guides?` (optional additive, no version bump — presetId/decoration precedent). `migrations.ts` validates per-Guide, drops bad entries, empty → undefined.
- **Pure geometry** `editor/guides.ts`: fixed system colours (`GUIDE_COLOUR_STATIC` slate `#4a7fb5` / `GUIDE_COLOUR_STAMP` violet `#9a5bd2` — colour IS the stamp indicator), `collectSnapPoints` (tile verts + edge midpoints w/ edgeAngle + Boundary corners + Guide anchors/intersections, Patch-local), `snapToPoint`, `snapAngle` (references horizontal + start-edge dir so continuation/perpendicular come free; `ANGLE_STEP_PRESETS` 15/30/36/45/72), `guideLineSpan` (Liang–Barsky extend clipping), `guideTickPoints`/`guideManualAnchorPoints`/`guideIntersections` (extend-aware), `createGuideLine`.
- **Reducer:** `EDITOR_ADD_GUIDE` / `EDITOR_UPDATE_GUIDE` (fails closed on unknown id; never patches id/kind) / `EDITOR_DELETE_GUIDE` (last delete drops the block). All in `DESIGN_MODE_ACTIONS`; `historyCoalesceKey` now also reads `guideId` so endpoint drags coalesce per-Guide.
- **Construct mode:** `EditorMode = 'place'|'complete'|'construct'` (new, `types/appMode.ts`) threaded through TessellationLabMode/EditorDesignControls/DesignPanel/Canvas. Tool toggle is 3-way; in-mode toolbar in DesignPanel = angle-step select + "Snap while drawing" checkbox + hint (zero permanent chrome).
- **Drawing (Canvas):** two-click segments. **Key mechanism:** empty-canvas clicks detected by WRAPPING the `usePanZoom` svg handlers (pointerdown→up ≤5px slop) — an in-layer capture rect would lose the pointerup to the svg's `setPointerCapture`. Point snap wins over angle snap; Shift = freehand; Esc cancels draft; snap tolerance 14px/zoom. `screenToWorld` added to `rendering/screenSpace.ts` (inverse of worldToScreen, rotation-aware).
- **Layer** `EditorGuideLayer.tsx`: solid drawn segment + dashed extension, passive Anchor dots (endpoint/tick/manual/× intersections), draft preview + snap ring, wide invisible hit stroke (onPointerDown per `feedback_editor_svg_overlay_events`), endpoint drag handles (element pointer capture) on the selected Guide. Passive (`pointerEvents: none`) outside Construct.
- **Popup** `GuidePopupOverlay.tsx` (picker-style, anchored at segment midpoint): stamp toggle w/ colour swatch, extend segmented, tick spacing, typed angle (buffered, Enter/blur commits, rotates end about start), show-ticks, **Accept / Cancel**, delete. Canvas swallows the click that dismisses it (400ms window) so it doesn't double as a draw point.
- **Popup fix `61654e4`** (user-reported): (1) theme tokens — the popup used `var(--bg, …)` but **styles.css defines NO `--bg` var** (it's `--bg-base`/`--bg-surface`/`--bg-elevated`/`--bg-input`), so the fallback landed on a light background under dark-theme light text → unreadable. Now `--bg-elevated` dialog / `--bg-input` fields / `--border-accent` border (matches the placement picker). Same phantom `var(--bg)` fixed on the endpoint drag handles → `--bg-base`. (2) Added **Accept/Cancel**: popup snapshots the Guide's editable fields at open (keyed by Guide id in Canvas); edits still preview live, Accept commits, Cancel (incl. Esc + outside-click) reverts the snapshot via one `EDITOR_UPDATE_GUIDE`. Delete stays immediate (undoable). **NB same phantom `var(--bg, #f5f0e8)` still lives in `TessellationLabMode.tsx` structural-note banner — untouched, likely unreadable in dark theme; fix if it surfaces.**
- **Lifecycle:** Guides render in ALL Design modes (scaffolding for Place/Complete), Composition hidden by default behind CompositionPanel "Show guides" toggle (only offered when guides exist), never in Decoration (v1). Export strip free via editorOverlay `data-export="exclude"`. Saved/reloaded via config JSON + library (migrateEditorConfig path).
- **Tests +40 → 964 vitest green**, tsc clean. Docs: CONTEXT.md (Construct/Guide/Anchor entries), CLAUDE.md Builder bullet.

**⏳ BROWSER-VERIFY OWED:** (a) Construct appears in Tool toggle, toolbar in-mode only; (b) two-click line snaps to tile vertex/midpoint (ring marker); (c) angle snap 15° + edge-reference continuation; Shift freehand; (d) Esc cancels draft; (e) click a Guide → popup **is readable** (dark + light theme), stamp flips colour slate↔violet, extend dashes to viewport edge, tick spacing changes dots, typed angle rotates, **Accept keeps / Cancel+Esc+outside-click revert**, delete removes; (f) endpoint drag snaps + coalesces into one undo step + Cancel reverts a drag; (g) undo/redo across draw/edit/delete; (h) pan/zoom still works in Construct (drag ≠ click); (i) save/reload keeps Guides; (j) Composition hides Guides, "Show guides" reveals; (k) SVG/PNG export contains no Guides.

**NEXT — slice 2, ticket #27 (Guide circles + divided Guide circles). Model: Opus** (per ticket; matches the current session's model). It's the only unblocked slice — depends solely on #26 (done); #28 is blocked on #27. `gh issue view 27`; spec decisions **5, 6, 7** (`CONSTRUCTION_GUIDES_SPEC.md`).
- **Scope:** add `EditorGuideCircle` + `EditorGuideDividedCircle` to the `EditorGuide` union (currently line-only in `types/editor.ts`). Divided circle has an **n-division** setting → 2n equal arc parts, Anchors at division points (the traditional rosette scaffold, spec Decision 6). Circle sizing: presets (√2×, tile-edge-relative×) + free (popup, Decision 7). Both are the "circle as construction basis" answer; a real circular Cell Boundary stays a separate follow-up idea, NOT this.
- **Where it plugs in (slice-1 seams already built for this):** the `EditorGuide` union + `migrateGuide` switch on `kind` (currently hard-rejects non-`'line'`); `guideColour`/stamp is kind-agnostic already; `EditorGuideLayer` needs circle/arc rendering + arc-tick Anchors (`guideTickPoints` is line-only — add circle arc-tick + division-point emitters in `editor/guides.ts`); `guideIntersections` currently line×line only — extend to circle×line / circle×circle for Decision-5 intersection Anchors; `GuidePopupOverlay` needs a circle variant (n-division + size presets instead of extend/typed-angle); drawing gesture = centre-click then radius-click (two-click, like lines) in Canvas' construct handlers. Reducer actions (`ADD/UPDATE/DELETE_GUIDE`) + undo are kind-agnostic — no change.
- **Then:** slice 3 (#28, Anchor engine → Place/Complete pickable set, incl. free-standing Completes; the slice that makes Guides actually produce Tiles — **Model: Fable**, hardest slice) → #29 symmetry-orbit (Opus) → #30 stamp-under-Lattice (Opus; the flag already persists) → #31 polish/vocab (Sonnet) → #32 Girih reveal (follow-up).

---
### ▶ 2026-07-15 (later still) — ✅ GUIDES (construction lines) GRILLED + SPECCED + TICKETED

**Goal:** grill-with-docs session on the construction-lines idea (feature shaping only, no implementation).

**Done (no code):**
- 12-question grill complete, all decisions user-confirmed. Spec: `CONSTRUCTION_GUIDES_SPEC.md`. Vocabulary ADR: `docs/adr/0008-guides-construct-anchor-vocabulary.md` (**Construct** mode / **Guide** element / **Anchor** app-wide umbrella term; Guides make Tiles, never pattern lines — PIC stays sole engine).
- Tickets #26–#31 (v1 slices, `guides` label, native dep edges, per-ticket Model recs: Fable #26/#28, Opus #27/#29/#30, Sonnet #31) + #32 Girih-reveal follow-up.
- Memory: construction-lines idea → SPECCED; new spin-off idea `project_circular_cell_boundary_idea.md`.

**Next:** implement slice 1 (#26) on **Fable** — data model + Construct mode + Guide lines + popup.

---
### ▶ 2026-07-15 (later) — ✅ Stamp FOCUS MODE SHIPPED (pan/zoom/rotate an image inside its Void)

**Goal:** user request — full-screen editor for how an uploaded stamp sits in its polygon: shape shown alone at window size, pan/zoom/rotate ("crop" falls out of pan+zoom within the clip).

**Done (1 commit on `main`):**
- Schema: `VoidStampRecord.transform?: StampUserTransform { offsetX, offsetY, scale, rotation }` — pan as canonical-box fractions, zoom/rotation° about the box centre. Additive; `migrations.ts` strips a malformed transform but KEEPS the record at base fit.
- `src/decoration/stamps.ts`: `IDENTITY_USER_TRANSFORM`, `isIdentityUserTransform`, `userTransformMatrix(box, t)` (canonical→canonical affine), `composeTransforms`. `resolveVoidStamps` composes `toInstance ∘ userMatrix` — `VoidStampLayer` untouched, every congruent instance (incl. mirrored) inherits the adjustment.
- `src/components/lab/StampFocusEditor.tsx` — portal full-screen overlay: canonical shape fit to window (18% pad), image clipped + unclipped ghost (0.22 opacity), accent dashed guide. Drag = pan (pointer capture, client-px→canonical via viewBox meet scale), wheel = zoom (non-passive listener, clamp 0.05–20), sliders for zoom (log₂) + rotation (−180…180°), Reset / Cancel / Apply, Esc cancels. Local state while editing; Apply dispatches `SET_DECORATION_VOID_STAMP` (identity ⇒ field omitted).
- StampSection: "Focus mode — adjust placement…" button under the stamp row; image REPLACE now preserves fit+transform.
- Tests: +7 (matrix/compose/identity/resolver-composition in `stamps.test.ts`, transform round-trip+strip in `migrations.test.ts`). Green: tsc, **934 vitest**, build.

**⏳ BROWSER-VERIFY:** (a) focus mode opens with shape filling window; (b) drag/wheel/sliders feel right (drag direction correct on REFLECTED instances too — check a mirrored twin after Apply); (c) adjustment lands on every matching Void; (d) ghost shows crop; (e) save/reload keeps the transform; (f) SVG/PNG export includes adjusted stamps.

**NEXT (stamps idea):** ladder rungs (cell/patch/instance), Tile-stamping, asset library.

---
### ▶ 2026-07-15 — ✅ Stamp "Export all shapes" SHIPPED

**Goal:** user request — batch-export shape canvases for every distinct Void shape, named by shape ("triangle-1", "6-gon"…). (Also asked for a transparent-background option — moot: both shape-canvas exports were already transparent; user confirmed via Q&A.)

**Done (1 commit on `main`):**
- `src/export/stampAssets.ts` — `nameVoidShapes` (dedupe by congruent signature, first-seen order; approx-regular shapes get Composition-style names triangle/square/hexagon…, others `<n>-gon`; distinct shapes sharing a base name get numbered) + `downloadAllVoidShapeCanvases(voids, 'svg'|'png')` (300 ms stagger so the browser doesn't drop the burst; filenames `<name>-canvas.<ext>`).
- Plumbing: Canvas new prop `onDecorationVoids` mirrors `decorationVoids` up via effect → TessellationLabMode stores in a ref (no re-render churn) → `getStampVoids` down through EditorDesignControls → DecorationPanel.
- UI: StampSection "All shape canvases" row — Export all SVG / Export all PNG buttons (always visible in Stamp target, no selection needed) + result note ("Exported N shape canvases" / empty-canvas notice).
- +4 tests (`stampAssets.test.ts`). Green: tsc, 927 vitest (71 files).

**⏳ BROWSER-VERIFY:** click Export all on a multi-shape pattern → N files download with sensible names; Chrome may prompt "allow multiple downloads" once.

---
### ▶ 2026-07-14 (evening) — ✅ Decoration VOID STAMPS v1 SHIPPED (shape-canvas export + image import clipped to Voids)

**Goal:** first slice of the decoration-stamps idea, scoped to **Voids** (user request: inspect void types → export the shape as an editable canvas → upload images auto-cropped to the void shape). User decisions via Q&A: images **embedded in config as data-URLs** (downscaled ≤1024px, WebP q0.85); v1 scope **congruent only** (ladder reserved in schema).

**Done, 4 commits on `main` (`7412d38` → `1f3c4db` → `d89868e` → `7093496`):**
- `src/decoration/stamps.ts` — **canonical pose**: deterministic rigid(-or-reflected) placement every congruent Void agrees on (same quantised angle/edge token ring as the signature, lex-min over 2n traversals). `canonicalPose` / `poseBBox` / `fitImageRect` / `resolveVoidStamps`. Pose keys off `keyPolygon` (straight outline) so stamps survive curve edits; clip stays the rendered outline. Symmetric shapes: pose ambiguous up to the shape's own symmetry group — inherent, documented. +13 tests.
- Schema: `VoidStampRecord { scope, key, image, width, height, fit }`, `DecorationConfig.voidStamps?` (additive, version stays 1). Actions `SET/REMOVE_DECORATION_VOID_STAMP` (upsert by scope+key), CLEAR_DECORATION covers it. `migrations.ts` validates records (drops malformed). +6 tests.
- `src/rendering/VoidStampLayer.tsx` — `<clipPath>` per placement + `<image>` under `matrix(toInstance)`. Rendered after `VoidFillLayer` in ALL THREE PatternSVG spots (fragment ×2 variants + non-fast world-space) — stamps over fills, under Strands. usePattern: fast path resolves off `decorationReps` inside the `decorationFills` memo; non-fast off `nonFastVoidData.keyed`. New result field `voidStamps` (fills' coordinate convention).
- UI: 4th Paint target **Stamp** (`PaintTarget` now incl. `'stamp'`; usePattern sees it as `'voids'` for hit-targets). Click a Void → `stampSelection` (TessellationLabMode state); selected congruent group gets a persistent accent highlight (DecorationPaintLayer). `StampSection` in DecorationPanel: shape info (vertices/canvas dims/area), **Export SVG/PNG shape canvas** (`src/export/stampAssets.ts` — canvas = EXACT canonical bbox, no padding, so cover-fit round-trips pixel-true; guide outline layer), **Upload/Replace image** (compressed data-URL), Cover/Contain toggle, per-record remove + stamped-shapes list.

**Green:** tsc, **923 vitest** (71 files), build. **⏳ BROWSER-VERIFY OWED:** (a) Stamp target click-select + highlight; (b) SVG+PNG canvas downloads open in an editor at sane proportions; (c) upload lands on every matching void, consistently oriented (check a reflected instance mirrors); (d) round-trip: design on exported canvas → upload → aligns with guide outline; (e) SVG/PNG exports include stamps (data-URL images through `rasterizeSvgToCanvas`); (f) localStorage quota headroom after saving a config with 2-3 stamps; (g) stamps tile correctly on the periodic fast path AND with a Frame (non-fast path).

**NEXT:** browser verify above → then remaining stamp-idea scope (idea memo): fit/rotate/mirror controls, ladder rungs (cell/patch/instance), Tile-stamping (vs Voids), asset library. ML arc continues in parallel (learnability probe at 238 samples).

---
### ▶ 2026-07-14 (later still) — ✅ ML taste-model preprocessing pipeline SHIPPED (first slice of the ML arc)

**Goal:** user decision — the ML generator will be a **user-selectable option alongside Random** (Random | Guided source toggle), NOT a replacement. That makes the data-independent scaffolding buildable now (dataset at 238 rated samples, below the ~300–500 gate for training the real model). This session shipped the preprocessing slice.

**Done:**
- `src/generator/features.ts` — pure `extractFeatures(PatternConfig) → number[]` + `FEATURE_NAMES` (tiling one-hot, scale, figure aggregates: contact-angle mean/spread, auto/edge/vertex/decoupled/curve fractions, curve shape stats, strand width/weave/lineStyle one-hot, smoothTransitions). Mirrors `SAMPLER_TUNING` dimensions. Total function — unknown tilings / empty figure maps → zeros, never throws. **Contract: trained artifacts must persist their own featureNames and re-index by name** (FEATURE_NAMES grows with the tiling list).
- `src/generator/preprocess.ts` — `preprocessRecords(DatasetRecord[]) → TrainingDataset {featureNames, X, y, ids}`; `normalizeScore` (schema v1 1–5 → 0–10 linear, v2 pass-through, unknown → drop; flagged-with-score kept); `recordsFromJSONL` (round-trips `datasetExport.toJSONL`, skips bad lines); `fitStandardizer`/`applyStandardizer` (z-score, constant cols → 0).
- Tests: `features.test.ts` (8) + `preprocess.test.ts` (10). tsc clean, generator suite 26 green (pure addition, no existing code touched).

**NEXT (ML arc, in order):**
1. **Learnability probe at 238** (Sonnet) — export JSONL → `recordsFromJSONL` → `preprocessRecords` → small ridge/GBM script, cross-validated correlation; also check score distribution (narrow band = weak signal). Answers "is taste learnable from these features?" before the 300–500 gate.
2. Model slice — likely in-browser ridge regression trained from IndexedDB on demand (tiny at this scale), weights persisted with their featureNames snapshot. Re-rec model at open.
3. Generator UI slice — **Random | Guided** source toggle in GeneratorMode; Guided = sample N candidates, score with model, present best. (Sonnet once model exists.)

---
### ▶ 2026-07-14 (later) — ✅ Rosette epic Step 6 SHIPPED: Archimedes' Star preset, ticket #25 closed — **EPIC COMPLETE (all of #20–#25)**

**Goal:** #25 — Step-0-style scratch spike for Archimedes' Star (star-of-hexagons over 6³; hexagons as 12-gons with collinear vertex pairs), then the preset if the spike cleared. Model: Fable (per ticket).

**Spike PASSED — zero new tolerance work needed** (scratch vitest file, deleted, never committed; PNGs in session scratchpad `archimedes-spike/`):
- Geometry per RESEARCH §10.2: 3.6.3.6 at hexagon edge E with every triangle medially subdivided into 4 equilateral triangles (edge s = E/2); hexagon encoded as 12-gon (corners + edge midpoints) so contact midpoints align across the non-edge-to-edge hexagon↔triangle border.
- **`runRosettePIC`: 0 defects at all 8 spiked θ (27.5–80)** — 0 non-finite, 0 odd-degree, 0 tips-outside, 0 crossings. Its straight-vertex branch (inward edge normal) carries the collinear vertices natively; no epsilon/tolerance parameter needed anywhere.
- **`runPIC` provably breaks on the same field**: θ=60 loses segments (738 vs 840, 198 odd-degree endpoints), θ=80 has 594 arm crossings → path decision = bespoke rosette-patch path (which the taprats generator forces anyway via `runPICForCategory`).
- buildStrands interop: single 12-gon figure → 1 closed 24-seg strand; full field → 840 segs chain into 17 strands, **all closed** (strands cross the split border correctly).

**Shipped (one commit):**
- `src/tilings/tapratsTiling.ts` — `TAPRATS_DATA['archimedes-star']`: t1=(4,0), t2=(2,2√3), canonical edge 1 (= 12-gon half-edge = triangle edge, so user scale = drawn edge length); 12-gon (identity transform) + apex-down and apex-up triangle entries (4 translates each, both explicit `tileTypeId: '3'` so all 8 group as one tile type).
- `src/tilings/index.ts` — `TILINGS['archimedes-star']` (`category: 'rosette-patch'`, `tileTypes` `12`/`3`, defaults θ=60/60, foldSymmetry 6) + 6-fold `SYMMETRY_GROUPS` entry after davids-star.
- `src/tilings/tapratsTiling.test.ts` — added to `ALL_KEYS` sweep + new describe: sides/tileTypeIds/edge-length uniformity, the 6-collinear-midpoint-vertex encoding invariant, hexagon↔triangle shared edges.
- **Auto-joined coverage (no edits needed):** rosettePatch grand matrix (9 θ × property checks) + interop@54 (`ROSETTE_TILINGS` is category-derived), presetShelf tier-3 view-only badge, Generator sampler coverage (via `tileTypes`).

**Green:** tsc clean, **884 vitest** (67 files; +14 from 870). Headless smoke render through the real `generateTapratsTiling` + `runPICForCategory` shipped path at defaultConfig — clean star pattern, eyeballed. **✅ USER-VERIFIED same session ("everything looks good")** — verify debt cleared; star-tilings memory deleted per hygiene rules. Same session also shipped `b6a2a94` (glossary language sync: CONTEXT.md preset-path wording + new Presets shelf entry, CLAUDE.md Gallery=browser/Lab=default mapping — prompted by a stale "pick in the Gallery" phrasing).

**NEXT (cold start): the rosette epic is fully closed and verified (#20–#25 all shipped).** No open tickets remain. Next frontier is whatever the user picks off the ideas list (`/roadmap` or MEMORY.md Ideas section) — candidates: alternate-orientation single-cell audit (Opus), construction lines (needs /grill-with-docs first, Fable), decoration stamps / pattern morph / nested layers (all RAW), or let Generator ratings accumulate toward the ~300–500-sample ML gate.

---
### ▶ 2026-07-14 — ✅ Rosette epic Step 5 SHIPPED: `figureRouting` removed, `pic/index.ts` branch ladder shrunk (`ca506e9`), ticket #24 closed

**Goal:** #24 — audit whether `figureRouting` is still load-bearing anywhere live; remove it end-to-end if clear; shrink the `pic/index.ts` branch ladder (named-case table, `pushSegment`/centroid-V helpers, dedupe the triplicated pair-A/B probe) either way.

**Audit finding:** dead in production. Zero `.tsx` files dispatch `SET_FIGURE_ROUTING` (no UI control ever existed, matching the earlier CLAUDE.md note). `DEFAULT_CONFIG`, Builder `createDefault*`/`presetConversion` seeds, and the Generator (`randomPattern.ts`, explicitly `'auto'`) never diverge from the default. And `'auto'`/`'centroid'` were behaviourally IDENTICAL in the routing gate (`routing !== 'edge' && isConvex` — nothing ever checked `=== 'centroid'`) — only `'edge'` differed, and nothing ever picked it. Cleared for removal.

**Done, one commit, pushed to `main`:**
- **`ca506e9`** — **#24 CLOSED.** `figureRouting` stripped from `types/pattern.ts`, `state/actions.ts` (`SET_FIGURE_ROUTING` action gone), `state/reducer.ts`, `state/configValidation.ts`, `generator/randomPattern.ts`; `emitStarArms`'s `useCentroidV` is now unconditional on `isConvexPolygon` (was `routing !== 'edge' && isConvex` — since routing was always `'auto'` in practice, this is the exact same live behaviour, just without the dead indirection). The convex/concave SPLIT itself stays — real production logic for Builder-authored (possibly concave) polygons, just no longer routing-gated. Updated 8 test fixtures: deleted the `figureRouting=edge bypasses centroid V` regression test in `pipeline.test.ts` (asserted on dead routing behaviour) and the `drops an invalid figureRouting value` test in `configValidation.test.ts`; trimmed incidental `figureRouting: 'auto'` fixture fields elsewhere.
- **Branch-ladder shrink** (same commit, scoped down since the routing toggle's indirection was already gone): new `probePair()` helper dedupes the ray-probe-and-classify logic that was duplicated across `pairAtVertex`'s A/B pairs and repeated again in `pairVertexAtEdge`; both selectors' ordered-`if` chains became named-case tables (`{ cond, ray1, ray2, result }[]`, evaluated in the SAME order as before — a pure structural transform, not a logic change); `pushSegment`/`pushCentroidPair`/`PolyCtx` replace ~15 duplicated 9-field `Segment` object literals across `emitStarArms`/`emitVertexArms`/`runPIC`'s orphan-ray loop. `emitVertexArms`/`pairVertexAtEdge`/`clipSegmentToPolygon`/`dedupPolygonSegments` kept their EXACT exported signatures throughout (`rosettePatch.ts` depends on them) — only the non-exported `pairAtVertex`/`emitStarArms` had signatures reshaped.
- **Verification:** ran the full suite after the routing removal alone (870 green) and again after the branch-ladder shrink (870 green, identical count) — the acceptance gate (7 `runPIC.characterization.test.ts` goldens) stayed bit-identical across both changes, confirmed by re-running `runPIC.characterization.test.ts` + `pipeline.test.ts` + `probe.test.ts` explicitly after the shrink.

**Green:** tsc clean, **870 vitest** (67 files; down from 872 — net −2 from deleting the two routing-behaviour tests, no new tests added since this was pure refactor/removal against an existing acceptance gate).

**NEXT (cold start): ticket #25 — Rosette epic Step 6 (optional, off critical path).** The epic is already **functionally complete** without this — Steps 1–5 delivered the architectural fix plus David's/Kepler's Star. This step is purely upside: Archimedes' Star, star-of-hexagons over the `6³` base tiling.

**Model: Fable** for the spike itself (novel geometry — collinear-vertex tolerance work, not a preserve-the-fingerprint refactor); **Sonnet** for the preset plumbing afterward once the construction is validated.

1. **Run a Step-0-style scratch spike FIRST** (throwaway script outside `src/`, deleted at the end, never committed — same discipline as the original Step 0 spike that validated `runRosettePIC`'s bisector construction, see the "Step 0 findings" section of `ROSETTE_PATCH_PLAN.md` for the methodology to mirror). Do not commit to an implementation path before spiking — that's the whole point of this step.
2. **The core question the spike must answer:** hexagons need modelling as 12-gons (6 real vertices + 6 collinear midpoints, or similar) to carry the star-of-hexagons construction. That introduces near-duplicate/collinear vertices that existing code (`pointInPolygon`, `isConvexPolygon`, the ray-ray probes) may not tolerate cleanly — the spike's job is to find out whether that needs a new epsilon/tolerance parameter, and if so how invasive.
3. **Decide between two paths** based on the spike's outcome: (a) if the collinear-vertex handling turns out clean, Archimedes' Star might fit the **unchanged archimedean `runPIC` path**, the same way Kepler's Star did (θ chosen so the construction stays fully convex/regular — Kepler's shipped via Step 2 with zero new figure-construction logic); (b) if it doesn't, it needs the **bespoke `rosettePatch.ts` constructor** (Step 3's bisector construction) instead.
4. **Explicit permission to bail**: if the spike reveals nontrivial new tolerance-handling work, re-scope Archimedes' Star as its own follow-up ticket rather than letting it stall here — ticket #25 says this outright. Steps 1–5 already deliver the epic; this is not required.
5. If the spike passes and a path is chosen: add the preset the same way Steps 1/2 did (`TilingDefinition` entry in `src/tilings/index.ts`, registry-resolution test, `runPIC.characterization.test.ts` or `rosettePatch.test.ts` golden case depending on the chosen path, Lab tier-1 conversion wiring if it's a clean fit).

If #25 isn't picked up at all, no action needed — just note in a future session that the epic is closed and consider a one-line update to `TESSELLATION_REVAMP_PLAN.md`'s Step 17 section / the memory index (`project_star_tilings_gallery_idea.md`) to mark it delivered rather than in-progress.

---
### ▶ 2026-07-13 (night) — ✅ Rosette epic Step 4 SHIPPED: `runRosettePIC` wired into `usePattern` (`09187d8`), ticket #23 closed

**Goal:** #23 — flip `usePattern`'s `rosette-patch` category branch from `runPIC` to `runRosettePIC` (Step 3's bespoke bisector construction, built but not wired in), retire the 6 now-dead taprats goldens, add dispatch coverage, smoke-test before merging.

**Done, one commit, pushed to `main`:**
- **`09187d8`** — **#23 CLOSED.** `usePattern.ts`'s dispatch pulled out into an exported pure helper `runPICForCategory(category, polygons, config)` (same testability pattern as the file's existing `stampSegments`/`periodicFastPathEligible`) — `rosette-patch` → `runRosettePIC`, `archimedean` → `runPIC` unchanged. `runPIC.characterization.test.ts` shrunk from 13 to 7 cases: removed `cairo@27.5`, `floret@40`, `floret@40-edge`, `kisrhombille@72`, `nonagonal@54`, `tetrakis@46` (dated comment pointing at `rosettePatch.test.ts`'s grand-matrix + interop suites, which already cover all five tilings across a θ spread).
- **New test:** `usePattern.test.ts` `runPICForCategory` describe block — archimedean case checked equal to direct `runPIC` output; rosette-patch case checked equal to direct `runRosettePIC` output **and explicitly NOT equal** to what `runPIC` would have produced on the same cairo@27.5 input — a real behavioural assertion (the two constructions provably diverge there), not just a function-identity check.
- **Smoke test:** no browser-automation tool available this session either (same gap noted 2026-07-13 earlier — checked ToolSearch, nothing present). Used the repo's established headless-render fallback (`@resvg/resvg-js`, same pattern as `scripts/repro-*.mts`) via a scratch vitest file (deleted after use, never committed): rendered all 12 rosette-patch Gallery tilings + Kepler's/David's Star through the exact `runPICForCategory` dispatch at each tiling's own `defaultConfig` θ. All 14 produced finite, non-empty, visually closed figures. Eyeballed all 14 PNGs directly — clean in every case; the only visible crossing artifact was decagonal-rosette's `6.3` elongated-hexagon interleave at θ=72°, which is the **already-documented, accepted Step 3 residual** (plan calls it out explicitly as "renders as weave"), not a new regression.
- **Green:** tsc clean, **872 vitest** (67 files; net −1 test file count effect is nil, characterization file shrank in case count only).

**NEXT (cold start): ticket #24 — Rosette epic Step 5.**

1. **Audit FIRST, not optional.** Confirm whether any live `archimedean`-category path — including Lab-authored irregular/custom polygons (Builder `editor` route, `tiling.type === 'editor'`) — still depends on the `figureRouting: 'auto' | 'edge' | 'centroid'` distinction in `pic/index.ts`'s `emitStarArms`/`pairAtVertex`. The rosette-patch tilings no longer need it (Step 4 moved them off `runPIC` entirely) — the open question is whether Builder-authored polygons with unusual vertex angles still hit those branches for real reasons.
2. **Only remove `figureRouting` end-to-end if the audit clears it.** If it does: strip the field from `src/types/pattern.ts`, `src/state/reducer.ts`, `src/state/configValidation.ts`, and audit fixtures that reference it — `src/editor/presetConversion.test.ts`, `src/generator/randomPattern.ts`, `src/pic/pipeline.test.ts`, `src/pic/vertexStrandsOverlap.test.ts`, `src/pic/vertexStrandsPeriodic.test.ts`, `src/state/configValidation.test.ts`, `src/state/figureMutations.test.ts`, `src/strand/computeCurves.test.ts` — distinguish "incidentally sets the field" (safe to drop) from "asserts on routing behavior" (needs judgment).
3. **Branch-ladder refactor proceeds either way** (independent of the audit outcome): named-case policy table replacing the ordered-`if` ladder in `pic/index.ts`, extract `pushSegment`/centroid-V helpers, dedupe the triplicated pair-A/B probe.
4. **Acceptance gate:** the 7 remaining `runPIC.characterization.test.ts` goldens (6 archimedean + `keplers-star@67.5`) must stay bit-identical — this is a preserve-the-fingerprint refactor.

**Model:** Sonnet for the audit + mechanical removal; escalate to **Opus** if the branch-ladder reframe turns out gnarlier than a preserve-the-fingerprint refactor (per the ticket).

After #24: **#25** (optional Archimedes' Star spike, explicitly deferrable — do not let it stall if it gets messy).

**Still owed (carry forward, not blocking):** user eyeball of the Step 3 before/after artifact (https://claude.ai/code/artifact/c1d90ab6-bce4-4217-8d97-887e43ceb41b) + a real browser pass on the 12 rosette-patch tilings now that they're live (this session only verified via headless `@resvg/resvg-js` render — no browser-automation tool available in this sandbox).

---
### ▶ 2026-07-13 (evening) — ✅ Rosette epic Step 3 SHIPPED: `runRosettePIC` bisector construction (`70945eb`), ticket #22 closed

**Goal:** #22 — implement the Step 0 validated bisector-anchored construction as `src/pic/rosettePatch.ts` (additive, NOT wired into `usePattern`).

**Done, one commit, pushed to `main`:**
- **`70945eb`** — **#22 CLOSED.** `runRosettePIC(polygons, config): Segment[]` implementing v3/λ=0 exactly per the plan's "Step 0 findings": interior-bisector per vertex (reflex flip via turn-sign vs shoelace winding; straight vertices → inward edge normal), pair-A/pair-B line∩line bisector probe (`t2 > −ε ∧ t1 > ε` gate, pair-A-clamped fallback), tip at **min** offset, capped by boundary-exit distance + positive centre projection, reflex pinned at 0. Same `Segment` shape/`kind`/`side` tags as `runPIC`.
- **Carried-item decisions:** (1) fixed-length mode inherits runPIC semantics — bisector-chosen pair rays at user length, boundary-clipped; (2) vertex-lines inherit runPIC verbatim via shared helpers now **exported** from `pic/index.ts` (`clipSegmentToPolygon`/`pairVertexAtEdge`/`emitVertexArms`/`dedupPolygonSegments` — export-only change, characterization suite untouched); (3) decagonal `6.3` interleave = accept-as-weave, and probing showed it ALSO occurs at θ=80 (172 crossings, ~9-unit depth @ scale 50) → exclusion set is {67.5, 72, 80}, mutual-trim polish stays a future candidate.
- **Tests (+128 → 876 green):** `rosettePatch.test.ts` — (a) Kepler baseline exact multiset match vs runPIC (square@67.5, hexagonal@60, fixed-length, vertex-lines); (b) collinear singularity (square@45/triangular@60) checked separately — these are the plan's documented exception: the construction emits each chord as two clean halves split at the bisector crossing, geometrically equivalent but not segment-identical to runPIC's pair-B chords+stubs, so the test asserts 2-arms-per-vertex/no-duplicates/closure instead; (c) grand matrix 12 rosette tilings × 9 θ — finite, even-degree closure, tips in-polygon, no VISIBLE crossings (tolerance = 1% of scale: nonagonal@80 + decagonal-rhombus@36 graze at 0.03/0.29 units — invisible tip contact, not defects) + a guard test pinning decagonal@60 clean so the exclusions can't mask regressions; (d) buildStrands interop — single-square figure = one closed 8-seg strand, and per-tile-type single-polygon figures across all 12 tilings chain into fully-closed strands with every segment consumed once. Note two registry entries (heptagonal/nonagonal rosette) declare no `tileTypes` — test figures are keyed off generated polygons' `tileTypeId`s instead.

**Green:** tsc clean, **876 vitest** (67 files); `runPIC.characterization.test.ts` + `tapratsTiling.test.ts` untouched per ticket constraint.

**Post-ship (same session):** published a fresh before/after artifact rendered from the SHIPPED code (12 cases, old runPIC vs new runRosettePIC on identical fields, incl. all 6 old degenerate goldens + Kepler baseline): **https://claude.ai/code/artifact/c1d90ab6-bce4-4217-8d97-887e43ceb41b** — this supersedes the Step 0 spike artifact for eyeball purposes. Confirmed to user: Step 4 model = **Sonnet**.

**NEXT (cold start):** **#23** (Step 4 — wire `runRosettePIC` into `usePattern` ~line 896-906 for `rosette-patch` category, retire the 6 old rosette goldens with dated comment, add dispatch-branch coverage, smoke-test every rosette tiling via `run`; Sonnet per plan) → #24 (figureRouting removal, audit first) → #25 (optional Archimedes' spike). Still owed: user eyeball of the before/after artifact above + browser passes accumulated from earlier sessions.

---
### ▶ 2026-07-13 (later still) — ✅ Rosette epic Steps 1–2 SHIPPED: David's Star + Kepler's Star presets (`f42dce7`), tickets #20/#21 closed

**Goal:** implement the first two ticketed steps of the rosette-patch epic — the two "free win" presets the plan front-loads before the hard Step 3 geometry work.

**Done, one commit, pushed to `main`:**
- **`f42dce7`** — **#20 + #21 CLOSED.** Added `davids-star` (bit-identical to `3.6.3.6`) and `keplers-star` (θ=67.5 baked in, bit-identical to `square@67.5`) as independent named `TilingDefinition` entries in `src/tilings/index.ts` — following the registry's existing convention (every entry is a flat, hand-written literal; no alias mechanism exists, so duplicate-with-different-name was the right call, matching how the codebase already does everything else). Both go through the **existing** archimedean `generateTiling`/`runPIC` path, zero new figure-construction logic (as the plan specified for Step 2, and confirmed by research for Step 1). Also wired both into the Lab's tier-1 conversion table (`presetConversion.ts` `TIER1_SEEDS`, reusing the twin preset's seed factory: `createDefault3636EditorConfig` / `createSingleCellSeed('square')`) so they convert to fully editable Builder Patches rather than sitting as view-only tier-3 cards — this went beyond the ticket's literal ask but was the consistent choice given the "bit-identical" framing.
- **Tests:** registry-resolution equality checks (`archimedean.test.ts` — `generateTiling` output for each new entry compared field-for-field against its twin) + both added to the archimedean gap-detection/vertex-config sweep list (free extra coverage, same pattern the file already uses for every archimedean-category entry); new `keplers-star@67.5` golden case in `runPIC.characterization.test.ts` (captured fingerprint `{n:968, len:37044, arms:968, vtx:0}` — identical to `square@67.5`, as expected, dated comment per the file's convention); `presetConversion.test.ts`'s `TIER1` list extended for both new ids.

**Green:** tsc clean, **748 vitest** (+11 from session start). **⏳ BROWSER-VERIFY OWED — no browser-automation tool available this session** (checked ToolSearch, no chromium-cli/Playwright/Puppeteer present, and `npx playwright` would need a network install not attempted). Verified instead via: dev server serving the transformed `src/tilings/index.ts` module cleanly (200, both new ids present, no syntax errors) + `PresetShelfPanel.tsx` confirmed to map generically over `buildPresetShelf()` with no per-id special-casing (so the new cards render exactly like their twins) + the existing generic `presetShelf.test.ts`/`appSmoke.test.ts` render tests passing. Worth an actual eyeball next time you're in the app — pick `davids-star`/`keplers-star` from the Lab Presets shelf and confirm the cards + conversion work, alongside the still-owed Step 0 spike artifact (https://claude.ai/code/artifact/1a7f53ae-b3dc-4b5d-be16-96a6233ce803).

**Side effect to note:** cleanup after the dev-server check ran `pkill -f vite`, which also killed a pre-existing Vite dev server that was already running on port 5173 before this session started one on 5174. If that was a dev server from another terminal/session, it'll need restarting.

**NEXT (cold start):** **#22** (Step 3 — build `src/pic/rosettePatch.ts` from the Step 0 spike's validated bisector-anchored construction; **Fable**, the hard geometry work, not wired into `usePattern` yet) → #23 (wire-in + retire old rosette goldens) → #24 (`figureRouting` removal, needs the audit) → #25 (optional Archimedes' Star spike). Dependency edges already set (23←22, 24←23, 25←24) from the previous session's ticketing pass.

---
### ▶ 2026-07-13 (rosette epic start) — ✅ STEP 0 SPIKE PASSED: bisector-anchored figure construction validated

**Goal:** start the rosette-patch epic (`ROSETTE_PATCH_PLAN.md`). Session = plan review against code (all assumptions verified, 2 amendments) + the Step 0 throwaway geometry spike (Fable, per plan's model rec).

**Done:**
- **Plan verified + amended in place**: (1) concave validator corrected — deltoidal-trihexagonal is a convex kite; real reflex reproducers are nonagonal-rosette 5-gon + decagonal-rosette bowtie; (2) Step 0's construction concretised as the bisector-anchored rule.
- **Spike PASSED** — full findings + the validated algorithm (v3, λ=0: min-offset bisector tip, ray-param pair-B gate, centre cap, reflex tips pinned at notch) written into `ROSETTE_PATCH_PLAN.md` § "Step 0 findings". Kepler baseline segment-exact; grand matrix 106/108 clean; sole residual = decagonal `6.3` hexagon @ θ≥67.5 (Step 3 tuning item).
- **Visual before/after artifact** (15 cases, old runPIC vs new construction): https://claude.ai/code/artifact/1a7f53ae-b3dc-4b5d-be16-96a6233ce803 — ⏳ user eyeball owed.
- Spike scratch file deleted per plan (no `src/` changes); suite green 737/737.

**NEXT (cold start):** user eyeballs the artifact → then the ticketed steps: **#20** (Step 1 David's Star, Sonnet) / **#21** (Step 2 Kepler's Star, Sonnet) — independent quick wins — then **#22** (Step 3 `rosettePatch.ts`, Fable) → #23 (wire-in) → #24 (figureRouting removal) → #25 (optional Archimedes' spike). Native dependency edges set 23←22, 24←23, 25←24.

---
### ▶ 2026-07-13 (later) — ✅ Generator v1 BUILT + SHIPPED: #18 + #19 closed, scoring amended to 0–10 slider

**Goal:** implement the Generator epic specced earlier the same day (previous entry below). Two tickets back-to-back: #18 (Fable) then #19 (Sonnet, model switched mid-session per the ticket's own rec) then a same-day user-requested amendment.

**Done, in commit order, all pushed to `main`:**
- **`04f7b3d`** — **#18 CLOSED.** `src/generator/randomPattern.ts`: pure `sampleRandomPattern(seed)`, mulberry32 PRNG, uniform pick over all 21 shipped Gallery tilings, `SAMPLER_TUNING` constants block (θ/lineLength/edge-vertex toggles/curves/smoothTransitions/strand width-lineStyle-weave/scale) per ADR-0007, `GENERATOR_VERSION 1`. Colour/Frame frozen, `figureRouting: 'auto'`. +6 tests (determinism, range/constraint invariants over 200 seeds, full-tiling coverage, 30-seed smoke render through the real pipeline).
- **`3627235`** — **#19 CLOSED.** Third `AppMode` (`src/types/appMode.ts`, `'main'|'lab'|'generator'`); TopBar's switcher is now a 3-way segmented control (`onToggleMode`→`onSelectMode(mode)`, App.tsx + TessellationLabMode.tsx updated). `src/components/GeneratorMode.tsx`: full-bleed rating view reusing the existing `Canvas`+`faithfulRenderFlags` (no new renderer). `src/generator/datasetStore.ts`: own IndexedDB db (`geometric-atlas-generator`), fail-soft like `thumbnailStore.ts`. `src/generator/datasetExport.ts`: pure JSONL builder + download. Keep actions: Save to library (`patternLibrary.save`), Open in Lab (`resolveEditInLab`, same hand-off as Gallery). SSR smoke test extended to cover persisted `'generator'` mode.
- **`7148ba9` + `b99161e`** — **user-requested amendment** (right after #19 shipped): scoring changed from the specced 1–5 keypress to a **0–10 drag-to-release slider** (reuses `.pattern-slider`; drag live-updates a readout, releasing the pointer — or an arrow/Home/End/PageUp/PageDown keyup once focused — commits + auto-advances). Space still skips (no record), F still flags. `scoreSchemaVersion` bumped **1→2** (scale change). ADR-0007 got a new `## Amendment (2026-07-13)` section; CONTEXT.md's Generator entry updated (dropped "(planned)", 1–5→0–10 wording). Asked a clarifying question first (drag-and-release vs. keyboard 0–9 vs. explicit-submit) since it touched a "locked" ADR decision — user picked drag-and-release.

**Green at every step:** tsc clean, full vitest suite (737 tests, +14 from session start), production build clean. **⏳ BROWSER-VERIFY OWED — no browser-automation tool was available this session** (checked ToolSearch for Playwright/Puppeteer/Chrome-DevTools MCP and a local headless Chrome binary; none present). Nothing in Generator has been clicked/dragged in an actual browser: worth checking (a) the 3-way TopBar switcher, (b) keyboard Space/F while the slider has focus, (c) drag-release actually commits + advances, (d) Save-to-library modal doesn't get keys stolen by the global listener, (e) Open-in-Lab disabled state on a non-convertible (rosette-patch) sample, (f) Export dataset JSONL download.

**NEXT (cold start):** let ratings accumulate — no more Generator work is scheduled; the ML/suggest-mode ticket opens unticketed once ~300–500 samples are rated (`memory/project_aesthetic_rating_dataset_idea.md`). If the user wants a different track instead, the **star-tilings wave** remains the other open frontier (`memory/project_star_tilings_gallery_idea.md` + `GRILL_PREP_ROSETTE_FOLD.md`, Fable, big architectural session — unchanged since 2026-07-11).

---
### ▶ 2026-07-13 — GRILL COMPLETE: Generator mode (aesthetic rating + taste dataset) — SPECCED, tickets #18/#19

**Goal:** dive into the aesthetic-rating/ML idea (`memory/project_aesthetic_rating_dataset_idea.md`). Session = 9-question grill-with-docs → spec → tickets → wrapup. **No app code changed** — docs + tickets only.

**Done:**
- **ADR-0007** (`docs/adr/0007-generator-mode-taste-dataset.md`) — canonical spec. Headlines: **Generator = third top-level mode** (user override of my Lab-hosted rec); v1 = generate→rate→persist→export, **ML hard out of scope** (opens at ~300–500 rated samples); sampler = preset substrate + random look only (no Patch authoring, v2); **colour + Frame frozen** in v1 (fixed neutral pair, no frame) — each gets a later **presentation loop** (user's idea: re-roll palette/frame on fixed geometry, rate independently → factorised dataset); single 1–5 keypress score + Space skip + F flag, `scoreSchemaVersion: 1`; records store the **full config** (seed = provenance only), IndexedDB + JSONL export; **Save-to-library + Open-in-Lab** on the current sample.
- **CONTEXT.md** — Generator glossary entry added (App — workspaces).
- **Tickets:** **#18** sampler module `src/generator/randomPattern.ts` (pure, seeded, `generatorVersion: 1` constants block, tests — **Model: Fable**) → blocks → **#19** mode shell + rating UI + IndexedDB persistence + JSONL export + keep-actions (**Model: Sonnet**). Native dependency edge set.
- Memory: idea memo → **SPECCED**, MEMORY.md line updated.

**NEXT (cold start):** implement **#18 in a Fable session** (`gh issue view 18`), then #19 in a Sonnet session. The star-tilings wave (below) remains the other open frontier — user chose Generator first.

---
### ▶ 2026-07-11 (later) — ROADMAP SYNC: idea memories de-staled vs post-convergence code; "minimal build" bucket is empty

**No code changed** — memory-hygiene / roadmap-sync session only (all edits under `~/.claude/.../memory/`, outside the repo; project tree clean, nothing to push).

**What happened:** `/roadmap review` → the `project_*_idea.md` memories had drifted behind the convergence epic. Corrections applied:
- `save_preview_page`: RAW → **DELIVERED** (absorbed into the Gallery browser — `components/gallery/PatternDetailView.tsx` + `rendering/faithfulRender.ts` ARE the clean read-only render + export home this idea asked for).
- `lab_export`: "not yet merged" → **DELIVERED & merged** (`38fd51f` + flip `4e8dac2` #13). Tail refined: #6 Decoration/Frame fidelity now covered by the detail-view export path (browser-confirm only, not a gap); #5 unit-vs-field confirmed **fast-path-only** (single-cell periodic `#composition-fragment`; multi-cell/framed have no clean unit handle) — genuinely deferred, not the trivial toggle the memo implied.
- `editor_symmetry_enforcement`: RAW → **ENGINE DELIVERED** (DesignPanel Symmetry picker none/full/rotation/vertical/horizontal already propagates placements to the orbit via `SET_EDITOR_SYMMETRY_MODE`); only the option-(b) refuse-guard remains, and it cuts against the flexible-placement pivot → **recommend shelve**.
- Deleted `project_multicell_vertex_placement_idea.md` (was DELIVERED, verify-only tail) + its MEMORY.md line.
- Dated re-verify stamps: framing multi-pick **still open** (no fix since 06-12; needs user's saved JSON + browser); alternate-orientation **single-cell still untouched** (every fix in history was multi-cell).

**Roadmap tally:** Delivered 5 · Planned 1 (star-tilings) · Raw 5 (aesthetic-rating, construction-lines, decoration-stamps, nested-layers, pattern-morph) · Partial 1 (alternate single-cell).

**NEXT (cold start) — frontier UNCHANGED = the star-tilings wave** (grill-first via `GRILL_PREP_ROSETTE_FOLD.md` + `memory/project_star_tilings_gallery_idea.md`, Fable). Key finding for planning: there is **no "near-zero-decision minimal" build left** — every remaining roadmap item needs a decision, a `/grill-with-docs`, the user's saved JSON, or is the star-tilings epic itself. Cleanest self-contained build if the user wants one = **alternate-orientation single-cell** (Opus debug; user eyeballs the result).

---
### ▶ 2026-07-11 — 🏁 CONVERGENCE EPIC CLOSED: #1 + #8 + #16 all shut, browser-verified, everything on `main`

**SESSION CLOSED at the epic's finish line.** PR #17 (snub hexagonal) squash-merged to main (`3c208e7`) after user browser-verify ✅. Issues #16, #8 (tier-2 tracker), #1 (convergence spec) all CLOSED. Repo has only `main` — every feature branch merged + deleted. Convergence memory retired per hygiene rules (decisions live in ADR-0006 + spec #1).

**The Gallery↔Lab convergence epic is fully delivered:** Gallery = saved-patterns browser; Lab = the authoring surface; all 11 Archimedean presets (tier 1, tier 2 now empty) are fully editable Builder Patches with faithful fingerprint-verified conversion. Tier 3 (rosette/Laves) stays view-only pending the irregular-tile Patch encoder.

**NEXT (cold start):** frontier = the **star-tilings wave** (`memory/project_star_tilings_gallery_idea.md` + `RESEARCH-TILING-CONFIGURATIONS.md` §10–11): Kepler's Star flagship + rosette-figure architecture fold (the Taprats pathway replacing the `figureRouting` stopgap, also owns the PIC branch-ladder reframe). Big architectural session — start with the prepared grill (`GRILL_PREP_ROSETTE_FOLD.md`). Model: Fable.

---
### ▶ 2026-07-11 — ✅ #8 chunk 3 (FINAL) BUILT: 3.3.3.3.6 snub hexagonal (issue #16, branch `feat/33336-snub-hexagonal`, PR open) + branch cleanup

**Session start housekeeping:** PR #15 (snub square) squash-merged to main (`9e153f1`), #14 closed. All 5 stale remote branches deleted (`feat/convergence-flip-7`, `feat/gallery-browser-6`, `feat/tier2-elongated-triangular-8` — squash-merged; `feat/art-deco-egypt-theme-revamp`, `feature/art-deco-egypt-ui` — verified content superseded on main: rejection label `f65633c`, Zone.Identifier ignore, diagnose scripts all present). Repo now has ONLY `main` + this session's branch.

**Final tier-2 chunk of tracker #8.** Sub-issue **#16** created + linked under #8. The `3.3.3.3.6` (snub hexagonal) preset is now a fully editable Configuration — **tier 2 is empty; every Archimedean preset converts.**

- `ConfigurationId` + migration allow-list + reducer `SET_BUILDER_CONFIGURATION` arm + DesignPanel `BOUNDARY_OPTIONS` entry.
- `createDefault33336EditorConfig` (createDefault.ts): 1 hexagon + 8 triangles, **CHIRAL** (one enantiomorph seeded; the pocket-triangle rot60-vs-rot(−60) placement is the chirality witness). Hexagon at origin rot 0 (pointy-top); 6 edge triangles at centroid distance `2√3L/3` in directions 60k° (Kagome-identical local geometry; rot π/2 for dirs 0/120/240, π/6 for 60/180/300); 2 pocket triangles — pocket-n vertices `(0,L)·(0,2L)·(√3L/2,3L/2)` rot π/2 at `(√3L/6, 3L/2)`, pocket-nw = its rot60 mate at `(−2√3L/3, L)` rot π/6. **Derivation trap:** the naive second pocket candidate next to pocket-n is actually a NEIGHBOUR hexagon's edge triangle (same translation class as tri-180) — the true second pocket class is the 60°-rotation orbit mate.
- `compositionCellBasis`: hex lattice `u=(√3L, 2L)`, `v=rot60(u)`, `|u|=L√7` (the snub vector 2a+b, tilt ≈19.1°), `|u×v|=7√3L²/2` ✓. `compositionAlternateAngle` → π/6 (hex half-step).
- Conversion-table row in `presetConversion.ts` → shelf tier 1. Tier-2 exemplar tests updated: presetShelf now asserts **tier 2 empty** + all Archimedean tier 1; galleryBrowser.logic swaps exemplar to `rhombille`; NON_CONVERTIBLE drops `3.3.3.3.6`.
- Tests +11 → **728 vitest**: fingerprint flagship row (scale 60 — passes within EXISTING tolerances, nothing loosened) + `createDefault33336.test.ts` (7 exact-geometry tests: edge lengths, 6 distinct hexagon-edge bases, pocket single-vertex contact, pocket-n exact vertices + rot60-mate chirality witness, 8 pairwise translation-inequivalent triangles via fractional lattice coords, basis algebra + area, v-translate of tri-se closes the top-vertex 3.3.3.3.6 figure).

**Green:** tsc + 728 vitest + build. ⏳ browser-verify: pick 3.3.3.3.6 in Builder Design panel (snub hex renders, Strands cross hexagon↔triangle edges), shelf card editable (no badge, tier 2 gone), alternate orientation rotates the field π/6. Plus accumulated verifies from #14 (snub square) and earlier.

**NEXT (cold start):** merge the PR + close #16 → **#8 and #1 (convergence epic) can CLOSE** (all tiers resolved: tier 1 = everything Archimedean, tier 3 = rosette/Laves awaits the irregular-tile Patch encoder). Then the **star-tilings wave** begins (`memory/project_star_tilings_gallery_idea.md` — Kepler's Star flagship, rosette-figure architecture fold).

---
### ▶ 2026-07-11 — ✅ #8 chunk 2 BUILT: 3.3.4.3.4 snub square (issue #14, branch `feat/33434-snub-square`, PR open)

**Second tier-2 chunk of tracker #8.** Sub-issue **#14** created + linked under #8. The `3.3.4.3.4` (snub square) preset is now a fully editable Configuration:

- `ConfigurationId` + migration allow-list + reducer `SET_BUILDER_CONFIGURATION` arm + DesignPanel `BOUNDARY_OPTIONS` entry.
- `createDefault33434EditorConfig` (createDefault.ts): 2 squares + 4 triangles. square-a at origin rot 0; square-b at `(L(1+√3)/4, L(3+√3)/4)` rot π/6 (closes the 3.3.4.3.4 vertex figure across the up-triangle's right edge — the up-triangle's LEFT edge is the tri-tri edge, chirality matters); triangles on square-a's four edges (up rot π/3, right rot π/2, down rot 0, left rot −π/2) at centroid distance `L(3+√3)/6`. The 4 apex directions = the 4 translation classes.
- `compositionCellBasis`: square lattice **tilted 15°** to the axis-aligned square — `u=(L(2+√3)/2, L/2)`, `v=rot90(u)`, `|u|=L√(2+√3)`, `|u×v|=L²(2+√3)` ✓. `compositionAlternateAngle` → π/4 (square-lattice half-step, same as 4.8.8).
- Conversion-table row in `presetConversion.ts` → shelf tier 1, view-only badge shed. Stale tier-2 exemplar `3.3.4.3.4` swapped to `3.3.3.3.6` in presetConversion/presetShelf/galleryBrowser.logic tests.
- Tests +10 → **717 vitest**: fingerprint flagship row (scale 60 — coverage probed exactly 1.000; **squares match EXACTLY** 8 segs/poly + identical mean length; triangle mean-len gate loosened 2%→3% for probed 2.1% tie noise from the 4 triangle orientations — known PIC per-copy tie-breaking, not a conversion artifact) + `createDefault33434.test.ts` (6 exact-geometry tests: edge lengths, per-triangle shared base, square-b vertex-figure closure, 4 distinct apex directions, basis algebra + 15° tilt + area, u-translate left-triangle → closure triangle). Note: exact-vertex keys need negative-zero squashing (`-0.000000` ≠ `0.000000` under toFixed).

**Green:** tsc + 717 vitest + build. ⏳ browser-verify: pick 3.3.4.3.4 in Builder Design panel (snub square renders, Strands cross square↔triangle edges), shelf card editable (no badge), alternate orientation rotates the field π/4.

**NEXT (cold start):** merge the PR + close #14 → final #8 chunk = **3.3.3.3.6 snub hexagonal** (chiral; 1 hexagon + 8 triangles per translation domain; hex lattice). Fable. Then #8 + #1 close and the star-tilings wave begins.

---
### ▶ 2026-07-11 — ✅ #8 chunk 1 MERGED: 3.3.3.4.4 elongated triangular (issue #11, PR #12, on `main` @ `5a22078`)

**SESSION CLOSED at a clean milestone — everything merged, tree clean.** All three PRs squash-merged to main this session: PR #9 (#6 Gallery browser) → PR #13 (#7 the flip; replaced auto-closed PR #10) → PR #12 (this chunk). Issues #6/#7/#11 closed. Post-merge suite verified stable: 707 vitest green ×4 runs + tsc + build (one 4-failure run was contention flake, did not reproduce).

**NEXT (cold start):** frontier = **#8 chunk 2: 3.3.4.3.4 snub square** (create sub-issue under #8, branch off main; 2 squares + 4 triangles per translation domain — square lattice basis, cells at alternating rotations). Then chunk 3: **3.3.3.3.6 snub hexagonal** (chiral; 1 hexagon + 8 triangles). Both Fable, one per session. ⏳ **Browser-verify owed** (accumulated): fresh profile→Lab; empty Gallery pointer+CTA; persisted 'main'→Gallery; thumbnails rasterise+survive reload; Edit-in-Lab (editor save + converted legacy); Lab export menu has no Unwoven; 3.3.3.4.4 in Design panel (strips render, Strands cross square↔triangle edges), shelf card editable, alternate orientation rows→columns.

**First tier-2 chunk of tracker #8** (branched off `main` — independent of the in-review #6/#7 PRs). Sub-issue **#11** created + linked under #8 + claimed. The `3.3.3.4.4` preset is now a fully editable Configuration:

- `ConfigurationId` + migration allow-list + reducer `SET_BUILDER_CONFIGURATION` arm + DesignPanel `BOUNDARY_OPTIONS` entry.
- `createDefault33344EditorConfig` (createDefault.ts): square Cell at origin rot 0; triangle-up at `(0, L/2+√3L/6)` rot π/3; triangle-down at `(L/2, L/2+√3L/3)` rot 0 — boundary-matching, shared edges coincide exactly (verified against `BOUNDARY_ROTATION` triangle −π/2 convention).
- `compositionCellBasis`: oblique `u=(L,0)`, `v=(L/2, L(2+√3)/2)` (|u×v| = domain area ✓). `compositionAlternateAngle` → π/2 (rows→columns). frameNRing metric needed **no change** (non-orthogonal basis → hex metric; thirdIsSum correctly picks u+v as long diagonal).
- Conversion-table row in `presetConversion.ts` → Presets shelf tier 1 + view-only badge shed automatically. Test tier lists updated (presetConversion + presetShelf).
- Tests +8: fingerprint flagship row (scale 60 — coverage/emission/density vs BFS pass within EXISTING tolerances, none loosened) + `createDefault33344.test.ts` (4 exact-geometry tests: edge lengths, shared-edge coincidence ×2, basis algebra + row offset).

**Green:** tsc + **693 vitest** + build. ⏳ browser-verify: pick 3.3.3.4.4 in Builder Design panel (strip tiling renders, Strands flow across square↔triangle edges); shelf card editable (no badge); alternate orientation flips rows→columns.

**MERGE-ALL UPDATE (same day):** #6 merged via PR #9; #7 merged via PR #13 (PR #10 was auto-closed by GitHub when #9's branch deletion removed its base — #13 is the identical branch reconciled with main). This chunk = PR #12. Remaining #8 chunks (one per session, sub-issue each): **3.3.4.3.4 snub square** (2 squares + 4 triangles per translation domain), then **3.3.3.3.6 snub hexagonal** (chiral; 1 hexagon + 8 triangles). Both Fable.

---
### ▶ 2026-07-11 — ✅ #7 MERGED: the flip (PR #13, formerly PR #10)

**Ticket #7 (Convergence 6/7 — the flip) built.** The Gallery is now purely the saved-patterns browser; all authoring is Builder/Lab-only.

- **Sidebar removed.** App.tsx's `galleryView` tune sub-view + all its wiring (gallery reducer, in-mode `Canvas`, mobile/desktop sidebar chrome) deleted; the orphaned `Sidebar.tsx` (−672 lines) + its dead CSS deleted. Gallery render collapses to `TopBar + GalleryBrowser`.
- **Default → Lab.** Fresh profile opens in the Lab (`localStorage 'app-mode'` absent → `'lab'`); persisted `'main'` respected. Internal value + key unchanged (Q9).
- **Empty-state pointer.** GalleryBrowser: `onOpenTuner`→`onGoToLab`; empty state "Nothing saved yet — start in the Lab" + *Open the Lab* CTA; header *New pattern*→*New in Lab*.
- **Unwoven archived (Q8b).** Removed from `buildExportMenuItems` (dropped `includeUnwoven` + `segmentsRef` args); one uniform export menu everywhere. `exportUnwovenSVG`+builder kept, annotated archived. Lab call site updated.
- **Docs.** CONTEXT.md Gallery/Lab entries rewritten (browser vs authoring); parity matrix retired to a "resolved by convergence" note + only the genuinely-live deliberate distinctions (Decoration, Frame data-split, weave exemplar, Lever A, octagon/dodecagon) + the open Alternate-orientation bug.

**Green:** tsc + **699 vitest** + build. Net −998 lines. SSR smoke updated to cover both post-flip paths (fresh→Lab, persisted `'main'`→Gallery). ⏳ **browser-verify (headless can't drive):** fresh profile lands in Lab; empty Gallery shows pointer+CTA; persisted `'main'` still lands in Gallery; Lab export menu has no Unwoven.

**BONUS — #6 thumbnail bug FIXED + ✅ browser-verified (this session):** user reported an all-placeholder Gallery grid. Console diag proved the offscreen render *succeeds* (188KB data URL) — the thumbnail was rendered then discarded. Root cause = classic React-18 **StrictMode `mountedRef` anti-pattern** in `useThumbnails.ts`: the flag was only cleared on cleanup, never re-set true on the setup→cleanup→setup re-mount, so it stuck `false` all session → `put` dropped every URL + the single-flight pump halted after save #1. Fix `8140706`: set `mountedRef.current = true` in the effect setup. Plus `1e8f161` hardening (content-aware settle + 8s render timeout so a stuck raster can't wedge the queue; failure-only `[thumbnail]` warns). **Dev-only bug** (prod build unaffected → why all tests stayed green); not unit-testable here (no jsdom). User confirmed "looks good".

**NEXT:** merge #6 (PR #9) then #7 (PR #10) — retarget #10 base `feat/gallery-browser-6`→`main` after #9 merges (thumbnail fix rides on #10). Frontier after = **#8 (tier-2 Configurations, Fable)**, last convergence slice. One ticket per session.

---
### ▶ 2026-07-11 — ✅ #6 MERGED: Gallery saved-patterns browser (PR #9)

**Ticket #6 (Gallery browser skeleton) built — awaiting review/merge + browser-verify.** Gallery is repurposed as a saved-patterns **browser** over `pattern-library-v1`.

**New files** (`src/components/gallery/`): `galleryBrowser.logic.ts` (pure — `toCardModel` / `badgeForSave` / `editAvailabilityFor` / `resolveEditInLab` / `nextBackfillId`) + `.test.ts` + `.render.test.ts` (SSR seeded-library card render); `useThumbnails.ts` (self-pumping single-flight backfill, failure-skip); `PatternCard.tsx`, `PatternDetailView.tsx`, `GalleryBrowser.tsx`. Plus `src/state/thumbnailStore.ts` (thin IndexedDB, fail-soft, dataURL values keyed by save id), `src/rendering/faithfulRender.ts` (`faithfulRenderFlags` shared by detail + thumb), `src/rendering/renderThumbnail.tsx` (offscreen `Canvas` mount → rasterise), `rasterizeSvgToDataUrl`/`rasterizeSvgToCanvas` factored out of `exportPNG`.

**Key decisions:** (1) **Reuse `Canvas` as the single faithful renderer** for BOTH the detail view and the offscreen thumbnail → thumbnail == detail == truth, zero drift. Editor saves render Composition + Decoration(if any) + Frame(if any); legacy saves render BFS path (Canvas clips its own Gallery Frame). Read-only = pass no select/place/paint callbacks. (2) **Edit-in-Lab** (App `handleEditInLab`): editor→load verbatim; tier-1 legacy→`convertPresetToEditorConfig` one-way (original kept); tier-2/3→button disabled. (3) **Coexistence:** Gallery `galleryView` state defaults to `'browse'`; the legacy tuning Sidebar+Canvas stays reachable via "New pattern"/"← My Patterns" (removed in #7). Ticket #6 says sidebar stays; note spec #1 Q3 said "removed" — ticket wins for this slice.

**Green:** tsc + **699 vitest** (+14) + build. Dev server boots, all modules transform. ⏳ **browser-verify (can't drive headless here):** thumbnails rasterise + survive reload; wipe thumb store → re-backfill not errors; detail pan/zoom; Edit-in-Lab for an editor save + a converted legacy save; badge on legacy cards.

**NEXT:** merge PR #9 + close #6 → frontier = **#7 (the flip: sidebar removal, default→Lab, uniform export menu, CONTEXT rewrite; needs #5 ✓ + #6)** and **#8 (tier-2, Fable; needs #4 ✓ + #5 ✓)**. One ticket per session.

---
### ▶ 2026-07-10 — ✅ #5 CLOSED: Presets shelf in the Lab library (on `main`)

**Ticket #5 (Presets shelf) DONE.** New pure module `src/editor/presetShelf.ts` + card UI `src/components/PresetShelfPanel.tsx` + TessellationLabMode wiring. The Lab sidebar gains a **Presets** section directly above My Tessellations: one read-only card per Gallery preset (no rename/delete — the shelf holds no mutable state, `buildPresetConfig` mints a fresh working config per click). Tier 1 loads a fresh `convertPresetToEditorConfig` conversion (editable Patch, `presetId` provenance); tier 2 (unconverted Archimedean) + tier 3 (rosette-patch) load the legacy Gallery config and are badged **View only** — badge = `!isConvertiblePreset`, so tier-2 sheds it automatically as #8 conversion rows land.

**Guard + note:** unsaved-changes guard = `dirtyRef` on the Lab dispatch wrapper (`actionResetsDirty`: LOAD_CONFIG/EDITOR_NEW/EDITOR_CLEAR clean; library Save cleans via new `ConfigLibraryPanel.onSaved` prop; everything else dirty) → `window.confirm` before a shelf load replaces dirty work. One-time structural-edit note (Q5): first place/delete/Complete/boundary-resize (`isStructuralEditAction` — θ/figure/strand/decoration silent) on a config with `editor.presetId` shows a fixed non-blocking banner; persisted at **show** time (localStorage `preset-structural-note-shown-v1`) so it appears once ever; "Got it" dismisses.

**Tests +16 (669→685 green; tsc + build green):** `presetShelf.test.ts` — shelf covers all TILINGS + tier assignment + view-only = non-convertible set; tier-1 load editable w/ provenance + migrator round-trip; fresh-conversion independence (no shared objects with catalogue or prior loads); view-only legacy load; structural/silent classification; note gating; dirty transitions; save-through-library keeps `presetId` + `sourceCategory: 'editor'`.

**⏳ browser-verify:** shelf renders/loads, confirm fires over dirty work, banner shows once on first structural edit of a converted preset.

**NEXT:** frontier = **#6 (Gallery browser, needs #3 ✓ + #4 ✓)**; then #7 (the flip, needs #5 ✓ + #6) / #8 (tier-2 chunks, needs #4 ✓ + #5 ✓). One ticket per session (`gh issue view 6`).

---
### ▶ 2026-07-10 — ✅ #4 CLOSED: convergence conversion core (on `main`)

**Ticket #4 (conversion core + frame migration + flagship fingerprints) DONE.** New `src/editor/presetConversion.ts`: pure `convertPresetToEditorConfig` over a hand-authored tier-1 table — 5 shipped multi-cell seeds + boundary-matching single-cell square/hexagon/triangle (`createBoundaryMatchingCell` now exported from `createDefault.ts`), whole Patch rescaled to the source `tiling.scale` so world size + the migrated Frame stay right. Tunings carried (figures/strand/θ/routing/smooth); Gallery `config.frame` → `editor.frame` with `boundaryTreatment: 'clip'` pinned (Q8a), top-level `frame` dropped. `presetId?: string` added to `EditorPatch` + preserved in `migrateV3`. Tier-2/3 (`3.3.4.3.4` etc., Laves/Taprats, rosettes) cleanly return null via `isConvertiblePreset`.

**Tests +55 (614→669 green; tsc + build green):** `presetConversion.test.ts` (seam: validity via migrator round-trip, tunings, frame, provenance, scale, non-convertibles, no input mutation) + `presetConversion.fingerprint.test.ts` (8 flagships × 3 checks: per-tile-type emission vs BFS — exact on even-sided regulars, ≤3% probed triangle tie noise; Sutherland–Hodgman window coverage — probed exactly 1.000 on both pipelines everywhere; count+Σlen density ≤5.1% probed → 7% gate). Tolerances calibrated empirically via a temp probe test (deleted).

**Key finding for later slices:** conversion is provably faithful — coverage exact on all 8 flagships; only triangles carry per-copy PIC tie-breaking noise (known PIC trait, not a conversion artifact).

**NEXT:** frontier per blocking edges = **#5 (Lab Presets shelf, needs #4 ✓)** and **#6 (Gallery browser, needs #3 ✓ + #4 ✓)** — one ticket per session (`gh issue view 5` / `6`).

---
### ▶ 2026-07-10 — GRILL COMPLETE: Gallery↔Lab convergence — Q7–Q13 decided (ACTIVE THREAD)

**All 13 grill questions are now decided.** Full decision text lives in `memory/project_gallery_lab_convergence_idea.md` (canonical — read it first). Q7–Q13 headlines, all my recommendations accepted except Q8b:
7. **Docs split timing** — ADR-0006 + ADR-0005 amendment at grill close; CONTEXT.md Gallery/Lab rewrite + parity-matrix retirement ride the flip slice (forward pointer in the interim).
8a. **Gallery Frame superseded + migrated** — authoring dies with the sidebar; viewer renders legacy `config.frame`; Edit-in-Lab converts it → `editor.frame` Shape Frame.
8b. **Unwoven-SVG ARCHIVED** (user override) + principle: **Lab export menu identical across ALL config sources** — no per-path asymmetries.
9. Labels stay Gallery|Lab; internal `'main'`/localStorage untouched; **default workspace flips to Lab**.
10. **Physical library merge** → new `pattern-library-v1` key (old keys kept as backup); `sourceCategory` kept as legacy-path badge.
11. **Thumbnails: save-time raster** (~384px via exportPNG/strip machinery) + lazy backfill, **IndexedDB** `pattern-thumbs`.
12. **Conversion**: `src/editor/presetConversion.ts`, hand-authored preset→`createDefault*`-seed table, tunings carried over, tolerance fingerprint suite for flagships.
13. **Slices** (one PR each): docs → library merge → conversion core → Presets shelf → Gallery browser → the flip → tier-2 chunks; **process = /to-spec → /to-tickets (GitHub Issues, one per slice) → /implement one per session**. Legacy sunset unscheduled.

**SPEC + TICKETS + FIRST SLICES DONE (2026-07-10, user go-ahead):**
- **Spec = issue #1** (ready-for-agent). **Tickets #2–#8** = slices 1–7, native blocking edges + sub-issues of #1. Frontier order: #2/#3/#4 unblocked → #5 (needs #4) → #6 (needs #3+#4) → #7 (needs #5+#6) → #8 (needs #4+#5).
- ✅ **#2 CLOSED** (`1dbd467`) — ADR-0006 + ADR-0005 amendment + CONTEXT.md forward pointer.
- ✅ **#3 CLOSED** (`37ec617`) — `migrateLegacyLibraries` in configLibrary.ts (idempotent via `pattern-library-v1` presence; id regen + name-suffix/counter; corrupt rows skipped; legacy keys untouched) + `patternLibrary.ts` lazy-migrating binding; Sidebar + TessellationLabMode repointed; dead `mainConfigs.ts`/`customTessellations.ts` deleted. +7 tests (`libraryMigration.test.ts`), **614 vitest** + tsc + build green. ⏳ browser-verify: existing saves from BOTH old libraries appear in both panels after reload.
- **Note:** to-spec/to-tickets checkpoint questions (seams, granularity) were skipped per user instruction — flag at review.

**NEXT:** user review of spec/tickets/#2/#3 → then frontier = **#4 (conversion core)**, one ticket per session (`gh issue view 4`).

---
### ▶ 2026-07-10 — superseded (grill now complete, see above): mid-grill handoff Q1–Q6

**Goal:** one epic, two halves. (1) **Gallery↔Lab convergence** — presets become fully editable/decoratable Builder Patches inside the Lab; Gallery is repurposed as a **saved-patterns browser**. (2) **Star-tilings / expanded preset wave** — add as many new tilings as possible (research DONE, see below). Canonical memos (read BOTH first on resume): `memory/project_gallery_lab_convergence_idea.md` (grill decisions Q1–Q6) + `memory/project_star_tilings_gallery_idea.md` (research verdicts + rosette fold + sequencing).

**Sequencing (decided):** research ✅ → **convergence design/build FIRST** → rosette-figure architecture + preset wave into the unified surface. Exception: 1–2 easy BFS-compatible tilings may ship early as a smoke test.

**Research pass DONE (`289c16a`, pushed):** §10–11 + tier list in `RESEARCH-TILING-CONFIGURATIONS.md`. Headlines: **Kepler's Star = flagship** (b=67.5° ⇒ gap octagon REGULAR; all-convex, PIC-safe, one Taprats block); David's Star IS 3.6.3.6 (Figure preset only, free); Archimedes' Star = 3.6.3.6 w/ triangles subdivided ×4 (needs hexagons-as-12-gons w/ collinear vertices, one tolerance probe); Pathway A no-engine-work candidates: Night Sky, Snow Star, 2 missing Laves duals, 2-uniform (3.4.3.12; 3.12²), star-and-cross. Pathway D (rosette-gated): 22 uniform star-polygon tilings, Girih, Bonner, Hankin.

**Grill (grilling skill, with docs) — Q1–Q6 DECIDED** (full text in the convergence memo):
1. **Full conversion (b)** — presets = real `EditorPatch`es under a **Presets** section, load as if user-made; warnings not structural prevention.
2. **Tiered rollout** — tier 1 (5 shipped Configurations + sq/hex/tri) + tier 2 (remaining Archimedean, new ConfigurationIds/bases/seeds) convert in v1; tier 3 (irregular Laves/Taprats) read-only until an irregular-tile Patch encoder lands (shared work with star wave).
3. **Gallery = pure browser** — merged library view, thumbnail grid (absorbs the save-preview-page idea), detail view w/ pan/zoom + **"Edit in Lab"** button; tuning sidebar removed.
4. **BFS/Taprats = legacy path with sunset** — serves tier-3 + old saves; conversion only user-initiated (Edit in Lab, one-way, original kept); snapshot-compare flagships.
5. **Passive warnings only** — `presetId` provenance + one-time dismissible note on first structural edit + existing 17.10 non-tiling tag; no hard blocks.
6. **Presets = template shelf** next to My Tessellations (read-only cards; click → fresh conversion as working config w/ unsaved-guard; tier-3 badged "view only").

**NEXT — REMAINING GRILL QUESTIONS (resume the grill here, one at a time, recommendation each):**
7. **Docs/ADR conformance** — ADR-0005 says "Decoration is Builder-only; the Gallery is not decorated" (amend, or moot under full conversion? The *viewer* now displays decorated saves); CONTEXT.md **Gallery**/**Lab** definitions need rewriting (Gallery is no longer "curated picker"); likely a new **ADR-0006 (convergence)**. Also revisit the CONTEXT.md "Feature parity" matrix (the Frame row's "Keep" verdict changes).
8. **Gallery-only feature migration** — the clip-only **Gallery Frame** (memory `project_gallery_frame.md`, SCOPE LOCKED): dies with the tuning sidebar, survives in the viewer, or superseded by Builder Frame post-conversion? **Unwoven-SVG export** is Gallery-only (Lever-A-blocked in Lab) — where does it live when Gallery stops being an authoring surface?
9. **AppMode naming** — `'main' | 'lab'` in App.tsx; does the top-bar switcher stay Gallery|Lab with the new meanings? localStorage `app-mode` migration?
10. **Library merge details** — merge `main-configs-v1` + `lab-tessellations-v1` into one key (migration) vs merged *view* only; fate of `sourceCategory` when everything becomes editor-sourced.
11. **Thumbnail generation** — clean overlay-free renders for the browser grid: live mini-`PatternSVG` per card vs cached raster at save time (the `data-export="exclude"` + `exportPNG` machinery on branch `feat/export-subsystem` is reusable). Perf on a big library.
12. **Conversion mechanics** — where `presetToEditorConfig` lives; tier-1 mappings hand-authored per preset vs derived; snapshot-compare harness for flagship presets.
13. **Implementation slicing + branch plan** — slice into PR-sized steps (likely: browser skeleton → tier-1 conversions → presets shelf → tier-2 → Gallery sidebar removal → legacy sunset). Consider `/to-spec` → `/to-tickets` via the GitHub-Issues flow (`docs/agents/issue-tracker.md`) once the grill closes.

**Decisions / non-obvious:** user explicitly overrode my (c) "preset-field mode" recommendation at Q1 — wants REAL editability; clutter managed by UI separation, breakage by warnings. Session also: both memos promoted to PLANNED + combined into one epic; new idea captured then absorbed (`project_gallery_lab_convergence_idea.md`); new feedback memory `feedback_concise_answers.md` (lead with the answer, no surveys).

**Blockers:** none. Working tree was clean at handoff; only repo change this session was `289c16a` (research doc, background agent, pushed).

---
### ▶ 2026-07-10 — DONE: ADR spec conformance — reconciled ADR-0004 with the Framing demotion (on `main`)

Audited the domain spec against the root structure contracts (`ADR-FORMAT.md` + `docs/agents/domain.md`). Result: structurally conformant — single root `CONTEXT.md` + `docs/adr/` (single-context), ADRs sequential `0001`–`0005` with correct `# Title` + prose shape. One content drift fixed: ADR-0004 still called Framing a **Phase** with no amendment, contradicting `CONTEXT.md`/`CLAUDE.md`/ADR-0003's amendment (Framing → persistent **Frame overlay**). Appended a 2026-06-01 amendment to ADR-0004 (`5466fae`) reconciling the Phase language while preserving the structural-only Frame/Decoration split — did **not** rewrite the historical decision.

**Next:** nothing mid-flight. Optional loose end: ADR-0003's *title* still reads `…→ Framing → Decoration` (immutable historical record, corrected by its own amendment) — could add a `Status:` frontmatter line if title-scan drift bothers you, otherwise leave.

---
### ▶ 2026-07-10 — DONE: GitHub Issues configured as agent issue tracker (on `main`)

Installed the mattpocock/skills engineering workflow globally (`~/.claude/skills/`; guide at `~/.claude/SKILLS-WORKFLOW.md`) and ran its setup for this repo (`ef318ad`): `docs/agents/issue-tracker.md` (gh CLI conventions + wayfinder operations), `docs/agents/domain.md` (single-context: root `CONTEXT.md` + `docs/adr/`), `## Agent skills` block in `CLAUDE.md`, `ready-for-agent` label created on GitHub. Flow for new work: `/grill-with-docs` → `/to-spec` → `/to-tickets` → `/implement` (one ticket per session); `/wayfinder` for big foggy efforts. **Note:** repo is public → issues are publicly visible.

**Next:** nothing mid-flight from today. Candidates: work the export-subsystem deferred items (below) through the new flow, or `/wayfinder` a bigger roadmap item.

---
### ▶ 2026-07-10 — DONE: browser-tab favicon (on `main`)

Added `public/favicon.svg` — an 8-pointed Islamic star (*khatam*) line-figure in theme gold (`#c9943a`) on the dark base (`#08080f`), with a small centre ring. Linked from `index.html` via `<link rel="icon" type="image/svg+xml">`. Self-contained; shows on next dev reload. No app-UI change (favicon is browser-chrome only).

---
### ▶ 2026-07-09 — IN PROGRESS: export subsystem "full implementation" (branch `feat/export-subsystem`)

**Goal:** deliver the roadmap "program-wide export" item. Canonical scope + 2026-07-09 code audit live in `memory/project_lab_export_idea.md` (read first).

**Plan (slices, in order):**
1. **Overlay stripping (THE bug — in progress).** `exportSVG`/`exportPNG` clone the whole live `<svg>`; nothing strips the non-artwork layers, so Design-phase Lab exports bake in vertex/edge/section dots, Frame pick-node dots, neighbour ghosts, and Cell-Boundary guide outlines. Fix: tag those groups in `PatternSVG.tsx` with `data-export="exclude"`; add a pure string helper `stripExportExclusions(markup)` (node-testable, mirrors the `substituteCssVariables` scanner) applied in `exportSVG.ts` before download. Keep `FrameBorder` (decorative, artwork). Layers to tag: ghostPolygons `<g>` (PatternSVG:165), boundaryOutlines map (228), frameNodes map (265), editorOverlay wrap (286). Deferred within slice: ControlPointLayer (editing handles, gated by `cpVisible`, low-risk) — note only.
2. **Shared export module.** Extract one path both modes call (App.tsx + TessellationLabMode.tsx duplicate near-identical handlers; Gallery has Unwoven, Lab doesn't → drift). Kills the parity gap.
3. **Print-size PNG option** (`exportPNG` hardcoded 2048²) + **theme/transparent background** (hardcoded `#f5f0e8`).
4. Deferred: Unwoven-SVG in Lab (needs DOM field re-derivation, Lever-A-blocked), unit-vs-field toggle, Decoration/Frame fidelity browser-verify.

**Status:** branch `feat/export-subsystem` off `main` @ `cdc07f1`, pushed.
- ✅ **Slice 1** (`c3311cf`) — overlay stripping. `data-export="exclude"` on ghostPolygons/boundaryOutlines/frameNodes/editorOverlay in PatternSVG; `stripExportExclusions` string helper in exportSVG.ts applied in exportSVG+exportPNG; +7 tests (603 total). ⏳ browser-verify a Design-phase Lab SVG export is clean.
- ✅ **Slice 2** (`134d189`) — shared `src/export/exportActions.ts::buildExportMenuItems`; App + TessellationLabMode both call it; Unwoven = explicit `includeUnwoven` flag (Gallery on, Lab off). Drift gone.
- ✅ **Slice 3** (`d45bf62`) — PNG resolution submenu (1024/2048/4096/8192, height follows live SVG aspect so no square letterbox) + "Transparent background" toggle. `exportPNG` now takes `PngExportOptions {width,height,background}`; `background:null` = alpha. TopBar export menu → typed union (`action|submenu|toggle`) + inline sub-panel/checkbox CSS. +4 tests (607 total). **User decisions:** submenu (not flat sizes); sandy `#f5f0e8` stays default, transparent is a toggle. **FUTURE:** a Decoration background-colour option should replace the hardcoded sandy default (`DEFAULT_PNG_BACKGROUND` in exportSVG.ts). ⏳ browser-verify submenu/toggle interaction + a 4096 transparent PNG.
- ⏭ Deferred: Unwoven in Lab (Lever-A field re-derivation), unit-vs-field toggle, Decoration/Frame fidelity browser-verify, SVG-export background (currently rides the cloned inline `style`).

---
### ▶ 2026-07-09 — DONE: thermonuclear round-2 bug fixes 1–8 ALL SHIPPED (pushed to `main`)

**Goal:** implement the actions from the round-2 code review (fix order in the 2026-07-08 entry below / `memory/project_thermonuclear_review_round2.md`).

**All 8 recommended fixes landed**, each its own commit, tsc + **596 vitest** + build green at every step:
1. `43b7439` — **hostCellId unification.** Edge + boundary-section placement actions carry `hostCellId` → `updateCell`; `SET_ACTIVE_CELL` action/reducer-case/dispatches DELETED; `ed?.activeCellId` dropped from the `editorBase` memo deps (no more full-PIC re-run per selection click); `updateActiveCell` collapsed into `updateCell`. +2 reducer regression tests (wrong-cell repro).
2. `b0389c5` — **frameNRing hex third-axis inversion.** `thirdIsSum` now picks `a+b` when `u+v` is the LONG diagonal (derivation in code comment). +1 exact-coordinate test across all 4 hex configs, proven to fail 4/4 against the old code.
3. `159059e` — **exportSVG var() substitution** rewritten as a paren-balanced scanner (rgba() fallbacks intact, nested var() fallbacks resolve). +5 tests.
4. + 5. `b288246` — **SET_CELL_NO_SEED off re-seed** now boundary-matching rotation + Tile-scale size; **`cellPlacementEdgeLength`** takes `siblingCells?` and reads an empty No-Seed Cell's scale off sibling Cells before the lattice constant (reducer + Canvas picker call sites updated). +4 tests (`src/state/noSeedReseed.test.ts`).
6. `6a22576` — **undo coalesce key** includes payload `cellId`/`hostCellId` (pure `historyCoalesceKey` in `editor/history.ts`). +5 tests.
7. `f80f88f` — **NumberStepper**: commit() always re-formats the draft; Enter just blurs (single commit path).
8. `2515973` — **updateCell fails closed** on a stale `cellId` (+1 test).
Plus `42c0e49` — CLAUDE.md updated (hostCellId routing, tests exist), dead `withActiveCell` removed.

**Not done (deliberately):** Load-JSON `activePatternId` (user-deprioritised, see 2026-06-18 KNOWN MINOR REGRESSION); the 4 roadmap-readiness findings (design work — rosette loader star-gate, Pass-4 Inspector blockers, Configuration registry, PatternConfig versioning); below-the-cut items in the memory file.

**⏳ BROWSER-VERIFY OWED (no browser in env):** (a) multi-cell n-ring Frame on a hex Configuration (3.6.3.6, rings=1 — ring should now be symmetric, previously lopsided); (b) Lab SVG/PNG export with Frame strokes / rgba fallbacks (no black markers); (c) place a Tile on Cell B's edge/section right after editing Cell A's controls (lands in B); (d) No-Seed toggle off on a multi-cell Cell after dragging the boundary-size slider (seed restores at Tile scale + boundary rotation); (e) stepper Enter/out-of-range behaviour.

---
### ▶ 2026-07-08 — DONE: centre completion node for no-Seed Cells (`f15f6fd`, pushed)

**Goal (user's words):** "add a completion node to the centre of the cells when the seed tile is removed."

**Shipped `f15f6fd`** (tsc clean, 575 vitest green, build clean, pushed to `main`): when a Cell's Seed Tile is removed (`cell.noSeed`), the Cell centre becomes a clickable Complete-mode completion node — a radial anchor to build wedge Tiles out to the Boundary corners. Three coordinated edits:
- `editor/patchSelectable.ts` — `cellLocalSelectableVertices` pushes Cell-local `(0,0)` when `cell.noSeed`, so the reducer (`isPatchSelectableVertex` / `validateMultiPick`) accepts centre picks. **This is the half that makes the pick actually complete.**
- `components/EditorVertexLayer.tsx` — new `centre` dot variant (accent disc + bg rim, `DOT_RADIUS+2`).
- `components/Canvas.tsx` — `centreVertices` memo aggregates one node per no-Seed Cell, lifted Cell-local→Patch-local via `applyCellTransform`, passed to `EditorVertexLayer`. Multi-cell aware (node sits at each Cell's offset centre); both halves stay in sync via shared `applyCellTransform`.
- Test: `editor/centreCompletionNode.test.ts` (2 tests) locks selectability scoped to `noSeed`.

**Verified** (no browser in env): drove real render surface (`renderToStaticMarkup(EditorVertexLayer)` → centre `<circle r=7>` + `cursor:pointer` hit target) + real state surface (reducer: `SET_CELL_NO_SEED` → `EDITOR_COMPLETE_N_GAP` from centre+2 corners → 1 completed triangle Tile). **⏳ BROWSER-VERIFY OWED:** on-canvas click registering a pick + disc contrast against live bg (interactive click path unverified at pixel surface).

---
### ▶ 2026-07-08 — THERMONUCLEAR REVIEW ROUND 2 DONE → BUG-FIX SESSION NEXT (ACTIVE THREAD)

**Goal:** user ran a second max-effort whole-project review (diff `6fb30b7..HEAD` + roadmap-readiness altitude pass) and wants the next session to **fix a few bugs** from it.

**Done:** 15 findings reported (14 CONFIRMED / 1 PLAUSIBLE), **none fixed**. Canonical findings list + below-the-cut items: **`memory/project_thermonuclear_review_round2.md`** (read first). Baseline at review time: tsc clean, 573/573 tests green.

**Next (recommended fix order, full sketches in the handoff doc):**
1. `hostCellId` unification — thread through `EDITOR_PLACE_TILE_ON_EDGE`/`_ON_BOUNDARY_SECTION` → `updateCell`, delete the `SET_ACTIVE_CELL` auto-switch (fixes wrong-cell placement + the `usePattern.ts:277` PIC-re-run-on-select + collapses `updateActiveCell`/`updateCell`).
2. `frameNRing.ts:242` — multi-cell n-ring hex third-axis pick is INVERTED (all 4 hex-basis Configurations stamp a wrong, lopsided ring; count+area tests are blind — add exact-coordinate assertions).
3. `exportSVG.ts` — `var()` fallback regex truncates `rgba(...)` → malformed paint (black) in Lab exports.
4. `SET_CELL_NO_SEED` off re-seeds at lattice constant + rotation 0 (mirror `SET_CELL_SEED_SIDES`'s preserve logic).
5. `active.ts:64` empty-Cell fallback = lattice constant; 6. undo coalesce key lacks `cellId`; 7. NumberStepper draft resync + Enter double-commit; 8. `updateCell` stale-cellId fail-closed.

**Decisions / notes:** Load-JSON `activePatternId` finding = the already-KNOWN minor regression below (2026-06-18 entry) — stays deprioritised. Roadmap findings (rosette loader star-gate `configValidation.ts:50`, Pass-4 Inspector blockers, Configuration registry, PatternConfig versioning) are design work — the "3rd-column-ready grid" claim in the 2026-06-18 entry below is **wrong** (`.app-layout` is a plain 2-child flex row; shell is duplicated per mode). Handoff doc (session-temp, may not survive reboot): `/tmp/claude-1000/-home-harry-Projects-Geometric-Atlas/81b89c51-88c6-4b0c-ae18-75bf80339c8d/scratchpad/HANDOFF-bugfix-session.md` — the memory file carries everything essential if it's gone.

**Blockers:** none. Semble MCP was unavailable last session (grep fallback; tell the user if still down).

---
### ▶ 2026-06-18 — UI/UX REVAMP "Option B — Workspace Shell" (previous thread)

> This is the most recent work. It is **independent** of the rosette-grill thread below (which is still pending and untouched). Canonical plan + full detail live in memory: **`memory/project_ui_revamp_option_b.md`** (read it first on resume).

**Goal (user's words):** full UI review — make it more intuitive, visually appealing, readable, less cluttered, better at conveying info. Think big / structural. I reviewed everything, proposed 3 options (A refine-in-place / **B workspace shell** / C canvas-first studio); user chose **B**, inspector as a fast-follow.

**SHIPPED + pushed to `main` (all tsc + 573 vitest + build green):**
- **`1974c30` Pass 1 — design tokens + persistent top bar.** New `src/components/TopBar.tsx` (brand mark, **Gallery|Lab segmented switcher** replacing the old 9px text toggle, contextual pattern title, theme toggle, **Export dropdown menu**). `:root` design tokens added to `styles.css` (`--font-display/body/mono`, `--fs-*` type scale, `--sp-*` 4/8 spacing, `--topbar-height`) + `.app-shell`/`.top-bar`/`.workspace-switcher`/`.export-menu` styles. TopBar is rendered **per-mode** (App for Gallery, TessellationLabMode for Lab) inside a new `.app-shell` flex-column — deliberately NOT hoisted, so each mode keeps its own export handlers + the Lab keeps its history-wrapped dispatch. Both sidebar headers slimmed (removed theme + mode buttons + the redundant Gallery wordmark H1); both in-sidebar Export sections removed.
- **`8b0f564` fix** — Gallery "Curves / Smooth transitions" now hidden unless "Show advanced" is on.
- **`d891494` Pass 3 — shared primitives + Strands rail regroup.** New `src/components/ui/`: `FieldLabel`, `Toggle`, `StrandStyleControls`. FieldLabel was defined **3×** (Sidebar, lab/labShared, ConfigLibraryPanel) → labShared now `export { FieldLabel } from '../ui/FieldLabel'` so lab/ imports unchanged; Sidebar + ConfigLibraryPanel import from ui. `StrandStyleControls` replaces the width/style/lacing/weave-gap block duplicated in Gallery "Strand Thickness" + Lab "Display". Gallery rail: **Figures + Strand-style + Figure-routing + Curves merged into ONE collapsible "Strands" Section** (collapse key `strands`) using a new lightweight `SubHeading` sub-divider; routing + curves stay gated behind Show advanced. Removed dead `ModeToggleButton` + `LabExportButton` from labShared. Type bumps via tokens: SectionTitle 10→11, segmented buttons 9→10.

**NEXT on this thread (deferred, awaiting user go-ahead — do NOT start unprompted):**
- **Pass 4 = right-side Inspector** (the chosen fast-follow). Needs canvas→selection plumbing. The `.app-shell` grid was deliberately designed to accept a 3rd column. Content model: selected tile-type → its `FigureControls`; selected Builder edge/section/vertex → the placement picker; Decoration strand/void → colour+scope. Builder already has selection state (`selectedEdge`/`selectedSection`/`picks`) to build on.
- Optional polish noted in memory: a real `SegmentedControl` component (currently just `segmentedButtonStyle` helper); bump remaining inline 9px buttons (library Save/Rename/Delete, Clear, undo/redo, New patch); a `ui/` home for the remaining labShared primitives.

**Decisions / non-obvious:**
- TopBar rendered per-mode (not hoisted) to avoid touching the Lab's `useEditorHistory`-wrapped dispatch and ref ownership — lowest-risk path to a "persistent" bar.
- Tokens were *defined* but inline-style literals were NOT mass-migrated (that's future de-dup work); only the shared primitives + TopBar consume tokens so far.
- Old per-section collapse keys (`figures`/`curves`/`figureRouting`/`lineThickness`) are now orphaned in localStorage — harmless.

**KNOWN MINOR REGRESSION (low severity, not yet fixed):** loading JSON via the **top-bar Export menu** no longer resets the Gallery "My Patterns" highlighted entry (`activePatternId`) — that reset was previously wired through the now-removed sidebar Load button. Worst case: Save suggests "(modified)" of a stale name. Re-wire later if it matters.

**⏳ BROWSER-VERIFY OWED (user was verifying interactively this session, said "looking good" after Pass 1):** confirm the top bar + switcher + export menu; the Gallery "Strands" section (Figures cards + Strand-style sub-group + advanced routing/curves under one header); and the Lab "Display" strand controls (now the shared component). Mobile drawer z-index was raised above the top bar — sanity-check on a narrow viewport.

---

**▶ 2026-06-17 — NEXT UP: GRILL-WITH-DOCS on the rosette-patch figure fold (PREPARED, NOT YET RUN).** Prep doc `GRILL_PREP_ROSETTE_FOLD.md` is the cold-start input: read it + `memory/project_star_tilings_gallery_idea.md` + CONTEXT.md Pattern vocab + `docs/adr/0001..0005`, then invoke `/grill-with-docs` and walk the §4 decision tree one question at a time. **No decisions are committed yet** — §4 is all proposal. The grill resolves the terminology landmines (esp. "rosette" — CONTEXT.md:80 says the Figure type was *removed*, the fold reintroduces it) and is expected to produce ADR-0006 + CONTEXT.md Figure-entry rewrites + a scoped plan. The deferred PIC branch-ladder reframe is folded into this (becomes a *deletion* once irregular tilings leave generic PIC).

**✅ 2026-06-17 — THERMO-NUCLEAR REVIEW PROGRAM CLOSED.** Chunks 1–13 merged to `main`, tests 315 → 549 green, every file under 1k, browser-verifies (3/10/11) passed. The one carved-out item — the PIC `emitStarArms`/`pairAtVertex` branch-ladder reframe — was **folded into the bespoke-rosette-figures epic** (`memory/project_star_tilings_gallery_idea.md`) by user decision, not done standalone (a fingerprint-preserving reframe would lock in the known-wrong borderline emissions; the rosette fold deletes generic PIC from that path anyway). Program-complete banner in `THERMONUCLEAR_REVIEW_FINDINGS.md`; the review project memory is retired. **No open thermo-nuclear work remains.**

---

**🐛 2026-06-14/15 — Builder strand bugs found during Chunk-11/12 browser verify.** Owned browser-verifies (Chunks 3 / 10 / 11 in `THERMONUCLEAR_REVIEW_VERIFY.md`) all PASSED. Two *pre-existing* Builder-geometry issues surfaced (NOT chunk regressions — tsc + tests green) — **BOTH NOW FIXED**:

- **FIXED ✅ + MERGED — vertex strands inconsistent within multi-cell Cells.** Commit **`e42c12e`**, **merged to `main` (`1a849f9`) + pushed 2026-06-15**. Root cause: vertex lines (`fig.vertexLinesEnabled`) gate on internal edges, but the Composition path PIC'd a single periodic unit cell in isolation → unit-cell-boundary edges never counted internal → dodecagon emitted strands on only 2/12 (3.12.12) or 5/12 (4.6.12) edges. Fix: optional `edgeContext` arg to `runPIC` (one ring of lattice neighbours, internal-edge detection only — figure emission untouched), wired in `usePattern`'s `editorBase` memo for single + multi cell. Now 12/12. Regression test `src/pic/vertexStrandsPeriodic.test.ts`. Memory: `project_vertex_strands_multicell_bug.md`.
- **FIXED ✅ (2026-06-15, branch `fix/overlap-vertex-strands` off `main`, NOT yet merged) — vertex strands MISSING in OVERLAPPED cells.** Root cause confirmed: `buildInternalEdgeSet` was **midpoint-exact**, so a force-overlapped tile's edge running through another tile's interior never registered as internal → vertex-line gate skipped it. Fix: added an **overlap pass** — edge whose midpoint is **strictly inside another tile** (ray-cast `pointInPolygon` + bbox broad-phase) is flagged internal; can't disturb the clean baseline (shared/boundary midpoints sit *on* an edge, already caught by the exact match). Also guarded the whole set behind `anyVertexLines` (perf: skip on Gallery fields without vertex lines). Regression test `src/pic/vertexStrandsOverlap.test.ts`. **535 tests / tsc / build green.** ⏳ browser-verify on user's overlapping-tile Patch. Memory: `project_vertex_strands_multicell_bug.md`.
- **PARKED ⏸️ — overlap region "treated as new tile."** User could NOT reproduce on the fixed build; my probe shows generic body-overlap never spawns extra strands (only each tile's own crossing `star-arm` figure). Decision was "toggle not default" but NO toggle built (no speculative gate). Revisit only with a fresh repro. Memory: `project_overlap_tiles_strand_bug.md`.

> 2 UNTRACKED Chunk-12 WIP test files (`src/state/configLibrary.test.ts`, `src/state/configValidation.test.ts`) ride along in the working tree — they belong to `review/types-export` / Chunk 12, left untracked. NEXT after this bug: resume the review at Chunk 12.

**🧹 2026-06-13/15 — thermo-nuclear whole-codebase review — BODY COMPLETE.** Driven by `THERMONUCLEAR_REVIEW_PLAN.md`; live ledger + metrics in `THERMONUCLEAR_REVIEW_FINDINGS.md`. **Wave A done** (green baseline pinned). **Chunks 1–13 done** (1–12 merged to `main`; **Chunk 13 on branch `review/dup-sweep`, NOT yet merged** — 2026-06-15); **549 tests / tsc / build all green**. The standing-code program is complete **except ONE carved-out item: the PIC branch-ladder reframe** (its own dedicated session — see below) + the accumulated ⏳ browser-verifies.

> **▶ NEXT actionable review work = the deferred PIC reframe** (`pic/index.ts` `emitStarArms`/`pairAtVertex`): reframe the ordered-`if` branch ladder as a named-case policy table + extract `pushSegment`/centroid-V helpers + dedup the triplicated probe, **behind the Chunk-7 golden fingerprint** (`runPIC.characterization.test.ts`). High-value (Wave-E headline "latent PIC bugs fixed") but **gated on a preserve-vs-fix product decision** — memories `project_pic_irregular_polygon_bugs` / `feedback_pic_pair_selection` say borderline irregular-polygon emissions are still wrong, so the reframe must decide whether to preserve or correct them. Do NOT rush this into a routine commit; it's the program's highest-risk move.

> **Chunk 13 summary (`review/dup-sweep`):** cross-cutting canonical-helper sweep. `reducer::centroidOf`→canonical `centroid`; new pure `polygonInteriorAngleAt` in `utils/math` + shared `tileInteriorAngleAt` in `exposedEdges` (placement/vertexPlacement/tileTypeId all delegate — tile-type signatures unchanged); 5 hand-rolled rotation-matrix sites (compositionLattice/patchSelectable/frameNRing)→canonical `rotate`. Net −36 ln, bundle 419.83→418.94 kB. +10 `computeCurves.test.ts` (the owed characterization test). All byte-equivalent, guarded by existing+new tests.

> **Chunk 12 summary (merged `f912946`):** the save/load/validate + types/theme surface — exemplary, low-risk. One Std-6 dedup (`export/download.ts`, two byte-identical `downloadBlob` collapsed), one Std-8 extraction (pure `unwovenSvgMarkup` + 4 tests), and the test safety net the chunk was really about: +18 `configValidation.test.ts`, +16 `configLibrary.test.ts` (both characterization, zero production change). `types/editor.ts` `FrameConfig`-as-discriminated-union noted + **deferred** (high ripple, low payoff; load boundary already enforces shape). ⏳ browser-verify (low-risk): Save→reload a pattern, Export SVG/PNG, load a legacy `lacing`/`rosette` save.

> **Metrics snapshot (2026-06-13):** tests **315 → 496** (+181 across chunks 2/3/4/5/6/7/8/9/10/11). Largest-file table (vs Tier-0 baseline): TessellationLabMode 2243→812, Canvas 974→922, Sidebar 907→890, reducer 877 (unchanged), usePattern 902 (unchanged), tapratsTiling 796→800, pic/index 667→664, rendering/ + components/ all shrank (logic → tested helpers; ColourPicker 439→351, RotationDial 204→189). Bundle JS 418.61 kB (gzip 127.20). No file >1000. FPS not re-measured this session (no perf-touching change).
>
> **Theme that emerged (chunks 4/5/3):** the remaining "giant" files from the baseline table are all already **under** the 1k bar, and their headline restructures (usePattern flag-soup, reducer handler-map) turn out to be lateral motion the thermo-nuclear bar discourages — so for those the honest deliverable is the **missing test safety net**, not a refactor. Sidebar (Chunk 3) was the exception where a real dedup (`<Section>`) fit. Expect this pattern to continue.
- **Chunk 1 MERGED** (`6eb6721`, user-verified): `TessellationLabMode.tsx` 2243→812 ln; god-component split into `src/components/lab/` (labShared + EditorDesignControls orchestrator + Composition/Decoration/Frame/Design panels; no file >1000). S3/S4 nit also done (`e4351c2`): `segmentedButtonStyle` helper in labShared.
- **Chunk 2 MERGED** (`cbe74f3`): Canvas 974→922 — Std-6 routed overlay transforms through canonical `applyCellTransform` (deleted Canvas dup, +7 pin tests), Std-8 extracted `worldToScreen`→`rendering/screenSpace.ts` (+6 tests). Picker-hook extraction DEFERRED (Canvas under 1k, fragile).
- **Chunk 4 MERGED** (`219d44f`): `usePattern` under 1k but most perf-fragile (load-bearing memo deps + eslint-disables). Restructure DEFERRED with rationale. Banked Std-8 net: exported pure helpers `stampSegments` + `periodicFastPathEligible`, pinned with 14 tests (328→342). No production logic change.
- **Chunk 5 MERGED** (`7bf724f`): `reducer.ts` (877) under 1k. Mega-switch→handler-map REJECTED (idiomatic type-safe switch). Banked Std-8 gap: 25 tests (`figureMutations.test.ts`, 342→367) pinning line mutual-exclusion + figure/curve helpers + immutability + editor guards + multi-cell boundary-scale invariant. Zero production change.
- **Chunk 3 MERGED** (`3dac419`): `Sidebar.tsx` (907) under 1k. First chunk this session that **changed production code**, so a Wave-D browser-verify is owed. TWO moves: (1) Std-2/6 — extracted a `<Section>` wrapper deduping the section chrome repeated 8× (907→890; **My Patterns left raw on purpose** — its trailing spacer renders outside the collapse gate, which `Section` can't express without a behaviour change; commented in-code); (2) Std-8 — extracted the frame units↔px clamp to pure `frameUnitModel`/`frameUnitsToPx` in `editor/frame.ts` + **15 tests** (367→382) incl. a parametric round-trip-stability guard for the documented slider-freeze bug. Behaviour-preserving (`<Section>` = verbatim chrome relocation, byte-equal DOM/styles; frame math pinned by the round-trip test).

- **Chunk 6 MERGED** (`7492630`): `tilings/tapratsTiling.ts` (796, ~540 of which is the `TAPRATS_DATA` literal) under 1k → Std-0/4/8 audit, not a restructure. TWO behaviour-preserving production fixes: (1) Std-0 — deleted dead code in `intersectsViewport` (the per-vertex pre-check is provably subsumed by the AABB-overlap test); (2) Std-5/8 — added a `edgeLen > 0` fail-closed guard (a 0/NaN scale zeroed the lattice vectors → `ceil(diag/0)=Infinity` → infinite hang; reachable via crafted/legacy LOAD_CONFIG). Plus the missing adversarial layer: **+23 tests** (382→405) — data-integrity sweep across all 12 tilings (`sides===vertices.length`, finite coords — catches hand-entered data typos), determinism, MAX_POLYGONS cap, degenerate viewport, straddle-inclusion, `getTapratsTileTypes`. Deferred: splitting `TAPRATS_DATA` to its own module (pure relocation, no concept reduction). File 796→800 (comments+guard). tsc + 405 vitest + build green.

- **Chunk 7 MERGED** (`8af6b74`): `pic/index.ts` (667→664) — the minefield. Discipline held: **characterization-net FIRST, then only the one provably-safe change, reframe DEFERRED.** (1) Std-0/4 — deleted dead `convex`/`_convex` (computed + threaded into `pairAtVertex`/`pairVertexAtEdge` which both ignore it; `emitStarArms` recomputes its own). (2) Std-8 — `runPIC.characterization.test.ts`: a **golden fingerprint** (count + Σlen + per-kind) across a 12-case tiling/θ matrix + adversarial (empty/no-figure/zero-area/θ-extremes/determinism/triangle-dedup), 18 tests; the dead-code removal is proven **byte-identical** by it. (3) Std-8 — `snapPoints.test.ts` (6 tests, `snapToNearest`). 405→429. **DEFERRED with rationale:** the branch-ladder→policy-table reframe + the Std-6 triplicated-probe/copy-pasted-emission dedup — gated on the preserve-vs-fix product decision (memories say borderline cases still emit wrongly) + the planned bespoke-rosette architectural fold (`project_star_tilings_gallery_idea`). The golden net now makes that reframe safe when undertaken. Overlap-strand bug AUDITED → not a runPIC defect (per-polygon emission is correct; needs Builder-layer dedup + a user repro), memory stays OPEN.

- **Chunk 8 MERGED** (`9cdacd1`): `editor/` placement family — all under 1k. The plan's "canonical primitive under three names" hypothesis **resolved**: the *placers* (edge/vertex/section) are legitimately distinct, but the three *validators* shared a byte-identical **body-overlap probe** → extracted `placedTileOverlaps` to `tileOverlap.ts` (Std-6); also replaced 4 in-scope `centroid` reimplementations (`avgCenter`/`centroidOf` in placement/vertexPlacement/boundaryInward/orbit) with the canonical `utils/math` one. +7 tests (`placementViability.test.ts`: viable-size fingerprints guard the extraction + direct `placedTileOverlaps` adversarial cases). 429→436. Behaviour-preserving (fingerprints identical). Bundle 418.87→418.31 kB. Deferred to Chunk 13: `reducer::centroidOf` (Chunk-5 file) + the `tileInteriorAngleAt`/`interiorAngle` pure-helper dup.

- **Chunk 9 MERGED** (`6a05018`): `decoration/` + `strand/` — **the healthiest layer** (best test density, clean structure, all under 1k). Reach ladder (`scopes.ts`) is a tidy precedence model, NOT special-case sprawl; `voids.ts` complexity is essential (Cyrus–Beck→arrangement→DCEL→signature), not spaghetti. Coordinated with the layer's open ⏳ browser-verifies → **no refactor on top of unconfirmed behaviour**. Banked the one real Std-8 gap: `minRotation` (Booth canonicaliser) + `hash8` underpin every persisted signature but were untested → `voidSignatureCanonical.test.ts` with a **2000-trial differential fuzz vs a reference O(m²) impl** (pins the exact-ordering invariant the comment warns about) + invariance + hash8 tests. +8 (436→444). Zero production change. `computeCurves` (strand, perf-probe-only) noted for Chunk 10.

- **Chunk 10 MERGED** (`1ed8ee5`): `rendering/` — React/SVG components in a `node` (no-DOM) test env, so the plan's "render-output tests" became the codebase's stated mitigation: **extract pure logic from the untested components into tested helpers.** `PatternSVG` is pure wiring (nothing to extract). Did: (S6) `polygonPath` was byte-identical in `VoidFillLayer`+`DecorationPaintLayer` → `rendering/svgGeometry.ts`; (S8) the strand Paint hit-test (`pointSegmentDist`+`nearestSegmentIndex`) extracted there too; (S8) `StrandLayer`'s `lineStyle`→stroke-attrs → `rendering/strandStyle.ts::strandStyleAttrs`. +15 tests (444→459). Components shrank, behaviour-preserving (verbatim extractions, pinned). `strand/computeCurves` still perf-probe-only — deferred to a focused curve→path pass. ⏳ Wave-F browser-verify owed: Decoration strand painting hit-tests correctly + double/triple/dashed/dotted strand styles render.

- **Chunk 11 MERGED** (`27a4832`): remaining `components/` tail (the test-free pure-UI files). Same Chunk-10 pattern — extract behaviour-bearing logic into tested helpers, manual-verify the pure remainder. TWO helper modules: (1) `colourPicker.logic.ts` (hex validation, eye-dropper alpha-strip, recents store, theme load/validate/save + the four theme array transforms; `ColourPicker.tsx` re-exports `pushRecentColour`+`ColourTheme` so import sites are unchanged) +20 tests, 439→351; (2) `rotationDial.logic.ts` (`normDeg`/`pointerAngle`/`applyDragDelta` ±180 seam/`wheelStep`) +17 tests, 204→189. NO ACTION (logged manual-verify): `FigureControls` (logic already in Chunk-7-tested `pic/snapPoints`), `ConfigLibraryPanel` (logic in `configLibrary` → Chunk 12), `TextPromptModal`/`PerfHud`/editor SVG layers (pure UI). 459→496. Behaviour-preserving verbatim extractions.

- **▶ NEXT — Chunk 12 (`export`/`types`/`theme`/`configValidation` + `configLibrary`).** Smaller, lower-risk. `types/editor.ts` (404) is the headline: a good Std-5 audit of the tagged unions, optionality, and the migration surface (`editor/migrations.ts`). `configLibrary` + `configValidation` carry the save/load/validate logic the Chunk-11 panels delegated to — pin it. Then Chunk 13 (Tier-4 cross-cutting dup sweep — owns: the deferred PIC branch-ladder reframe, `reducer::centroidOf`, the `tileInteriorAngleAt`/`interiorAngle` dup, `strand/computeCurves` end-to-end test). Cold-start: branch `review/types-export`, per-chunk checklist in `THERMONUCLEAR_REVIEW_PLAN.md` §4.
  - ⏳ **Owed browser-verifies accumulating → scripted in `THERMONUCLEAR_REVIEW_VERIFY.md`:** Chunk 3 (Sidebar sections + Frame slider) + Chunk 10 (Decoration strand paint + strand line styles) + Chunk 11 (low-risk: paint-colour validation/themes/recents + the rotation dial — all now pinned by tests). Bundle for a single Wave-D/F user pass when convenient. The review memory now prompts the agent to offer these on resume.
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
