# HANDOFF — Version `PatternConfig` (+ decide the unknown-field policy)

**Status:** not started. This is a cold-start brief for roadmap item #6.
**Written:** 2026-07-29, immediately after `448ed3b` (the one-schema-gate refactor).
**Model:** **Opus.** It is a small diff guarded by decisions that are expensive to get wrong — the failure mode is silent, permanent data loss across a user's whole library, discovered months later. Sonnet is fine for the mechanical slices *after* §4's decisions are locked.

---

## 1. What this is

`PatternConfig` — the serialisable state at the centre of the app (`src/types/pattern.ts:205`) — carries **no version field**. Every migration in `loadPatternConfig` is therefore a *shape sniff*: "does this look pre-#48?", "is `lacing` present?". There is no signal to key a migration off, and no way to tell a config written by an older build from a newer one.

Meanwhile the things *around* it are all versioned:

| Layer | Version field | Where |
|---|---|---|
| Library storage envelope | `version: 1` | `state/configLibrary.ts:39` |
| Editor patch | `version: 3` | `types/editor.ts:605`, dispatched in `editor/migrations.ts:593` |
| Decoration block | `version: 1` | `types/editor.ts:362` |
| Generator dataset record | `generatorVersion`, `scoreSchemaVersion` | `generator/datasetStore.ts`, ADR-0007 |
| **`PatternConfig` itself** | **none** | — |

`editor/migrations.ts` is the model to copy: a `version` switch with one function per schema generation. `PatternConfig` is the hole in the middle of an otherwise-versioned stack.

## 2. Why it matters — the two concrete risks

### 2a. The allow-list actively deletes fields, it doesn't just ignore them

`loadPatternConfig` (`state/configValidation.ts:264`) builds its output field by field. Anything not on the list is **absent from the returned object**. That would be harmless if loading were read-only — but it isn't:

- `configLibrary.list()` runs **every** saved entry through `loadPatternConfig` on every read (`configLibrary.ts:136`).
- The Lab **re-persists on every change** (`App.tsx`, the `saveLabState` effect).
- `library.save()` / `update()` write back whatever the app currently holds.

So a field added to `PatternConfig` but forgotten in the allow-list is stripped on the next load, and the next save commits the stripped version. **One load+save cycle destroys it across the user's entire library, silently.** No error, no warning — `list()` only `console.warn`s for entries that fail outright.

*Checked and safe today:* `PatternConfig` has exactly 8 fields (`tiling`, `figures`, `edgeAngles`, `strand`, `smoothTransitions`, `editor`, `frame`, `morph`) and the allow-list carries all 8. This is a trap for the *next* field, not a live bug.

### 2b. The Generator's ML dataset embeds unversioned configs

ADR-0007 deliberately stores the **full `PatternConfig`** in each rating record rather than a seed, because "any sampler change silently breaks seed→config reproducibility, and the ML step consumes configs anyway." Records stamp `generatorVersion` and `scoreSchemaVersion` — but the embedded config has no schema version, and `allRecords()` returns them **raw**, never through `loadPatternConfig` (`generator/datasetStore.ts:100`; consumed by `generator/preprocess.ts` and `GeneratorMode.tsx:87,183`).

There were ~457 rated samples as of 2026-07-16. A `PatternConfig` shape change silently changes what `features.ts` extracts from historical records, with **no field to distinguish old-shape from new-shape rows** and no way to migrate them after the fact. This is the most expensive of the two risks because the data is not reproducible.

## 3. Where `PatternConfig` enters the app (full census)

Verified 2026-07-29. Useful because any versioning scheme has to cover all of them.

| # | Entry point | Validated? |
|---|---|---|
| 1 | File import — `export/exportJSON.ts:28` | ✅ `loadPatternConfig` (throws) |
| 2 | Config library read — `configLibrary.ts:136` in `list()` | ✅ `loadPatternConfig`; invalid entries **silently skipped** with a `console.warn` |
| 3 | Lab autosave restore — `labDefaults.ts:53` | ✅ `readPatternConfig` → delegates (added `448ed3b`) |
| 4 | Presets shelf — `buildPresetConfig` | n/a, code-generated in memory |
| 5 | Gallery "Edit in Lab" — `App.tsx:72` | ✅ inherits (2), the config came from `library.list()` |
| 6 | Generator "Open in Lab" — `GeneratorMode.tsx:261` | n/a, `sample.config` is code-generated in memory |
| 7 | **Generator dataset records (IndexedDB `ratings`)** | ❌ **raw, never validated** — see §2b |

(1)–(3) are the gates. (7) is the gap.

