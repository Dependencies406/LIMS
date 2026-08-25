# Phase 21 — Row lifecycle, misleading commit errors, and sheet tabs

## Model and effort

**Claude Sonnet 5 · Effort: High**

Task 1 changes what can be committed and how errors read — both touch the certificate
path. Task 4 is an architecture question that must be answered before it is built.

## Run after Phase 20

Phase 20 works in the same mount effect and `applyLayout`. Running both at once means
resolving the same conflict twice.

## What the reported errors actually mean

The 10 commit issues are **one root cause plus six misleading messages.**

### 1a. Blank rows are validated as if they held data

`commitRecord` (`calibrationRecordService.ts:596-609`) evaluates **every** row in
`record.rows` with no skip for empty ones. Draft creation seeds
`defaultRowCount` rows (`line 433`), all blank. So every unused row fails on
`STD_C1 has no value` and blocks the commit.

This is the same defect as the reported "shows several rows like infinite" — those blank
rows are **real rows in the record**, not display padding.

### 1b. Dependent columns report a wrong cause

In `recorderTemplateMockup.ts:148-154`:

```
try {
  const value = evaluate(...);
  rowData[column] = value;      // only assigned on SUCCESS
  results[column] = toCellResult(value);
} catch (error) {
  results[column] = toCellError(error);   // rowData[column] never set
}
```

When a column errors, it is **absent from `rowData`**. The next formula referencing it
then fails with `'READ_STD1' is not a known column` — but `READ_STD1` plainly is a known
column; it appears in the same error list with its own error. Hence:

```
Row 5, READ_STD1:     No reference standard has been selected...   ← the real cause
Row 5, RELERR_FAVG:   'READ_STD1' is not a known column.           ← misleading
Row 5, RELERR_Q1:     'RELERR_FAVG' is not a known column.         ← misleading
```

Six of the ten issues describe a template defect that does not exist. That sends the
reader looking in the wrong place.

---

## Prompt

