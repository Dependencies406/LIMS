# Phase 28 — Author-chosen overflow handling for record tables

## Model and effort

**Claude Sonnet 5 · Effort: High**

Small feature, one real hazard: **wrap changes row heights, and row heights drive
pagination.** Phase 27 established that `measureRecordTableHeights` and the draw pass must
compute identically or a paginated table slices against heights that don't match what gets
drawn. This phase adds a setting that changes those heights — so it lands squarely on that
seam.

## Context for a fresh session

Standalone task. Read the files named below; no prior conversation needed.

**Phase 27 (already shipped) built the current ladder** in
`src/services/pdf-renderers/renderRecordTable.ts`:

1. Natural-width proportional distribution when columns fit
2. A **36pt minimum column width** floor when they don't
3. **Font shrink** toward a **6pt floor** (`shrinkFontToFit`, solved algebraically)
4. **Ellipsis truncation** (`resolveDegradedText` / `truncateWithEllipsis`)

`layoutTextToLines` (`pdfTextLayoutService.ts:72`) is correct and **must not be modified**.
Its character-by-character split is a correct response to an impossible column; the fix is
never handing it an impossible column.

`computeRecordTableLayout` and `resolveDegradedText` are **shared** between the draw pass
(`renderRecordTable.ts`) and the measure pass (`pdfTemplateRenderer.ts:1315`), both run
against `record.rows` — the full, unsliced set — so every continuation page gets identical
widths and fonts. **Preserve that.**

**Repository note:** `LIMS-New-Backup` exists **nested inside** the project at
`C:\Users\seela\Desktop\LIMS-New\LIMS-New-Backup\` with its own `package.json`. A previous
session searched only for a sibling and wrongly reported it absent. Never modify it
(RULE 2, RULE 6).

## Owner decisions, settled 2026-08-21

- **Per element, not per column.** One setting for the whole table. Per-section control is
  already achievable by splitting into multiple elements via Phase 27's `sections` field.
- **Wrap is capped by an author-set max lines, then ellipsis.**
- **Font shrink still runs first.** The author's choice governs the last resort, not the
  whole ladder.
- **The 36pt minimum stands.** Below it, warn and let the table overflow rather than
  producing character-per-line output.

---

## Prompt

```
Read first:
  - CLAUDE.md — hard rules
  - docs/PHASE_28_PROMPT_TABLE_OVERFLOW_STRATEGY.md — this file, including the decisions
  - docs/PHASE_27_PROMPT_RECORD_TABLE_SECTIONS_AND_WIDTHS.md — what already exists
  - docs/adr/ADR-004-pdf-record-table-band.md — including its revision note
  - src/services/pdf-renderers/renderRecordTable.ts — ALL of it, especially
    computeRecordTableLayout, resolveDegradedText, truncateWithEllipsis, shrinkFontToFit
  - src/services/pdfTemplateRenderer.ts around line 1315 — measureRecordTableHeights,
    which shares the layout functions with the draw pass
  - src/services/pdfTextLayoutService.ts — read layoutTextToLines, then leave it alone
  - src/modules/pdf-template-builder/types.ts:302 — RecordTableElement
  - src/modules/pdf-template-builder/components/ElementPropertiesPanel.tsx — the
    record-table block, including Phase 27's section checklist and fit warning

## MANDATORY PRE-WORK (CLAUDE.md RULE 3/4/8)

    git branch
    git worktree list
    git status
    Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
      Select-Object ProcessId, CommandLine | Format-List

Report each FULL path; confirm none runs from LIMS-New-Backup (nested INSIDE the project).

## TASK 1 — The setting

Add to `RecordTableElement`:

    overflowMode?: 'ellipsis' | 'wrap' | 'shrink-only'
    maxWrapLines?: number

  - Default `overflowMode` is **`'ellipsis'`** — today's behaviour. Existing templates
    must render byte-identically with the field absent. Add a test asserting that.
  - `maxWrapLines` applies only in wrap mode. Default 3. Enforce a sane range and say
    what you chose.
  - Document the semantics in the type's doc comment, including the ladder below.

### The ladder, after this phase

    1. Proportional widths (Phase 27)
    2. 36pt minimum column width floor (Phase 27)
    3. Font shrink toward the 6pt floor (Phase 27) — ALWAYS, in every mode
    4. Then, whatever still overflows:
         'ellipsis'     -> truncate with … on one line          (current behaviour)
         'wrap'         -> wrap up to maxWrapLines, then …       (new)
         'shrink-only'  -> nothing further; text may overflow the cell visibly
    5. If a column would fall below 36pt: keep 36pt, let the table exceed the element
       width, and warn at authoring time. NEVER produce character-per-line output.

