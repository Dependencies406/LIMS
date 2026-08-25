# Phase 30 — Audit every PDF element, and fix what the audit finds

## Model and effort

**Claude Sonnet 5 · Effort: High**

Broad rather than deep. Eleven element types across seven template scopes, each with a
render path, a measure path and a properties panel. The work is systematic verification;
the risk is declaring something "works" without having actually rendered it.

**Task 1 is a confirmed bug with a known fix. Do it first**, then the audit.

## Context for a fresh session

Standalone. `LIMS-New-Backup` exists **nested inside** the project at
`C:\Users\seela\Desktop\LIMS-New\LIMS-New-Backup\` with its own `package.json` — a prior
session searched only for a sibling and wrongly reported it absent. Never modify it
(RULE 2, RULE 6).

### Structure you need before starting

**Eleven element types** (`types.ts:9`): `text`, `line`, `rectangle`, `image`, `checkbox`,
`chart`, `equipment-table`, `documents-table`, `training-table`, `treb-table`,
`record-table`. All eleven have renderer cases (`pdfTemplateRenderer.ts:659-677`) — none is
dead code.

**Seven template scopes** (`PdfTemplateScope`, `types.ts:384`): `jobs`, `customers`,
`documents`, `global`, `staff`, `equipment`, `calibrationRecords`.

**Four print entry points, each populating different data:**

| Entry point | Scope | Populates |
|---|---|---|
| `pdfTemplateRenderer.renderTemplate` | jobs | `trebDataRegistry` via `buildTrebDataRegistry` |
| `recordTemplatePrintService` → `renderTemplateWithContext` | calibrationRecords | record + pinned template snapshot |
| `documentsTemplatePrintService` | documents | document index |
| `staffPdfService` | staff | staff data |

**This asymmetry is the root of a known class of failure.** A `treb-table` on a
calibration-record template silently renders "N/A - Data Not Found" because
`renderTemplateWithContext` never populates `trebDataRegistry`. The element is not broken;
it is impossible in that scope. **The palette does not filter by scope** —
`SpreadsheetSection.tsx` contains no reference to `scope` at all — so every scope offers
every element.

---

## Prompt

```
Read first:
  - CLAUDE.md — hard rules, especially RULE 1 (never assert what you have not verified)
  - docs/PHASE_30_PROMPT_PDF_ELEMENT_AUDIT.md — this file, including the tables above
  - src/modules/pdf-template-builder/types.ts — PdfElementType, PdfTemplateScope, and
    the *_DEFAULT_COLUMNS constants
  - src/services/pdfTemplateRenderer.ts — the element switch at ~659, and every
    measure* function
  - src/services/pdf-renderers/ — every renderer in this folder
  - docs/PHASE_27_PROMPT_RECORD_TABLE_SECTIONS_AND_WIDTHS.md and PHASE_28/29 — what
    already changed in record-table, so you do not re-litigate it

## MANDATORY PRE-WORK (CLAUDE.md RULE 3/4/8)

    git branch
    git worktree list
    git status
    Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
      Select-Object ProcessId, CommandLine | Format-List

Report each FULL path; confirm none runs from LIMS-New-Backup (nested INSIDE the project).

## TASK 1 — Fix the equipment-table row number

`types.ts:496` declares `{ id: 'no', label: 'No.' }`, and `renderEquipmentTable.ts`
resolves every column as `eq[col.id]` — so it looks up a non-existent `equipment.no`
field and renders blank for every row.

It must be a **computed ordinal**, not a data lookup:

  - `slice.rowStart + i + 1`, so numbering continues correctly across continuation pages
    rather than restarting at 1
  - `measureEquipmentTableHeights` must treat it identically, or measured and drawn
    heights diverge (this is the same seam Phase 27 hit on record-table)
  - Check whether `documents-table` and `training-table` declare a similar ordinal column
    with the same defect, and fix them the same way if so

Test with a paginated table, asserting page 2 starts at the right number.

