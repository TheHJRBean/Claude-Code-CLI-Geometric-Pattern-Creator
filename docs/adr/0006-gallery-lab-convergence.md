# Gallery↔Lab convergence: presets become editable Patches; the Gallery becomes the saved-patterns browser

The Gallery's preset Configurations were locked out of the Builder's editing and Decoration tooling because they render through the BFS/Taprats pipeline with no Patch/Cell structure — yet they are exactly the fields most worth decorating. We decided (2026-07-10, 13-question grill) to **converge the workspaces**: presets are converted into real, fully editable `EditorPatch`es offered on a read-only **Presets** shelf in the Lab library, and the Gallery is repurposed as a pure **saved-patterns browser** (thumbnail grid over one merged library, detail view, "Edit in Lab" hand-off). The BFS/Taprats pipeline becomes a **legacy render path** — serving not-yet-convertible presets and old saves in the viewer — with an explicit but unscheduled sunset.

Key shape of the decision:

- **Full conversion, not a mode.** A loaded preset is just a Patch; there is no read-only tiling mode inside the Builder. Conversion is a pure hand-authored mapping from preset to the existing Builder seed factories, carrying the user's tunings (figure recipes, contact angle, strand style, and the Gallery Frame — migrated to a Builder Shape Frame). Converted Patches carry `presetId` provenance.
- **Tiered rollout.** Tier 1 (the shipped multi-cell Configurations + single-cell square/hex/triangle) and tier 2 (remaining Archimedean, via new ConfigurationIds/bases/seeds) convert; tier 3 (irregular Laves/Taprats) stays view-only on the legacy path until an irregular-tile Patch encoder lands (owned by the star-tilings/rosette epic).
- **Warnings are passive.** A one-time dismissible note on the first structural edit of a converted preset, then the existing non-tiling tag. No hard blocks.
- **One library.** The two localStorage libraries physically merge (one-time migration) into a single key; old keys kept as backup until the sunset.
- **Uniform export.** The Lab export menu is identical across all config sources; Unwoven-SVG export is archived rather than kept as a per-path exception.
- **Conversion fidelity is tolerance-based, not exact.** Small deliberate render differences between the BFS and lattice paths are accepted; flagship presets are guarded by fingerprint comparisons (segment count + total length).

## Considered Options

- **Preset-field mode** (rejected — was the initial recommendation): a Lab mode where the tiling layer stays read-only but Composition/Decoration/Frame work. Cheap, but the user explicitly wants *real* structural editability; clutter is managed by UI separation and breakage by warnings instead.
- **Decoration-only access to Gallery configs** (rejected): narrowest fix for "decorate the presets", but leaves the Gallery/Lab feature drift (two Frames, two export wirings, two libraries) unresolved.
- **Merged library *view* over two keys** (rejected): avoids a migration but leaves dual-backend logic in every library consumer indefinitely; the records are identical in shape, so a one-time physical merge is strictly simpler.
- **Automatic/derived preset conversion** (rejected): inferring Patches from BFS output is research-grade effort for a finite, enumerable catalogue; a static table over hand-authored seeds is bounded and reviewable.

## Consequences

- The Gallery stops being an authoring surface: its tuning sidebar is removed, and the default workspace for fresh users flips to the Lab (an empty browser is a dead first screen). UI labels stay Gallery|Lab; internal mode values are unchanged.
- The clip-only Gallery Frame (`PatternConfig.frame`) is superseded: still *rendered* on legacy saves in the viewer, migrated to `editor.frame` on conversion, no longer authorable.
- ADR-0005's "the Gallery is not decorated" is re-scoped by amendment: Decoration *authoring* remains Builder-only, but the Gallery *viewer* displays decorated saves.
- CONTEXT.md's Gallery/Lab definitions and the feature-parity matrix are rewritten/retired when the flip ships (the glossary describes what is, not what is planned).
- Thumbnails for the browser are save-time rasters in IndexedDB with lazy backfill for pre-existing saves — the first use of IndexedDB in the app; configs stay in localStorage.
