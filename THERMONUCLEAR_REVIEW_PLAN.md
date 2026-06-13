# Thermo-Nuclear Code-Quality Review — Whole-Codebase Plan

A plan for applying the `thermo-nuclear-code-quality-review` skill to the **existing**
Geometric-Pattern-Creator codebase, chunk by chunk. The skill is written for reviewing
*a branch's diff*; this plan adapts it to a standing codebase by treating each chunk as a
"virtual PR" and — crucially — by turning every refactor into a real diff the skill can
then review in its native mode.

> **Prime directive (from the skill): behavior must not change.** Every chunk preserves
> observable behavior. We prove that with tests + manual verification, not by hoping.

---

## 0. The adaptation: how a diff-oriented skill reviews standing code

The skill's core prompt says *"review the current branch's changes."* We have no diff yet,
so each chunk runs a **two-phase loop**:

1. **AUDIT (read the chunk as if it were a freshly-proposed PR).**
   Ask: *"If someone opened this as new code today, would the thermo-nuclear bar approve it?"*
   Apply the 9 standards (Std 0–8) and produce ranked findings. No edits yet.

2. **RESTRUCTURE → re-review the diff in native mode.**
   Implement the cleanest code-judo move. That edit **is now a real diff**, so re-run the
   skill against it (`git diff`) to confirm the refactor didn't itself add spaghetti, bust
   the 1k line bar, or smear complexity around. This is the skill doing what it's designed
   to do.

Each chunk ends green: `npx tsc --noEmit` + `npm test` + a manual app check + a commit.

---

## 1. Guardrails established once, before any chunk (Tier 0)

These make "without impacting behavior" enforceable rather than aspirational.

- [ ] **Green baseline.** Confirm `npm test` and `npx tsc --noEmit` and `npm run build` all
      pass on `main` right now. Record the result. If anything is red, fix or quarantine
      before starting — we can't detect regressions against a red baseline.
- [ ] **Line-count tripwire.** Capture the current `wc -l` table (below) as the reference.
      The skill's Std 1 is a hard rule: no chunk may push a file from <1000 to >1000 lines,
      and the giant-file chunks must come *down*, never drift up.
- [ ] **Findings ledger.** One file — `THERMONUCLEAR_REVIEW_FINDINGS.md` — with a table:
      `chunk | file | severity (S0–S8) | finding | remedy | status`. Do **not** spawn
      parallel docs (repo rule). This is a state file, not a research note.
- [ ] **Characterization-test policy.** For any chunk that touches *behavior-bearing logic*
      with no existing test (Std 8), write the characterization test **first** — pin current
      behavior, then refactor under it. For pure-presentational UI, rely on manual
      verification via the app and say so explicitly in the ledger.
- [ ] **Branch-per-chunk.** Each chunk is its own branch off `main`
      (`review/<chunk-name>`), so a refactor that goes wrong is cheap to abandon. Commit +
      push per the repo's after-every-edit workflow.

---

## 2. Chunking strategy

Chunks are sized to **one focused session each** and ordered by the skill's own priority
(Output Expectations §): structural regressions and giant files first, then spaghetti
hotspots, then test-free zones, then cleanup. Boundaries follow the existing architecture
(Tiling → Figure/PIC → Render; plus state, editor, components, decoration, strand) so we
never review half an abstraction.

Three rules keep chunks "manageable":
- **A >1k-line file is its own chunk** (sometimes more than one session).
- **Small sibling files are batched by directory** (e.g. all of `utils/`).
- **Test-free behavior-bearing modules pair the audit with test-writing** in the same chunk.

### Reference line-counts (2026-06-13 baseline)

| File | Lines | Tests? | Tier |
| --- | --- | --- | --- |
| `components/TessellationLabMode.tsx` | **2243** | none | 1 |
| `components/Canvas.tsx` | 974 | none | 1 |
| `components/Sidebar.tsx` | 907 | none | 1 |
| `hooks/usePattern.ts` | 902 | none | 1 |
| `state/reducer.ts` | 877 | (2 in dir) | 1 |
| `tilings/tapratsTiling.ts` | 796 | yes | 1 |
| `pic/index.ts` | 667 | yes | 2 |
| `decoration/voids.ts` | 609 | yes | 2 |
| `components/EditorPickerOverlay.tsx` | 531 | none | 2 |
| `editor/vertexPlacement.ts` | 487 | (5 in dir) | 2 |
| `components/*` (remaining ~3500 ln) | — | **none** | 3 |
| `rendering/*` (1080) | — | none | 3 |
| `hooks/`, `export/`, `types/`, `theme/` | — | none | 3/4 |