```
Read first:
  - CLAUDE.md — hard rules
  - docs/PHASE_21_PROMPT_ROWS_TABS_AND_COMMIT.md — the analysis above
  - src/services/recorderTemplateMockup.ts:124-159 — the row evaluation loop
  - src/services/calibrationRecordService.ts:405-440 (draft seeding) and 590-622 (commit)
  - src/modules/recorder/components/RecordingGrid.tsx — mount effect, addRow, and the
    Phase 19 guards
  - docs/PHASE_19_PROMPT_FIX_GRID_FEEDBACK_LOOP.md — the guards you must not weaken
  - docs/adr/ADR-010-evaluation-contexts-and-summary-fields.md — the two error kinds

## MANDATORY PRE-WORK (CLAUDE.md RULE 3/4/8)

    git branch
    git worktree list
    git status
    netstat -ano | grep ":5173"

Verify the dev server points at THIS directory. Confirm Phase 20 is merged; if the grid
has no column sizing or freeze panes, STOP — you are running out of order.

## TASK 1 — Fix the commit blocker. Do this first; it is the one blocking real work.

### 1a. Decide what an empty row means, then apply it consistently

A row where every INPUT column is empty is not incomplete data — it is a row the
technician never used. Skip such rows at commit rather than reporting an issue per
formula column.

  - "Empty" means every input column is null/blank. A row with ANY input value is a real
    row and must still be fully validated — a half-filled row is exactly the incomplete
    data ADR-010 exists to catch. Do not weaken that.
  - Decide whether skipped rows are DROPPED from the committed record or stored as empty.
    State which and why. Dropping changes the record's row count; keeping them means the
    certificate must not print them.
  - Apply the same rule to summary aggregates: `col_mean` over a column must not average
    in skipped rows.

Report the rule you implemented in one sentence, because it changes what a certificate
contains.

### 1b. Make a dependent column's error name the real cause

When a formula column errors, downstream columns currently report "is not a known
column", which is false and sends the reader to the wrong place.

Fix so a column whose dependency failed reports that its dependency has no value, naming
it. Do NOT fix this by writing a fake value into `rowData` — a null or zero there would
let a formula compute a wrong number from a failed input, which is precisely the class of
defect ADR-010's strict empty semantics prevents.

Preserve the existing error KINDS (ADR-010): a dependency that is awaiting-input yields
awaiting-input downstream, not invalid-computation. The distinction drives whether a cell
renders quiet or loud.

Test: a chain A -> B -> C where A has no standard selected produces one message naming A
as the cause, and B and C say they depend on a value that is not available — with no
message anywhere claiming a real column is unknown.

## TASK 2 — Make the row count match reality

Draft creation seeds `defaultRowCount` blank rows, and RecordingGrid seeds
`Math.max(rows.length, template.defaultRowCount)`. On a template with a large
`defaultRowCount` that is a wall of unusable rows.

Decide and state the model:

  - How many rows does a NEW draft start with?
  - How many does the grid display beyond the rows that hold data?
  - What does `defaultRowCount` mean now — the starting count, or a minimum?

A small starting count plus the existing `addRow` (and Task 3's delete) is the obvious
answer, but say what you chose. Do NOT change `defaultRowCount`'s type or remove it from
the template schema; existing templates set it.

## TASK 3 — Delete the selected row, with confirmation

TREB's `DeleteRows(start_row?, count?)` is public. Its doc: leave `start_row` undefined
to use the current selection.

  - A delete control alongside the existing add-row control
  - **Confirm before deleting**, naming what will be lost — the row number, and whether
    it holds data. Deleting a row of measurements is not undoable from the user's side.
  - Refuse to delete a header row. Guard the row index against `FIRST_DATA_ROW`.
  - Refuse to delete the last remaining data row, or handle the empty-grid case
    explicitly — say which.
  - Update `rowCountRef` and re-emit rows so the record and the grid stay in step.
  - Not available on read-only records.

**The write MUST sit inside Phase 19's `isProgrammaticWriteRef` try/finally**, exactly as
`addRow` does. A delete that bypasses the guard reopens the feedback loop.

## TASK 4 — Sheet tabs: INVESTIGATE AND REPORT BEFORE BUILDING

The request is: each section as its own sheet tab, with Measurement Results and Summary
Fields as a higher-level split above those.

TREB supports it — `AddSheet`, `DeleteSheet`, `ActivateSheet` are public, and
`CreateSpreadsheet` currently passes `tab_bar: false`.

**But there is a structural problem you must resolve before writing any of it.**

A `RecordRow` spans EVERY section — row 3 is one calibration point, with columns in all
sections. The current single-sheet layout enforces that alignment structurally: there is
one row 3. Split sections across sheets and row 3 exists independently on each, so insert,
delete, reorder and row-count must be kept in lockstep across every sheet, and any
divergence silently misaligns a calibration point with its own results. That is a wrong
number on a certificate, from a UI action.

Also affected: the `document-change` subscription reads ONE range, `extractInputRows`
reads one layout, and Phase 19's equality guard compares one row set.

So:

  a. **Summary Fields as a separate tab is safe and worth doing** — summary values are
     per-record, not per-row, so no alignment problem exists. Do this part.
  b. **Sections as separate tabs: report first.** State how you would keep rows aligned
     across sheets, what happens when they diverge, and what it does to the subscription
     and the Phase 19 guards. Then STOP and let the owner decide. Do not build it on the
     strength of it being requested.
  c. **Offer the cheaper alternative in your report.** Phase 20 froze the header rows and
     first column. Section-jump navigation — a control that scrolls the single sheet to a
     chosen section — gives most of the "focus on one section" benefit with zero
     alignment risk. Say whether you think that would meet the need.

## CONSTRAINTS

- Do NOT weaken, reorder or bypass Phase 19's guards. Every new write goes inside them.
- Do NOT write placeholder values into `rowData` for failed columns (Task 1b).
- Do NOT weaken ADR-010's strict empty semantics for rows that hold ANY data.
- Do NOT change the formula grammar, evaluator, adapter, composite key format, or
  ADR-015 conversion logic.
- Do NOT build section-per-sheet without owner sign-off (Task 4b).
- Do NOT reach into TREB internals. All four APIs above are public.
- Do NOT delete anything. Do NOT touch recorder-reserved/ or pre-existing work.
- New markdown in docs/ (RULE 9). If unsure, ask (RULE 1, RULE 7).

## TESTS

  1. A record with trailing empty rows commits successfully
  2. A row with SOME inputs filled still blocks commit — the strictness that matters
  3. Column aggregates ignore skipped rows
  4. A -> B -> C dependency chain: one message names the real cause; no message claims a
     real column is unknown
  5. Error kinds are preserved down a dependency chain
  6. Deleting a row updates the record and the grid together
  7. Delete is refused on a header row and on a read-only record
  8. Delete writes go through the Phase 19 guard — assert the flag is set during it
  9. Every Phase 19 RecordingGrid test still passes UNCHANGED, and the break-and-revert
     still fails the loop tests when the guards are disabled

Run npm test and tsc --noEmit. Report both, with before and after counts.

## DEFINITION OF DONE

  1. Pre-work output, branch, and confirmation Phase 20 is merged
  2. The empty-row rule, in one sentence, and whether skipped rows are dropped or kept
  3. The new row-count model, and what `defaultRowCount` now means
  4. A before/after of the reported 10-issue error list — how many issues the same record
     produces now, and what each says
  5. Confirmation no placeholder value is written into rowData for a failed column
  6. Task 4: the summary tab built; the section-per-sheet ANALYSIS with your
     recommendation, NOT an implementation
  7. Confirmation Phase 19's guards are intact, with the break-and-revert result
  8. npm test and tsc output
  9. Anything unverified, stated as UNVERIFIED
```

---

## Your template-publish error is separate

```
TemplateNotPublishableError: Template has 1 unresolved issue(s)
```

That is the template, not the record. Open it in the builder and press **Verify** — Phase
16's navigator badges will mark the section and column with the problem.

## The locked-cell console noise is correct behaviour

```
invalid: locked cells
cell is locked for editing
```

That is TREB refusing an edit into a formula column, which is what should happen. Worth
suppressing eventually so it does not mask real errors, but nothing is wrong.