## TASK 2 — Build the scope × element matrix, from evidence

Produce a table: for each of the 11 element types × 7 scopes, does the element RESOLVE
DATA in that scope?

Determine this by reading which entry point serves each scope and what data it
populates. Cite the file and line that decides each answer. Where an element takes no
data at all (`text`, `line`, `rectangle`), say so — those work everywhere.

**Report the matrix before changing any behaviour.** It is the deliverable; the fixes
follow from it.

Flag every combination that is currently offered in the palette but cannot resolve. The
`treb-table` on `calibrationRecords` case is one known example — find the rest.

## TASK 3 — Verify each element actually renders

For every element type, confirm by reading the renderer:

  - It handles a **missing/empty data source** without throwing, and shows something
    honest rather than a blank or a misleading message
  - It has a **measure function** where it participates in pagination, and that function
    matches the draw pass — name the function, or say the element is static
  - Its **properties panel** exposes the fields the renderer actually reads, and no
    fields the renderer ignores

Report per element in a table: renders / handles empty / paginates / measure matches /
panel matches. Anything you could not verify by reading, mark UNVERIFIED — do not guess.

## TASK 4 — Fix what Tasks 2 and 3 find, within limits

  - **Do NOT delete any element type.** All eleven are in use in some scope.
  - Fix defects that are clearly wrong and contained — a wrong field lookup, a missing
    empty-state guard, a measure/draw mismatch.
  - For anything larger — palette scope filtering, a redesigned data source — REPORT it
    with a recommendation instead of building it. Say what you would do and why.
  - "N/A - Data Not Found" is misleading when the real cause is scope mismatch. At
    minimum, make that message distinguish "no data for this element" from "this element
    cannot resolve in this template's scope".

## OUT OF SCOPE

record-table's widths, overflow modes and section picker (Phases 27-29 own those). Do not
change them. New element types. The recorder module.

## CONSTRAINTS

- Do NOT declare an element "working" without naming the evidence.
- Do NOT delete any element type or default column.
- Do NOT change record-table behaviour.
- Do NOT change the formula engine, record data, or Firestore rules.
- Do NOT build palette scope-filtering in this phase — report it.
- Do NOT delete anything. Do NOT touch recorder-reserved/ or LIMS-New-Backup/.
- New markdown in docs/ (RULE 9). If unsure, ask (RULE 1, RULE 7).

## TESTS

  1. equipment-table 'No.' renders 1..N, and continues correctly on page 2
  2. Same for documents-table / training-table if they share the defect
  3. Every table element renders without throwing when its data source is empty
  4. Every table element's measure function matches its draw pass for a known fixture
  5. Any defect you fix gets a test that would have caught it

Run npm test and tsc --noEmit. Report both, with before and after counts.

## DEFINITION OF DONE

  1. Pre-work output, and the LIMS-New-Backup confirmation specifically
  2. THE SCOPE × ELEMENT MATRIX, with a file/line citation per answer
  3. The per-element verification table from Task 3, with UNVERIFIED marked honestly
  4. What you fixed, and what you are recommending instead of fixing
  5. Confirmation no element type or default column was removed
  6. Diff summary per file
  7. npm test and tsc output
  8. Anything unverified — and say plainly whether you generated any actual PDF. If you
     did not, list which element/scope combinations the owner must check by eye
```

---

## One small thing carried over

The Phase 29 session noticed the section/column checkboxes have **no `<label>`/`htmlFor`
association** — a pre-existing accessibility gap, not something it introduced. Worth
fixing whenever that panel is next open; it also makes component tests query by accessible
name instead of walking the DOM.

## What I would not do yet

**Palette scope-filtering** is the fix that would have prevented your `treb-table`
problem — showing only elements a template's scope can resolve. I have deliberately kept
it out of this phase: the matrix from Task 2 is its specification, and building it before
the matrix exists means guessing at the rules. Once the audit lands, that becomes a small,
well-defined follow-up.