Directory totals: components 7412 · editor 5560 · decoration 2777 · tilings 2395 · pic 1996 ·
state 1742 · strand 1361 · rendering 1080 · hooks 990 · types 610 · utils 471 · export 128 · theme 43.

---

## 3. The chunks, in order

### Tier 1 — Giant files (Std 1 violations; highest leverage)

**Chunk 1 — `TessellationLabMode.tsx` (2243 ln).** The worst offender by far; budget
2–3 sessions. Sequence: (a) map its responsibilities — it's the Lab/Builder shell, so
expect phase orchestration, panel wiring, mode state, and event glue all in one file;
(b) extract *pure* logic (selectors, derived state, event-to-action mappers) into
testable units first and pin them with characterization tests; (c) split panels/phases
into subcomponents; (d) verify the Builder still works end-to-end in the app
(Design → Composition, place/complete flows). Target: no resulting file >~400–500 ln.

**Chunk 2 — `Canvas.tsx` (974) + interactive-overlay cluster**
(`EditorPickerOverlay` 531, `EditorVertexLayer` 417, `OverlapConfirmModal` 204).
These share the pointer-event surface and the flexible-placement flow. Watch the memory
note `feedback_editor_svg_overlay_events` (onPointerDown + render-order constraint) — do
not "clean up" event handling in a way that reintroduces that bug. Manual verify: all
three Place flows (edge / boundary-section / vertex) + overlap ⚠ popover.

**Chunk 3 — `Sidebar.tsx` (907).** Likely a long switch of control groups. Code-judo
candidate: a data-driven control registry instead of hand-written branches (Std 2/4).
Pure-UI → manual verification.

**Chunk 4 — `hooks/usePattern.ts` (902).** The geometry-pipeline orchestrator and the
single most behavior-critical file. The CLAUDE.md notes it "branches once on
`patch.cells.length > 1`" and juggles many flags (`editorStrandMode`,
`showBoundaryLattice`, `editorNeighbourPreview`…). Std 2/5/7 focus: collapse flag soup,
make the single-cell/multi-cell split an explicit dispatch. **Write characterization
tests first** — feed representative `PatternConfig`s, snapshot the polygon/segment output,
refactor under the snapshots.

**Chunk 5 — `state/reducer.ts` (877).** A state machine; perfect target for Std 2
(dispatcher/action-handler-map over a mega-switch) and Std 7 (atomic updates — flag
half-applied state). The `DESIGN_MODE_ACTIONS` allowlist + history coalescing live nearby.
Test the action handlers directly (there are already 2 tests in `state/`).

**Chunk 6 — `tilings/tapratsTiling.ts` (796).** Has tests already (good). Audit for
Std 0/4 (magic constants, generic mechanisms hiding data-shape assumptions). Extend
adversarial coverage at tiling boundaries.

### Tier 2 — Spaghetti hotspots in core logic (has tests; sharpen them)

**Chunk 7 — `pic/index.ts` (667) + `pic/` package.** The documented edge-case minefield:
`emitStarArms` / `pairAtVertex` branch priority, edge-slide, the per-ray fallback. Memories
`project_pic_irregular_polygon_bugs` and `feedback_pic_pair_selection` flag this as
partially-fixed with borderline cases still emitting. This is the canonical Std 0 prize:
can the branch ladder be reframed as a small set of named cases / a policy table instead of
ordered `if`s? Add adversarial tests for the borderline irregular polygons before touching
it. **Treat any refactor here as high-risk — characterization tests are mandatory.**

**Chunk 8 — `editor/` placement family** (`vertexPlacement` 487, `orbit` 342,
`compositionLattice` 304, `complete`/`completeN`, `placement`, `boundaryInward` 251).
Lots of overlapping "place a regular n-gon on X" helpers + the shared `tileOverlap`
probe. Std 6 focus: are these genuinely distinct or is there a canonical placement
primitive hiding under three names? 5 dir tests exist — extend, don't trust.

**Chunk 9 — `decoration/voids.ts` (609) + `scopes.ts` + `strand/` package**
(`wovenPathD` 360, `weave` 281, `computeCurves` 206). Decoration is the newest, fastest-
grown layer (memory `project_decoration_stage_idea` lists many ⏳ "verify" items). Good
existing test density in `decoration/`. Audit the Reach/scope ladder for Std 2 special-case
sprawl.

### Tier 3 — Test-free zones (Std 8 — characterization tests are the deliverable)

