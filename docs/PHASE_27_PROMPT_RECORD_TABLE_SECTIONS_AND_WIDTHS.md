# Phase 27 — Record table: per-section selection and readable column widths

## Model and effort

**Claude Sonnet 5 · Effort: High**

No engine changes, no metrology risk, no new evaluation context — this is a renderer, a
schema field, and a properties panel. High effort because the layout fallback logic has
several interacting cases and the failure mode is a mangled certificate.

Opus is not needed here. If you would rather run it on Opus anyway, nothing in the prompt
changes.

## Context for a fresh session

This is a **standalone task**. Everything needed is below plus the files it names — no
prior conversation is required.

Two prior findings you should not re-derive:

1. **`treb-table` cannot work on a calibration-record PDF template.** It resolves data
   only through `pdfTemplateRenderer.renderTemplate` (job-mode) via
   `buildTrebDataRegistry`. Record certificates print through a different entry point,
   `renderTemplateWithContext`, which never populates `trebDataRegistry`. The element for
   records is **`record-table`** (ADR-004). This was an authoring mistake, already
   resolved, and is NOT what this phase fixes.
2. **`layoutTextToLines` (`pdfTextLayoutService.ts:72`) is behaving correctly.** It tries
   whole words first and only breaks character-by-character when a column cannot fit even
   one word. That fallback is a correct response to an impossible constraint. **Do not
   modify the wrapping algorithm.** Fix what makes columns impossibly narrow.

**Repository note:** `LIMS-New-Backup` exists **nested inside the project** at
`C:\Users\seela\Desktop\LIMS-New\LIMS-New-Backup\` with its own `package.json` and `src/`.
A previous session searched only for a *sibling* of `LIMS-New` and wrongly reported it
absent. Search inside the project when doing RULE 3 checks. Never modify, move or delete
it (RULE 2, RULE 6).

## The bug

`renderRecordTable.ts:238`:

```ts
const colWidth = totalWidth / columns.length;
```

Total element width divided evenly across every included column, with **no minimum**. A
`record-table` defaults to every column of every section (`ElementPropertiesPanel.tsx:1453`
— "Empty/omitted `columns` means every column, in template order").

The owner's template has five sections. All their columns squeezed into ~526pt gives
roughly 15-20pt per column — too narrow for any word, so every cell wraps one character
per line down the page.

---

## Prompt

```
Read first:
  - CLAUDE.md — hard rules
  - docs/PHASE_27_PROMPT_RECORD_TABLE_SECTIONS_AND_WIDTHS.md — this file
  - docs/adr/ADR-004-pdf-record-table-band.md — including its revision note. The
    "no fixed per-column widths" reasoning at renderRecordTable.ts:235-237 comes from
    here; understand it before changing that line.
  - docs/adr/ADR-005-record-lifecycle.md — the renderer reads the record's PINNED
    snapshot, never the live template. Preserve that.
  - src/services/pdf-renderers/renderRecordTable.ts — ALL of it
  - src/modules/pdf-template-builder/types.ts:298 — RecordTableElement
  - src/modules/pdf-template-builder/components/ElementPropertiesPanel.tsx — around
    line 1453, the existing column checklist
  - src/services/pdfTextLayoutService.ts — read layoutTextToLines to confirm finding 2
    above, then leave it alone

## MANDATORY PRE-WORK (CLAUDE.md RULE 3/4/8)

    git branch
    git worktree list
    git status
    Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
      Select-Object ProcessId, CommandLine | Format-List

Report each FULL path and confirm none runs from LIMS-New-Backup (see the note above —
it is nested INSIDE the project, not beside it).

## TASK 1 — Select sections per element

Add `sections?: string[]` to `RecordTableElement` — an ordered list of section ids this
element renders. This is the owner's actual mental model: one element per section,
stacked down the page.

Semantics, and state them in the type's doc comment:

  - Omitted or empty = every section, in template order (today's behaviour, unchanged
    for existing templates)
  - `sections` filters WHICH sections appear
  - The existing `columns` then narrows WITHIN those sections
  - A section id in `sections` that no longer exists in the record's pinned snapshot is
    skipped silently — a template can change after a record pins it (ADR-005), and a
    missing section is not an error at render time
  - If the filter leaves zero columns, render nothing rather than an empty grid, and
    say why in the properties panel at authoring time

