# Guide popup "Accept" does nothing — Handoff

**Status:** ✅ FIXED + browser-verified (2026-07-22, Opus). Fix A (freeze popup
anchor at selection time) applied in `src/components/Canvas.tsx` — `guidePopupAnchor`
is now a `useMemo` keyed on `selectedGuideId` only, so editing a line's Angle or a
circle's Radius no longer repositions the popup mid-click. Headless verify (`verify2.mjs`):
line typed-Angle Accept closes + applies 0°→37°; circle typed-Radius Accept closes;
no-edit Accept still closes. All 1181 tests pass; tsc clean.

---

**Original root-cause writeup below (2026-07-22, Opus). Reproduced headlessly.**
**Area:** Builder → Design Phase → **Construct** mode → per-Guide popup (`GuidePopupOverlay`).
**Reporter symptom:** *"the 'accept guide' feature doesn't work. click accept but nothing happens on any type of guide."*

---

## TL;DR

The **Accept** button commits on `onClick` (i.e. on pointer-**up**). Line **Angle** and
circle **Radius** are text fields that commit their edit on **blur**. When you type a
value and then click Accept, the Accept press blurs the field → the edit commits →
the popup's anchor point moves → the floating popup **repositions mid-click** → the
pointer-up lands where the Accept button no longer is → the `click` never fires →
"nothing happens." No-edit Accept and button-only edits (extend / stamp / ×N / size
presets) work, because nothing repositions the popup during the Accept click.

**Recommended fix:** freeze the popup's screen position while a Guide is selected
(don't recompute it from the Guide's editable geometry on every edit). Details below.

---

## Reproduction (headless Playwright, `chromium-1228`)

Setup: Lab → load **Square-Octagon 4.8.8** → **Construct** tool → **Line** → draw a
line across the octagon → click the line stroke to open the popup.

| Case | Steps | Result |
|---|---|---|
| No edit | open popup → click **Accept** | ✅ closes |
| Button edit | click **⟷** (extend both) → click **Accept** | ✅ closes, edit persists |
| Text edit + Enter | type `30` in **Angle** → **Enter** → click **Accept** | ✅ closes |
| **Text edit, no Enter** | type `30` in **Angle** → click **Accept** (no Enter) | ❌ **popup stays open** (intermittent — see below) |

Intermittency: whether the Accept click misses depends on **how far the popup jumps**
when the field commits, which depends on the guide's geometry (a near-horizontal line
whose midpoint shifts a lot vs. one that barely moves). Two different lines in the
same run gave stays-open vs. closes. That matches the user's "sometimes nothing
happens."

Repro scripts live in the session scratchpad: `accept.mjs` (no-edit), `accept2.mjs`
(extend edit — passes), `accept3.mjs` (typed angle, no Enter — **fails**), `accept4.mjs`
(Enter-first passes / no-Enter intermittent). Driver pattern + headless-Chromium recipe:
memory `feedback_headless_browser_no_sudo` and `SESSION_STATE.md`.

---

## Root cause

The popup is positioned by the parent from the Guide's **live, editable** geometry, so
any edit that moves the anchor moves the whole popup:

- `src/components/Canvas.tsx:1048` — `guidePopupAnchor`:
  - line → `vecMidpoint(selectedGuide.start, selectedGuide.end)` (moves when the **angle**
    rotates `end` about `start`)
  - circle → `{ center.x, center.y - radius }` (moves when the **radius** changes)
- `src/components/Canvas.tsx:1053` — `guidePopupScreenPos = worldToScreen(guidePopupAnchor, …)`,
  recomputed **every render**, passed as `position` to `GuidePopupOverlay`.

The commit path that fires during the Accept click:

- `src/components/GuidePopupOverlay.tsx:338` — Angle input `onBlur={commitAngle}`
  (`:286` `commitAngle` → `onUpdate({ end })`).
- `src/components/GuidePopupOverlay.tsx:387` — Radius input `onBlur={commitRadius}`
  (`:360` `commitRadius` → `onUpdate({ radius })`).
- Accept fires on click: `:95` `const accept = onClose`; `:219` `onClick={accept}`.