## 4. Decisions needed before coding

**None of these are mine to make — they change what gets built.**

1. **Where does the version live?** On `PatternConfig` itself (`version: 1`), or only on storage envelopes?
   *My recommendation:* on `PatternConfig`. It's embedded in four different carriers (library entry, `lab-state-v1`, dataset record, exported `.json` file), two of which have no envelope version at all. A field on the config travels with it everywhere; an envelope field doesn't.

2. **Unknown-field policy — strip, or round-trip?** The allow-list is a genuine safety property (junk can't reach the render path), but it's also the §2a data-loss vector. Options:
   - keep stripping, add a **dev-mode warning** naming the dropped keys;
   - keep stripping known-shape fields but round-trip unrecognised ones in an opaque `_forward` bucket, so a save written by a newer build survives a trip through an older one;
   - stop stripping.
   *My recommendation:* strip + dev warning now, `_forward` only if cross-version round-tripping turns out to matter (it mostly won't for a single-user local app).

3. **What happens when a config's version is newer than the build's?** Currently undetectable. Refuse with a clear message ("this pattern was saved by a newer version"), or best-effort load? *Recommendation:* refuse on the file-import path (honest), best-effort on the Lab restore path (a throw there is a white screen — the `readPatternConfig` split from `448ed3b` already encodes this asymmetry).

4. **Back-fill:** existing saves have no `version`. Absent must mean "pre-versioning, sniff as today" — **it must not invalidate a single existing save.** Non-negotiable, but worth stating explicitly because it constrains slice 1.

## 5. Suggested slices

1. **Add `version?: number` to `PatternConfig`** + `CURRENT_PATTERN_CONFIG_VERSION = 1`. `loadPatternConfig` reads it, defaults absent → 1, stamps the current version on output. All existing sniff-based migrations stay exactly as they are. No behaviour change; this slice is purely "there is now a place to stand."
2. **Version dispatch**, mirroring `editor/migrations.ts:593` — a `switch` with one function per generation. Fold the existing sniffs (`lacing`→`strand`, pre-#48 morph) in behind version 1 so they become "version 0 → 1" migrations rather than permanent shape probes.
3. **Unknown-field handling** per decision 4.2 (dev warning and/or `_forward`).
4. **Dataset records** (§2b): stamp `configVersion` on new records; decide whether to backfill or grandfather the existing ~457. *Recommendation:* grandfather — mark absent as version 0 and let `preprocess.ts` handle it, rather than rewriting rated data.

Slices 1–2 are the substance. 3–4 can land separately.

## 6. Test anchors

- `src/state/configValidation.test.ts` — 42 tests; the `readPatternConfig — lenient restore` block at the end is the newest and shows the strict/lenient pairing.
- `src/state/labDefaults.test.ts` — 14 tests; pins the Lab boot path at the localStorage boundary, incl. the #50 morph regression.
- `src/editor/migrations.test.ts` — the pattern to copy for a version switch.
- **Add:** an unversioned (pre-versioning) config still loads unchanged; a version-1 config round-trips; an unknown future version behaves per decision 4.3; a config with an unknown field behaves per decision 4.2.

## 7. Gotchas

- **`readPatternConfig` and `loadPatternConfig` are a pair.** They live together in `configValidation.ts` on purpose (`448ed3b`). If a version bump makes a field newly *required*, the lenient sibling needs a matching repair in the same edit — otherwise the Lab boot path starts failing where it used to recover, and you have re-forked the schema gate that item #6's predecessor just closed.
- **`coerceLegacyFigures` (`configValidation.ts:46`) is a landmine, not a live bug.** It forces `type: 'star'` on every figure, but `FigureConfig.type` is currently a single-member union (`types/pattern.ts:57`), so it flattens nothing today. The moment the rosette epic reintroduces a second figure type, this silently destroys it. Fix it *as part of* the version work — a version switch is exactly the right place to retire an unconditional coercion.
- **Don't trust a headless repro for storage bugs.** A fresh browser profile never has stale keys. Reproduce by writing the old shape into `lab-state-v1` / `pattern-library-v1` and reloading — see `/tmp/ga-verify/labboot.mjs` for the harness.

## 8. Related

- Ticket **#50** (closed) — the crash that motivated all of this.
- `448ed3b` — the one-schema-gate refactor; read its SESSION_STATE entry (2026-07-29) first.
- Memory: `feedback_lab_persisted_state_second_schema_gate.md`.
- `docs/adr/0007-generator-mode-taste-dataset.md` — why records embed full configs.
- Thermonuclear review round 2 (2026-07-08) — this was finding 4 of the open roadmap-prep set.