**Chunk 10 — `rendering/` (1080, 0 tests):** `PatternSVG`, `StrandLayer`,
`DecorationPaintLayer`. Mostly pure render functions → testable. Write snapshot/path-output
tests, then audit.

**Chunk 11 — remaining `components/` (the ~3500 ln after Tier 1):**
`FigureControls` 497, `ColourPicker` 439, `ConfigLibraryPanel` 247, `RotationDial`,
`TextPromptModal`, `PerfHud`, etc. Batch by cohesion; pure-UI → manual verification, but
extract any embedded logic into tested helpers.

**Chunk 12 — `export/` (128), `types/` (610), `theme/` (43), `state/configValidation` +
`configLibrary`.** Smaller, lower-risk. `types/editor.ts` (404) is a good Std 5 audit:
tagged unions, optionality, the migration surface.

### Tier 4 — Cross-cutting cleanup sweep

**Chunk 13 — duplication & canonical-helper sweep (Std 6).** With every file now read,
do a codebase-wide pass for copy-pasted geometry/math, bespoke helpers that duplicate
`utils/math.ts`, and logic living in the wrong layer. This is best done *last* because it
needs the whole-codebase context the earlier chunks built up.

---

## 4. Per-chunk checklist (apply every time)

```
[ ] Branch:  git checkout -b review/<chunk> off main
[ ] AUDIT:   read the chunk cold; apply Std 0–8; log ranked findings in the ledger
             (order: structural regression → missed code-judo → spaghetti → boundary/type
              → missing/weak tests → file-size → modularity → legibility)
[ ] TESTS-FIRST: for behavior-bearing logic, write characterization tests that pass on
             current behavior (Std 8). For pure UI, note "manual-verify only" + why.
[ ] RESTRUCTURE: implement the cleanest code-judo move. Delete complexity, don't relocate it.
[ ] RE-REVIEW: run the skill against `git diff` (native mode) — did the refactor add
             spaghetti / cross 1k / smear complexity? Fix before proceeding.
[ ] ADVERSARIAL: add tests that try to break it — empty/null, boundary, malformed,
             out-of-order, degenerate geometry. Confirm they fail against OLD behavior.
[ ] VERIFY:  npx tsc --noEmit  &&  npm test  &&  npm run build  &&  manual app check
[ ] COMMIT:  per repo workflow; update the ledger row to done; update SESSION_STATE.md
[ ] WAVE END ONLY: run the wave's Verification Checkpoint (§5b) WITH the user; record
             before/after metrics (file sizes, test count, FPS) and "user-verified: y/n"
```

