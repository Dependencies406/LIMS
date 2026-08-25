# Phase 13 — The in-grid standard picker

## Model and effort

**Claude Sonnet 5 · Effort: High**

No metrology risk and no engine changes — the arithmetic is settled and tested. But
the TREB integration is genuinely unknown territory, so the prompt is structured
**investigate → report → build**, not build-first.

## Why this is a blocker, not a polish item

Phase 12 completed the data layer and stopped honestly at the picker, because TREB has
no per-cell dropdown machinery. That leaves `standard` cells as **plain text**.

A technician would have to type a composite `equipmentId:equationId` key by hand.

That is **exactly the failure mode ADR-014 was written to eliminate** — the workbook's
`K2` free-text cell that silently yields `#N/A` on a typo — except with an opaque
document-id key instead of a human-readable label. Shipping it would be a regression
against a spreadsheet.

So: either a real picker exists, or the `standard` column type should not be offered
to template authors.

## What Phase 5b already learned about TREB — do not re-discover this

From the ADR-007 correction, verified by reading the code:

- `@trebco/treb` 38.6.2. Public API: `LoadDocument`, `SerializeDocument`, `GetRange`,
  `SetRange`, `ApplyStyle` (real engine-enforced `locked`), `MergeCells`, `Subscribe`
- **No per-cell change event** — only a coarse `document-change` with no address
- `MergeCells` is used only to *read* existing merges, never to create them at runtime
- `Cell.isLocked` in `SpreadsheetModel` is **dead code** — set but never reaching
  TREB's real `style.locked`
- `SpreadsheetGrid.tsx` (1,411 lines) reaches into undocumented internals
  (`sheet.grid.active_sheet.CellData`, hardcoded command keys, DOM `querySelector`
  toolbar hacks). **Fragile, version-coupled, not a pattern to replicate.**
- The recording grid (`RecordingGrid.tsx`) deliberately uses the **public API only**

**What was never investigated: data validation / dropdown support.** That is Task 1.

## What Phase 12 left ready and orphaned — verified 2026-08-14, do not rebuild it

Grepped and read before writing this. The options layer is **already built and correct**;
it simply has no caller. Wire it up — do not write a second one.

- `src/services/referenceStandardOptions.ts` exports `loadStandardOptions()` returning
  `StandardOption { key, label, equipment, equation }`, where `key` is the composite
  `equipmentId::equationId` from `makeStandardKey()` and `label` is
  `"CAL-FRC-001 — 1-10 N"`. It already filters on `isReferenceStandard`, and already
  omits flagged equipment carrying no equations.
- It also exports `optionsToStandardsById()`, which produces exactly the
  `StandardsById` map the evaluator wants **for drafting against live equations**.
- **Nothing imports this file except `src/services/__tests__/standardKey.test.ts`.**
  Confirmed by grep. It is dead code awaiting this phase.
- `useLiveRecalculation` (`src/modules/recorder/hooks/useLiveRecalculation.ts:51`)
  already accepts `standards: StandardsById = {}` — and **every caller currently
  relies on that empty default**, which is why `STD_*` reads `awaiting-input` in
  drafts today. Feeding it `optionsToStandardsById(options)` is part of this phase.
- `RecordingGrid.tsx:274` copies the previous row's standard cell down into a new row
  via `findStandardColumn` + `GetRange`/`SetRange`. That is the ADR-013 D3 inherit
  behaviour, already working. **Keep it.** It gives you the write mechanism you need —
  `SetRange` on a standard cell already demonstrably works.
- Committed records replay from stored snapshots, NOT from `loadStandardOptions()`
  (ADR-014 D6, `calibrationRecordService.ts:519`). Do not cross those paths.

---

## Prompt