Properties panel: a section checklist above the existing column checklist. Selecting
sections should update the column list to show only those sections' columns — an author
should not have to reason about the interaction between the two lists.

Keep `recorderTemplateId` authoring-time only, exactly as documented today. The renderer
must keep reading columns from `jobData.recordTemplate` (the pinned snapshot).

## TASK 2 — A minimum column width, and graceful degradation

Replace the unguarded even split. In order:

  1. Compute the natural width each column needs — header text and the widest cell.
  2. If the total fits `element.width`, distribute proportionally rather than equally.
     A "Used Standard" column needs more than a 5-decimal number column.
  3. If it does not fit, apply a **minimum column width** and degrade in this order:
     a. Shrink the font toward a floor you define — state the floor and why
     b. Then truncate cell text with an ellipsis
     c. NEVER fall through to character-by-character wrapping
  4. If even the minimum widths exceed the element width, the layout is impossible.
     Render what you can and report it — see Task 3.

Section header spans (`computeSectionSpans`) must keep matching their columns' summed
widths once widths vary. That is the easiest thing to break here; test it directly.

Do NOT modify `layoutTextToLines`. It is correct.

## TASK 3 — Tell the author before they generate a PDF

The owner discovered this by rendering a certificate and reading it. That is too late.

In the properties panel, when the current section/column selection would force columns
below the minimum at the element's width, show it: how many columns, what width they
would get, and that text will be truncated. Update live as the selection changes.

Suggest the fix in the message — select fewer sections, or widen the element.

## CONSTRAINTS

- Do NOT modify layoutTextToLines or the wrapping algorithm.
- Do NOT let the renderer read the live template; pinned snapshot only (ADR-005).
- Do NOT break existing templates: an element with neither `sections` nor `columns` must
  render exactly as it does today, modulo the width improvements.
- Do NOT introduce fixed per-column x positions — ADR-004 rejects them, and the column
  set is not known until render time. Proportional widths are fine; fixed ones are not.
- Do NOT change record data, the formula engine, or anything outside the PDF path.
- Do NOT delete anything. Do NOT touch recorder-reserved/ or LIMS-New-Backup/.
- New markdown in docs/ (RULE 9). If unsure, ask (RULE 1, RULE 7).

## TESTS

  1. `sections` filters to the listed sections, in the listed order
  2. `sections` + `columns` together narrow correctly
  3. Omitting both renders every column — the existing-template case
  4. A section id absent from the pinned snapshot is skipped, not an error
  5. Columns never render below the minimum width
  6. A wide column set degrades by font shrink then ellipsis — and NEVER produces
     single-character lines. Assert on the produced line count for a known-narrow case;
     this is the regression test for the reported bug.
  7. Section header spans align with their columns' summed widths under variable widths
  8. Proportional distribution gives a long-text column more width than a short one
  9. The properties-panel warning appears when the selection would go below the minimum

Run npm test and tsc --noEmit. Report both, with before and after counts.

## DEFINITION OF DONE

  1. Pre-work output, and confirmation about LIMS-New-Backup specifically
  2. The minimum column width and font floor you chose, with reasoning
  3. The exact degradation order implemented
  4. Confirmation layoutTextToLines is unmodified
  5. How section header spans stay aligned with variable column widths
  6. Diff summary per file
  7. Confirmation an element with no `sections`/`columns` renders as before
  8. npm test and tsc output
  9. Anything unverified, stated as UNVERIFIED — this is a visual fix, so say plainly
     whether you rendered a PDF and looked at it, and list what the owner must check:
     a five-section table, a single-section table, and one deliberately too narrow
```

---

## Why sections rather than only columns

The per-column checklist already exists and technically solves the width problem — but it
makes the author pick columns one at a time out of a flat list spanning five sections,
with no grouping. Selecting *sections* matches how the certificate is actually laid out:
one table per logical block, stacked down the page.

Both filters together also cover the real case where one section's table should omit an
internal working column.