**Stop conditions within a chunk** (skill's Approval Bar — treat as blockers):
preserves incidental complexity a code-judo move would delete · any file crosses 1000 ln ·
ad-hoc branch tangles an existing flow · feature logic scattered into shared code ·
unnecessary abstraction/cast/wrapper · duplicates a canonical helper · behavior change
without adversarial tests.

---

## 5. Sequencing & effort

| Wave | Chunks | Why this order | Rough effort |
| --- | --- | --- | --- |
| A | 0 (guardrails) | Can't measure regressions without a green, pinned baseline | 0.5 session |
| B | 1 | Worst Std-1 violation; 2.2× the limit; unblocks Lab maintainability | 2–3 sessions |
| C | 2, 4, 5 | Other giant + most behavior-critical files; test-first | 3–4 sessions |
| D | 3, 6 | Remaining giant files; lower behavioral risk | 1.5 sessions |
| E | 7, 8, 9 | Core-logic spaghetti hotspots; highest code-judo payoff | 3–4 sessions |
| F | 10, 11, 12 | Test-free zones; build the missing safety net | 2–3 sessions |
| G | 13 | Whole-codebase duplication sweep (needs prior context) | 1 session |

Total: a ~13–18 session program. It is front-loaded so the highest-risk, highest-leverage
files (the 2.2k-line Lab shell, the orchestration hook, the reducer, the PIC branch ladder)
get attention while reviewer context is freshest, and the safety net (tests) is built into
each chunk rather than deferred.

---

## 5b. User-verifiable improvements at the end of each significant stage

This is a **behavior-preserving** program, so the headline deliverable each wave is the
*absence* of a regression — but that has to be made checkable, and each wave should also
bank at least one improvement the user can see or measure. Every wave therefore ends with a
**Verification Checkpoint**: a short, scripted set of actions the user (not just the
reviewer) performs, plus the concrete wins to confirm. Where a wave fixes a latent bug or
moves a measurable number, that becomes the headline; otherwise "identical behavior, smaller
+ tested code" is the verifiable result, evidenced by the metrics below.

Two metrics are captured at the Tier-0 baseline and re-shown at every checkpoint so progress
is **numeric and user-readable**, not just a claim:
- **Largest-file line counts** (the Std-1 table) — must trend down, never up.
- **Test count + `npm test` / `npm run build` status** — must trend up / stay green.
- **Builder FPS** via the existing PerfHud (Shift+P) on a heavy pattern — must not regress
  (and may improve).

| After wave | What the user runs to verify | Verifiable improvement to confirm |
| --- | --- | --- |
| **A — guardrails** | `npm test`, `npm run build`, open the app | Baseline is green and reproducible; a one-glance metrics snapshot (file sizes, test count, FPS) the user can compare against later. The commit-status tag still renders. |
| **B — TessellationLabMode split** | Open the Lab; walk Design → Composition; place a tile (edge/section/vertex), Complete a gap, switch active cell, undo/redo | Lab behaves **identically**, but the 2243-line file is now several <500-ln files (show the new `wc -l`). New characterization tests visible in `npm test`. Any rough edge found mid-refactor is fixed and called out. |
| **C — Canvas+overlays / usePattern / reducer** | Exercise all 3 Place flows incl. the ⚠ overlap popover; pan/zoom; multi-cell config; rapid undo/redo | Same outputs; **PerfHud FPS equal-or-better** after the usePattern flag-soup cleanup; overlay click-targets still correct (no regression of the dots-intercept bug); reducer half-applied-state edge cases now covered by tests. |
| **D — Sidebar / tapratsTiling** | Toggle every Sidebar control; render Taprats configs | All controls behave the same; Sidebar driven by a data registry (fewer ways to introduce an inconsistent control); tiling adversarial tests added. |
| **E — PIC / placement / decoration** | Render the known borderline irregular polygons; run placement + Complete; apply decoration Reach scopes & strand colours | **Headline: latent PIC edge-case bugs fixed** (the borderline-polygon over-emission from the memory log) — visually confirmable against before/after screenshots; decoration ⏳ items verified or filed. |
| **F — rendering / components / types** | Visual diff of rendered SVG on a saved pattern; load a legacy save (v1/v2 migration) | Pixel-identical render; **rendering + migration now covered by tests** so future changes are safe; legacy saves still load. |
| **G — duplication sweep** | Full smoke pass across Gallery + Lab + Decoration + export/save | Whole app unchanged; **net line count down**, single canonical geometry/math helpers, final green metrics snapshot vs. the Tier-0 baseline. |

Each checkpoint is logged in the findings ledger with the before/after metrics and a
one-line "user-verified: yes/no" so the program's value is auditable end to end. If a
checkpoint can't be made user-verifiable for a given chunk (pure internal plumbing), say so
explicitly and fall back to the metrics snapshot rather than overclaiming a visible win.

---

## 6. Risks specific to this codebase

- **Thin UI test coverage** (`components/` = 7412 ln, 0 tests). Mitigation: extract logic
  out of components into tested helpers; rely on disciplined manual verification (`npm run
  dev`, the `/run` and `/verify` skills) for the pure-presentational remainder. Never
  refactor a 1k-line component "blind."
- **PIC is a known minefield** (multiple memories). Refactors there are behavior-fragile;
  characterization tests over the documented borderline polygons are non-negotiable before
  touching `emitStarArms`.
- **Overlay event-ordering trap** (`feedback_editor_svg_overlay_events`). Don't let an
  event-handler "cleanup" reintroduce the dots-intercept-clicks bug.
- **Decoration is new and partly unverified** (many ⏳ items). Audit it, but coordinate with
  the open verification work rather than refactoring on top of unconfirmed behavior.
- **Performance fast-path caveat** (`project_builder_performance_idea`): Lever-A returns one
  fundamental domain for polygons/segments. Any refactor near `usePattern` / export must not
  assume `segmentsRef` holds the full field.

---

## 7. Done definition for the whole program

- No source file over 1000 lines without a documented, justified waiver.
- Every behavior-bearing module has characterization + adversarial tests; `npm test` green.
- The skill's native-mode re-review passes clean on each refactor diff.
- `THERMONUCLEAR_REVIEW_FINDINGS.md` ledger fully resolved (every row done or explicitly
  deferred with a reason).
- Every wave's Verification Checkpoint (§5b) was run with the user and recorded
  "user-verified: yes", with the before/after metrics snapshot attached.
- `CONTEXT.md` / CLAUDE.md updated where a refactor changed a documented abstraction.
