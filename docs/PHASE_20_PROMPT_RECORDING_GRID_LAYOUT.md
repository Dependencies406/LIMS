# Phase 20 — Recording grid layout: truncated headers and unreachable scroll

## Model and effort

**Claude Sonnet 5 · Effort: Medium**

All public TREB API, no internals, no engine or schema changes. Medium rather than Low
for one reason: Task 5 changes **event timing**, and Phase 19's feedback-loop guards
depend on event behaviour. That interaction must be re-tested, not assumed.

## The symptoms

From a real Draft record on a wide template:

- Column headers truncate — `Used Standard` renders as `Used Standarc`, and the merged
  section header `Measurement …` is cut at the right edge
- The table extends past the visible area and **cannot be scrolled** to reach it
- Scrolling down loses the header rows, so on a template with 12+ columns there is no way
  to tell which column you are typing into

## Root causes, located by reading

**1. Nothing ever sets a column width.** `applyLayout` in `RecordingGrid.tsx` writes
values, merges sections, applies styles and number formats — and never sizes a column.
TREB's default width is used for every column regardless of header length.

`SetColumnWidth` is public and unused. Its own doc:

> `@param width` - desired width (can be 0) or **undefined means 'auto-size'**
> `@param column` - column, or columns (array), or **undefined means all columns**

**2. The container is clipped and has no definite height.** `RecordEntryPage.tsx:515`
wraps the grid in `border border-gray-200 rounded-lg overflow-hidden`, and
`RecordingGrid` renders `min-h-[300px] h-full w-full`. `h-full` inside an auto-height
parent resolves to auto, and `overflow-hidden` clips anything TREB paints outside the
box — including its own scrollbars.

**3. `Resize()` is never called.** TREB's doc says it "should be called automatically by a
resize observer set in the containing tag class" — but this grid is created via
`CreateSpreadsheet` into a plain `div`, so nothing does it. The grid mounts while banners
above it are still settling, so TREB may measure a stale container size.

**4. No freeze panes.** `Freeze(rows?, columns?)` is public and unused.

---

## Prompt

