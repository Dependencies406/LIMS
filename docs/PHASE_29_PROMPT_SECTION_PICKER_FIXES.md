# Phase 29 — Section/column picker: select-all, stale list, and the empty-selection bug

## Model and effort

**Claude Sonnet 5 · Effort: Medium**

Contained to the PDF builder's properties panel and the `RecordTableElement` schema. No
renderer changes, no engine changes. Medium rather than Low because one fix is a schema
semantics change that must not alter how existing templates render.

## Context for a fresh session

Standalone. `LIMS-New-Backup` exists **nested inside** the project at
`C:\Users\seela\Desktop\LIMS-New\LIMS-New-Backup\` with its own `package.json` — a prior
session searched only for a sibling and wrongly reported it absent. Never modify it
(RULE 2, RULE 6).

Relevant existing design: the panel builds its checklists from the **live** recorder
template (`ElementPropertiesPanel.tsx:374`, `getAllTemplates()`), while the renderer always
reads the record's **pinned snapshot** at print time (ADR-005). That asymmetry is correct
and must be preserved — but it currently confuses authors, which is Task 2.

## Three defects found by reading, 2026-08-21

**1. Empty selection is unrepresentable.** `toggleSection` (line ~1464) writes
`sections: []` when the last section is unchecked, and `selectedSectionIds` (line 1463)
treats an empty array as "all". So unchecking the final section **silently re-checks
everything**. The same pattern exists for `columns`.

**2. An orphaned section id renders as a silently empty selection.** If `sections` holds
an id no longer present in the live template, every checkbox shows unchecked with no
explanation. This is the reported symptom — four sections listed, all unchecked, and a
fifth missing entirely.

**3. The template list is fetched once on mount.** Editing the recorder template in
another tab and returning to the PDF builder shows a stale section list, with no way to
refresh short of closing and reopening the builder.

---

## Prompt

```
Read first:
  - CLAUDE.md — hard rules
  - docs/PHASE_29_PROMPT_SECTION_PICKER_FIXES.md — this file, including the three defects
  - docs/PHASE_27_PROMPT_RECORD_TABLE_SECTIONS_AND_WIDTHS.md — where `sections` came from
  - src/modules/pdf-template-builder/components/ElementPropertiesPanel.tsx — the
    record-table block from ~line 1451, especially selectedSectionIds, toggleSection,
    allColumnDefs, selectedKeys, toggleColumn
  - src/modules/pdf-template-builder/types.ts:302 — RecordTableElement
  - src/services/pdf-renderers/renderRecordTable.ts — getRecordTableColumns, which reads
    these same fields at render time. Its behaviour must not change for existing data.

## MANDATORY PRE-WORK (CLAUDE.md RULE 3/4/8)

    git branch
    git worktree list
    git status
    Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
      Select-Object ProcessId, CommandLine | Format-List

Report each FULL path; confirm none runs from LIMS-New-Backup (nested INSIDE the project).

## TASK 1 — Make "none selected" representable, without breaking existing templates

Today `undefined` and `[]` both mean "all". They must stop meaning the same thing.

  - `undefined` (absent) continues to mean **all** — this is what every existing template
    has, and its rendering must not change. Assert that with a test.
  - `[]` must come to mean **none selected**, so a table with no sections renders nothing
    and the author sees that state honestly instead of a silent re-check.
  - Apply the same to `columns`.
  - `getRecordTableColumns` must implement the same distinction. Check whether it
    currently conflates them and report what you found before changing it.

If you conclude a different encoding is safer — a separate flag, say — argue for it and
say why, but do NOT leave `[]` and `undefined` synonymous.

## TASK 2 — Surface orphaned ids instead of hiding them

When `sections` or `columns` reference an id absent from the live template, say so:
which ids, and that they were probably renamed or removed since this element was
configured.

  - Offer a one-click way to drop the orphans from the selection.
  - Note in the message that the renderer uses the record's PINNED snapshot, so an
    orphaned id here does not necessarily mean a broken certificate — a record pinned
    before the change still has that section. Do not imply the certificate is broken.
  - Skipping unknown ids at render time is existing, correct behaviour (Phase 27). Do
    not change it.

## TASK 3 — Select all / Deselect all

For both the Sections and the Columns lists:

  - "Select all" sets the explicit full list, not `undefined`. The author asked for all;
    record that they did.
  - "Deselect all" sets `[]`, which Task 1 has made meaningful.
  - Show a count — "3 of 5 selected" — so the state is legible without counting boxes.
  - Deselecting all sections must empty the Columns list too, since it only ever shows
    columns from selected sections. Say what will render (nothing) rather than leaving
    an unexplained empty panel.

## TASK 4 — Refresh the recorder-template list

The list is fetched once on mount, so a template edited elsewhere shows stale sections.

  - Add an explicit refresh control beside the template picker, with the last-loaded
    time or a simple "Refreshed" acknowledgement.
  - Do NOT poll, and do NOT refetch on every render — the panel re-renders on every
    property change and this is a Firestore read.
  - After a refresh, re-evaluate the orphan warning from Task 2.

## CONSTRAINTS

- Do NOT change how an element with `sections`/`columns` ABSENT renders.
- Do NOT make the panel read anything other than the live template, and do NOT make the
  renderer read anything other than the pinned snapshot (ADR-005).
- Do NOT auto-remove orphaned ids without the author asking — one click, not automatic.
  An element may reference a section that returns when the template is edited back.
- Do NOT poll Firestore.
- Do NOT change the formula engine, record data, or anything outside the PDF builder
  and the record-table field semantics.
- Do NOT delete anything. Do NOT touch recorder-reserved/ or LIMS-New-Backup/.
- New markdown in docs/ (RULE 9). If unsure, ask (RULE 1, RULE 7).

## TESTS

  1. `sections: undefined` renders every section — the existing-template case
  2. `sections: []` renders nothing, and does NOT fall back to all
  3. Same two for `columns`
  4. Unchecking the last section leaves it unchecked — the reported bug
  5. Select all writes the explicit full list
  6. Deselect all writes []
  7. An orphaned section id produces a warning naming it, and the other sections show
     their correct checked state rather than all-unchecked
  8. Dropping orphans removes only the unknown ids
  9. The renderer still skips unknown ids without erroring
 10. Refresh refetches and re-evaluates the orphan warning

Run npm test and tsc --noEmit. Report both, with before and after counts.

## DEFINITION OF DONE

  1. Pre-work output, and the LIMS-New-Backup confirmation specifically
  2. Whether `getRecordTableColumns` conflated `[]` and `undefined`, and what you did
  3. Confirmation an element with the fields absent renders identically to before
  4. The orphan warning's exact wording, including the pinned-snapshot caveat
  5. Diff summary per file
  6. npm test and tsc output
  7. Anything unverified, stated as UNVERIFIED — say plainly whether you exercised the
     checkboxes in a browser, and list what the owner should check: deselect-all, the
     orphan warning on their actual template, and refresh after editing the recorder
     template in another tab
```

---

## What to check yourself first

Open the recorder template and confirm whether **Uncertainty Budgets is actually on the
live template** — not just on the certificate you rendered. The certificate comes from the
record's pinned snapshot, so the two can legitimately differ.

If it is on the live template, close and reopen the PDF builder: Task 4's stale-list
problem is then your cause, and reopening is the workaround until this ships.