```
Read first, in order:
  - CLAUDE.md — hard rules
  - docs/adr/ADR-014-equipment-register-is-the-reference-standard.md — especially D3
    and the 2026-08-04 correction on the divisor check
  - docs/adr/ADR-007-template-system-strategy.md — READ THE CORRECTION BLOCK. It
    records what TREB can and cannot do, verified against the code.
  - docs/adr/ADR-010-evaluation-contexts-and-summary-fields.md — the two error kinds
  - src/modules/recorder/components/RecordingGrid.tsx — public-API-only integration
  - src/services/recordingGridDocument.ts — the pure layout/data builder
  - src/services/referenceStandardOptions.ts — ALREADY BUILT, currently orphaned.
    loadStandardOptions() and optionsToStandardsById() are what you wire up. Read the
    "What Phase 12 left ready and orphaned" section above before designing anything.
  - src/modules/recorder/hooks/useLiveRecalculation.ts — note the `standards = {}`
    default at line 51 and find every caller relying on it

## MANDATORY PRE-WORK (CLAUDE.md RULE 3/4/8)

    git branch
    git worktree list
    git status
    netstat -ano | grep ":5173"

Verify any dev server points at THIS directory. ~170 uncommitted entries on this
branch are the recorder-reserved archive migration plus earlier phases — NOT yours.
Leave them alone. recorder-reserved/ is an archive.

STOP and ask if anything differs.

## TASK 1 — INVESTIGATE FIRST, AND REPORT BEFORE BUILDING

Determine what TREB 38.6.2's PUBLIC API supports for constraining a cell's value.
Read its type definitions in node_modules; do not guess from documentation memory.

Answer these specifically:

  a. Is there any data-validation or dropdown API on the public surface?
  b. Can a cell be made read-only individually via ApplyStyle's `locked`, and does
     that actually work (unlike the dead Cell.isLocked path)?
  c. Is there any selection-change event, or any way to learn which cell the user
     just clicked? `document-change` carries no address — is there anything else?
  d. Can an overlay be positioned over a specific cell, i.e. is there an API to get a
     cell's pixel rectangle?

REPORT YOUR FINDINGS AND YOUR PROPOSED APPROACH BEFORE WRITING UI CODE. If (a) says
TREB supports native dropdowns, that is clearly the answer. If it does not, say so and
propose from what remains.

Do NOT reach into TREB internals. If your approach requires
`sheet.grid.active_sheet.*` or hardcoded command keys, it is the wrong approach —
that is the fragility ADR-007's correction warns about.

## TASK 2 — Build the picker, using whatever Task 1 established

Requirements, whichever mechanism you land on:

  - The technician selects from a LIST. No free text, ever. This is the whole point.
  - Options show human-readable text — `equipment name — range` — never a raw id
  - The stored cell value remains the composite key Phase 12 defined. Do not change
    the storage format; the evaluator and snapshot path depend on it.
  - Only equipment flagged `isReferenceStandard` appears
  - The out-of-range and past-due warnings from Phase 12 are SHOWN at selection time —
    that is when they are useful, not buried on a settings page
  - Read-only records show the selected standard as text, with no picker

If TREB cannot constrain the cell natively, an acceptable fallback is a **click-to-open
popover or modal**: the technician clicks a standard cell, a picker opens, choosing an
option writes the composite key via `SetRange`. This works with only the coarse events
TREB exposes and leaves room to display the warnings.

Whatever you build, the displayed cell text should be the readable label, with the
composite key held in the record data — not shown to the user.

## TASK 3 — Feed the drafting evaluator, so STD_* actually resolves while recording

A picker that writes a key but leaves every `STD_*` reading `awaiting-input` is not
finished. `useLiveRecalculation` takes `standards: StandardsById = {}` and every
caller currently relies on that empty default.

  - Pass `optionsToStandardsById(options)` from the same loaded options the picker
    uses, so the picker and the evaluator cannot disagree about what a key means
  - Load once per record session, not per keystroke — these are Firestore reads over
    every flagged equipment and each one's equation subcollection
  - This is DRAFTING only. A committed record replays from its snapshots
    (`calibrationRecordService.ts:519`). Do not route committed records through
    `loadStandardOptions()`, and do not "unify" the two paths.

Test: select a standard on a row, and a formula using STD_C1 on that row produces a
number rather than 'awaiting-input'. That test is the one that proves the phase
delivered something usable.

## TASK 4 — Correct the stale text in the template builder

`src/pages/RecorderTemplateBuilderPage.tsx`, the `column.type === 'standard'` panel
(around line 480), currently ends with:

    Manage the standards themselves in Settings. Nothing to configure here.

**"in Settings" is wrong.** It points at the `ReferenceStandardManagerModal` that
ADR-014 D2 retired. Standards now live in the equipment register: an equipment record
with the `isReferenceStandard` toggle on (`EquipmentDetailPage.tsx:403`), carrying one
`ConversionEquation` per calibrated range. The route is `equipment/:id`.

Rewrite it to send a template author to the right place — equipment detail, reference-
standard toggle, conversion equations — using whatever nav label the app actually shows
for that section. Check the label; do not guess it.

While you are in that panel, verify the STD_* variable names it advertises still match
`STANDARD_VARIABLE_NAMES` in referenceStandardVariables.ts. If the panel lists a
variable the code no longer resolves, fix the panel.

## TASK 5 — If a real picker is not achievable, say so and gate the feature

If Task 1 concludes TREB cannot support this within its public API and no acceptable
overlay works either, then **do not leave a text cell in place**. Instead:

  - Report that plainly, with the evidence
  - Propose the alternative (e.g. selection in a side panel beside the grid, keyed to
    the highlighted row)
  - Recommend hiding `standard` from the template builder's column-type list until it
    is usable, so no author can build a template that cannot be filled in safely

A missing feature is recoverable. A free-text key that silently mis-resolves is the
defect this whole line of work exists to remove.

## CONSTRAINTS

- Do NOT change the composite key format, the STD_* resolution, the adapter, or any
  snapshot behaviour. Phase 12 verified all of it.
- Do NOT write a second options builder. referenceStandardOptions.ts exists and is
  correct; if you need something it lacks, extend it in place.
- Do NOT route committed records through loadStandardOptions(). Snapshots only.
- Do NOT change the formula grammar or engine.
- Do NOT reach into TREB internals.
- Do NOT replicate SpreadsheetGrid.tsx's approach.
- Do NOT delete anything. Do NOT touch recorder-reserved/ or pre-existing work.
- New markdown in docs/ (RULE 9). If unsure, ask (RULE 1, RULE 7).

## TESTS

  - Selecting an option writes the correct composite key
  - No code path allows a standard cell to hold an arbitrary typed string
  - Only isReferenceStandard equipment appears in the options
  - Warnings surface at selection time for an out-of-range and a past-due standard
  - Read-only records render the label and offer no picker
  - AFTER selecting, a formula using STD_C1 on that row evaluates to a number and NOT
    'awaiting-input' (Task 3 — the proof the feature is usable end to end)
  - Two rows on DIFFERENT standards still evaluate with their own coefficients after
    selection through the picker, not just in a unit test with a hand-built map
  - A committed record still replays from its snapshot and does not call
    loadStandardOptions()
  - standardNamespaceIsolation.test.ts still passes UNMODIFIED

Run npm test and tsc --noEmit. Report both. Baseline is 43 files / 690 tests.

## DEFINITION OF DONE

  1. Pre-work output and branch
  2. TASK 1 FINDINGS — answers to (a) through (d), from reading TREB's own types,
     with your proposed approach stated before any UI code
  3. Diff summary per file
  4. Confirmation no TREB internals are touched, and that the composite key format is
     unchanged
  5. Confirmation you WIRED referenceStandardOptions.ts rather than writing a second
     options builder — and that grep now shows real callers, not just its test
  6. Where optionsToStandardsById() is fed into useLiveRecalculation, and confirmation
     the committed-record snapshot path was left alone
  7. The corrected wording you put in the template builder's standard panel, and the
     nav label you verified it against
  8. npm test and tsc output
  9. Whether a technician can, by any route, get arbitrary text into a standard cell
 10. Anything unverified, stated as UNVERIFIED — in particular say plainly if you
     could not exercise the picker in a browser
```

---

## Two things still outstanding for the owner

**Check what `CAL-FRC-001` stores in `outputUnit`.** Phase 12 flagged that the field
was free text with placeholder "e.g. kN, N, kg", and `kg` is not a valid `ForceUnit`.
If the real record holds `kg` or `kgf`, `STD_TO_N` is null and every force formula on
that standard reads `awaiting-input`. Phase 12 added an amber warning on the equipment
card, so it should be visible rather than silent — but it needs looking at.

**Verify one conversion by hand** once the picker exists: one real mV/V reading,
`c₁R + c₂R² + c₃R³` on a calculator, compared against the app. The coefficient-order
trap is guarded by tests now, but a hand check on real data costs two minutes and
closes it completely.