```
Read first:
  - CLAUDE.md — hard rules
  - docs/PHASE_20_PROMPT_RECORDING_GRID_LAYOUT.md — the analysis above
  - src/modules/recorder/components/RecordingGrid.tsx — ALL of it. `applyLayout`
    (~line 207) and the mount effect (~line 366) are where this phase works.
  - docs/PHASE_19_PROMPT_FIX_GRID_FEEDBACK_LOOP.md — the guards you must not break
  - docs/adr/ADR-007-template-system-strategy.md — the CORRECTION block. Public API
    only; SpreadsheetGrid.tsx's internals-reaching is explicitly not the pattern.
  - src/pages/RecordEntryPage.tsx — the wrapper at ~line 515

## MANDATORY PRE-WORK (CLAUDE.md RULE 3/4/8)

    git branch
    git worktree list
    git status
    netstat -ano | grep ":5173"

Verify any dev server points at THIS directory. Pre-existing uncommitted work on this
branch is NOT yours. recorder-reserved/ is an archive. STOP and ask if anything differs.

## VERIFIED FACTS — checked against TREB 38.6.2's own .d.ts. Confirm, then use.

  SetColumnWidth(column?: number | number[], width?: number, allow_shrinking?: boolean)
      undefined column = all columns; undefined width = auto-size
  SetRowHeight(row?: number | number[], height?: number)
      undefined height = auto-size
  Freeze(rows?: number, columns?: number)      — also GetFreeze(), FreezeSelection()
  Resize()                                      — call when the container resizes
  Batch(func: () => void, paint?: boolean)

All five are public on EmbeddedSpreadsheet and NONE is currently used by RecordingGrid.

## TASK 1 — Size the columns

Auto-size after seeding, in `applyLayout`.

**Test the merged section header first.** The section header row contains long merged
text like "Measurement Results (Forward)". If auto-size measures that against a single
column, one column becomes absurdly wide. Determine what TREB actually does with merged
cells during auto-size and REPORT it.

If merges inflate the width, size against the column-header row and data instead, and set
widths explicitly. Either way, apply a sane minimum and maximum — a column should fit
`Used Standard` without truncating, and should not consume half the viewport because one
cell holds a long error message from an `invalid-computation` result.

Note that `updateComputedValues` writes error MESSAGES into formula cells (line ~465). If
widths are auto-sized once at mount, a later error message will not resize anything —
which is correct and preferable to columns jumping while someone types. Say which
behaviour you implemented.

## TASK 2 — Make the grid scrollable and give it a real height

  - `overflow-hidden` on the wrapper at RecordEntryPage.tsx:515 is there for the rounded
    corners. Keep the corners; stop it clipping TREB's scrollbars. Adjust the wrapper or
    move the rounding.
  - Give the grid container a definite height so TREB has a viewport to scroll within,
    rather than growing to content height. A viewport-relative height with a sensible
    minimum is fine; state what you chose and why.
  - Confirm horizontal scrolling actually reaches the LAST column on the widest real
    template — the one in the screenshot has 12+ columns.

## TASK 3 — Freeze the headers and the standard column

`Freeze(2, 1)` pins the two header rows (section + column) and the first column.

Check what the first column actually is before hardcoding `1`. On the reported template it
is `Used Standard`, which is exactly what you want visible while scrolling right — but a
template need not have a `standard` column first, or at all. Derive the count rather than
assuming, and freeze 0 columns when there is nothing worth pinning.

## TASK 4 — Call Resize() when the container changes

Attach a `ResizeObserver` to the grid container in the mount effect and call `sheet.Resize()`
on change. Disconnect it in the existing cleanup alongside `sheet.Cancel(token)`.

This also covers the mount-time case: banners above the grid (the unit-mismatch warning,
the recovery banner) change height after the grid mounts, and TREB currently never learns.

## TASK 5 — Batch the writes — AND RE-PROVE PHASE 19'S GUARDS

`applyLayout` makes many individual calls, and `updateComputedValues` calls `ApplyStyle`
once per cell. Wrapping each in `Batch(...)` should cut repaints and, since both
`SetRange` and `ApplyStyle` publish `document-change` (Phase 19 Task 3), should reduce the
event volume too.

**This changes event timing, and Phase 19's guards depend on event behaviour.** Therefore:

  - Any `Batch` in `updateComputedValues`/`addRow` goes INSIDE the existing
    `isProgrammaticWriteRef` try/finally, never around it or replacing it.
  - Re-run RecordingGrid.test.tsx and confirm all its tests still pass UNCHANGED.
  - Repeat Phase 19's break-and-revert proof: disable both guards, confirm the loop tests
    still fail, restore. A batching change that silently made those tests vacuous would
    hide the return of the freeze.
  - If batching turns out to interact badly with the guards, SKIP THIS TASK and report
    why. It is a performance improvement; the guards are a correctness fix. Correctness
    wins.

## CONSTRAINTS

- Do NOT reach into TREB internals (ADR-007's correction). The five APIs above are public.
- Do NOT modify, weaken or reorder Phase 19's guards.
- Do NOT change what is written into cells, extractInputRows, standard key/label
  translation, ADR-015 conversion rendering, or any computed value.
- Do NOT change template schema or defaultRowCount behaviour.
- Do NOT delete anything. Do NOT touch recorder-reserved/ or pre-existing work.
- New markdown in docs/ (RULE 9). If unsure, ask (RULE 1, RULE 7).

## TESTS

  1. Column widths are set after seeding — assert SetColumnWidth is called
  2. A long header is not truncated at the chosen minimum width
  3. A long invalid-computation message does not blow a column past the maximum
  4. Freeze is called with the derived row/column counts, and with 0 columns for a
     template whose first column is not worth pinning
  5. ResizeObserver is attached at mount and disconnected on unmount
  6. Every RecordingGrid.test.tsx test from Phase 19 still passes UNCHANGED
  7. The Phase 19 break-and-revert still fails the loop tests when guards are disabled

Run npm test and tsc --noEmit. Report both, with before and after counts.
Baseline is 67 files / 1188 tests.

## DEFINITION OF DONE

  1. Pre-work output and branch
  2. What TREB's auto-size does with MERGED section headers, and what you did about it
  3. The height and overflow strategy you chose, and why
  4. How the freeze column count is derived
  5. Whether Batch was applied or skipped — and if applied, the evidence Phase 19's
     guards still hold, including the break-and-revert result
  6. Confirmation no TREB internals are touched
  7. npm test and tsc output
  8. Anything unverified, stated as UNVERIFIED — this phase is visual, so say plainly
     whether you saw the grid render, and list what the owner must check by eye:
     header truncation, horizontal scroll to the last column, frozen headers while
     scrolling, and no return of the freeze
```

---

## Also worth your eye, not a coding task

The screenshot shows roughly twenty empty rows for a record with one filled. That is the
template's `defaultRowCount`, not a bug — but if your real runs use five points, lowering
it in the template builder will make the grid far easier to read, and it costs nothing
since `addRow` exists.