Sequence for "type then click Accept":
1. **pointerdown** on Accept → focus leaves the field → **blur** → `commitAngle/Radius` →
   `onUpdate(…)` dispatches `EDITOR_UPDATE_GUIDE` → re-render → `guidePopupAnchor`
   moves → popup translates to a new screen position.
2. **pointerup** happens at the original screen coords, now over empty space (or a
   different control) → the browser fires no `click` on Accept → `onClose` never runs
   → popup stays open.

Because the value *was* committed on blur, the visible guide often did change — so from
the user's view "Accept did nothing" (the popup just won't dismiss), which reads as
"Accept is broken."

### Why "any type of guide"
Both editable text fields that users routinely touch move the anchor: **line Angle**
and **circle Radius**. Divided-circle **divisions** is also a number field but does *not*
move the anchor, so editing only divisions + Accept should work — worth confirming with
the reporter, but "line + circle" already covers "any type" in practice.

### Not the cause (ruled out)
- The window `pointerdown` outside-close handler (`GuidePopupOverlay.tsx:108`) is **not**
  firing on the Accept click — `dialogRef.current.contains(target)` returns for inside
  clicks and React's `stopPropagation` on the dialog root keeps the window listener from
  seeing inside-dialog pointerdowns. Verified: button/extend edits Accept fine.
- `swallowClickUntil` (`Canvas.tsx:1449`) only guards the *canvas draw* click after a
  close; unrelated to the Accept button itself.

---

## Recommended fix (pick one)

**A. Freeze the popup position while a Guide is selected (preferred).**
Capture `guidePopupScreenPos` once when `selectedGuideId` changes (and on
pan/zoom / `size` change) and hold it fixed while editing — do **not** derive it from
the Guide's editable geometry each render. A popup that doesn't jump while you edit is
also just better UX. Sketch: store the anchor (or screen pos) in state set alongside
`setSelectedGuideId`, or `useMemo(guidePopupScreenPos, [selectedGuideId, viewTransform, size])`
with the anchor captured from the guide **at selection time** (not the live guide).

**B. Anchor the popup to a non-editable point.** Line → `start`; circle → `center`.
Neither moves under an Angle/Radius edit, so no mid-click reposition. One-liner at
`Canvas.tsx:1048`, but the popup then sits over the guide (less tidy than midpoint/north).

**C. Make Accept/Cancel/Delete fire on `onPointerDown` (not `onClick`).** Pointer-down
precedes the blur-driven reposition, so the close can't be missed. Riskier: relies on
the field's blur-commit still flushing before/independently of the unmount; verify the
typed value isn't dropped. Also consider committing pending edits explicitly in
`accept()` rather than depending on blur.

Any of A–C should also handle the circle-radius variant. **A** is the most robust and
lowest-risk.

---

## Verification checklist for the fix

- Line: type Angle `37` (no Enter) → Accept → popup closes **and** line is at 37°.
- Circle: type Radius `220` (no Enter) → Accept → popup closes **and** radius = 220.
- Divided circle: change divisions → Accept → closes.
- No-edit Accept still closes; **Cancel** still reverts; **Esc** still cancels;
  outside-click still cancels; **Delete guide** still deletes.
- Popup does not visibly jump while typing in a field (if fix A/B).
- Add a regression test: simulate focus-in-field → Accept commits + closes. A pure unit
  test on the popup can assert `onClose` fires on Accept `onClick`; the reposition race
  needs a jsdom/RTL test that moves `position` between pointerdown and pointerup, or an
  in-browser Playwright check (`accept3.mjs` is a ready template — it should end with
  `dialog after Accept: 0`).

## Key files
- `src/components/GuidePopupOverlay.tsx` — Accept/Cancel (`:95`,`:96`,`:219`),
  outside-close (`:104`–`:119`), Angle/Radius blur-commit (`:286`,`:338`,`:360`,`:387`).
- `src/components/Canvas.tsx` — popup anchor + screen pos (`:1048`–`:1054`), popup render
  + `onClose` (`:1437`–`:1451`).