Step 3 running in every mode is the owner's explicit decision: shrink often makes text
fit with no loss at all, so it should not be skippable.

## TASK 2 — Wrap without breaking pagination — THE RISK

Wrap changes row heights. `measureRecordTableHeights` drives `computeTableRowSlices`.

  - The wrap decision MUST flow through the SAME shared functions the draw pass uses.
    Do not add a second implementation in the measure pass — Phase 27 deliberately
    collapsed those into one, and its doc comment says so.
  - Row heights must be computed from the record's FULL row set, as now, so continuation
    pages keep identical layout.
  - Test a paginated table in wrap mode: assert the measured height for a given row
    equals what the draw pass produces for that same row.

**If a single wrapped row is taller than the available page height**, that row cannot be
placed. Report what the current pagination does in that case — do not silently produce an
infinite loop or a clipped row. If it is unhandled today, say so and propose a fix rather
than implementing one unasked.

## TASK 3 — Properties panel

  - A mode selector (Ellipsis / Wrap / Shrink only) with one line of plain explanation
    each. `maxWrapLines` shown only in wrap mode.
  - Extend Phase 27's existing fit warning rather than adding a second banner: when the
    selection would push columns below 36pt, say so, and say that the chosen mode cannot
    rescue it — the fix is fewer sections or a wider element.
  - In wrap mode, if the estimate suggests rows will exceed maxWrapLines and truncate
    anyway, say that too. An author choosing wrap expects nothing to be lost.

## CONSTRAINTS

- Do NOT modify layoutTextToLines or the wrapping algorithm.
- Do NOT let a column render below 36pt.
- Do NOT skip font shrink in any mode.
- Do NOT duplicate layout logic between measure and draw — one shared implementation.
- Do NOT compute layout from a row slice; the full row set only.
- Do NOT change the default behaviour of existing templates.
- Do NOT touch record data, the formula engine, or anything outside the PDF path.
- Do NOT delete anything. Do NOT touch recorder-reserved/ or LIMS-New-Backup/.
- New markdown in docs/ (RULE 9). If unsure, ask (RULE 1, RULE 7).

## TESTS

  1. An element with no `overflowMode` renders exactly as before this phase
  2. Ellipsis mode matches Phase 27's current output
  3. Wrap mode produces multiple lines and taller rows for long text
  4. Wrap mode truncates with … once maxWrapLines is exceeded
  5. shrink-only mode neither wraps nor truncates
  6. Font shrink still runs in all three modes — assert the effective font size
  7. No mode ever produces single-character lines, including at the 36pt minimum
  8. PAGINATION: measured row height equals drawn row height in wrap mode, for a
     paginated table — the regression test for this phase's main risk
  9. Continuation pages use identical widths and fonts to page 1
 10. The panel warning appears for below-minimum columns, and for wrap-will-truncate

Run npm test and tsc --noEmit. Report both, with before and after counts.
Baseline is 1446 tests across 75 files.

## DEFINITION OF DONE

  1. Pre-work output, and the LIMS-New-Backup confirmation specifically
  2. The maxWrapLines default and permitted range, with reasoning
  3. Confirmation the wrap decision flows through the SHARED measure/draw functions,
     naming where
  4. What happens when one wrapped row exceeds a page — reported, not silently changed
  5. Confirmation layoutTextToLines is unmodified
  6. Confirmation an element without overflowMode is byte-identical to before
  7. Diff summary per file
  8. npm test and tsc output
  9. Anything unverified, stated as UNVERIFIED — this is visual, so list what the owner
     must check: each of the three modes, a wrap table that paginates, and one
     deliberately too-narrow table
```

---

## What per-element costs you, and the workaround

One setting per table means a table mixing a long Remarks column with 5-decimal numeric
columns gets one strategy for both.

Phase 27's `sections` field is the escape hatch: split that table into one element per
section, stacked down the page, each with its own overflow mode. You get per-section
control without per-column settings, and narrower elements mean fewer columns competing
for width — which is the same move that fixed the original bug.

If per-column turns out to be necessary later, `overflowMode` on the element becomes the
default and a column-level override slots in beside it without a schema break.
