# Phase 22 — Grid legibility: column roles, section banding, blank-row trim

## Model and effort

**Claude Sonnet 5 · Effort: Medium**

Three visual changes plus one data change. No engine, no schema, no arithmetic. Medium
rather than Low because Task 3 mutates stored records and Task 4 touches the same mount
path Phases 19-21 all guard.

## Before starting: confirm the browser is running current code

Phases 20 and 21 both landed real changes that the owner could not see. That is
CLAUDE.md's mistake #1. There is a second runnable copy of this app at
`LIMS-New-Backup/package.json`, and because `LIMS-New-Backup` **contains the string
`LIMS-New`**, a naive "does the command line mention the project path" check passes for
it. Every prior session's confirmation may have been a false positive.

So the pre-work check below is stricter than usual: report the FULL path, and state
explicitly whether it ends in `LIMS-New` or `LIMS-New-Backup`.

## Owner decisions, settled 2026-08-17

- **Sections:** visual banding within one sheet, plus section-jump navigation. NOT
  separate sheets — sections share a row axis and splitting them risks misaligning a
  calibration point from its own results.
- **Blank rows:** trim on open, draft-only, with an undo path.
- **Column roles:** tinted cells from mount plus a header marker.

---

## Prompt

```
Read first:
  - CLAUDE.md — hard rules, especially RULE 3 and RULE 8
  - docs/PHASE_22_PROMPT_GRID_LEGIBILITY.md — this file, including the decisions above
  - src/modules/recorder/components/RecordingGrid.tsx — applyLayout, the mount effect,
    and the Phase 19 guards
  - src/services/recordingGridDocument.ts — buildGridDocument, lockedRanges (~line 563)
  - src/services/calibrationRecordService.ts — DRAFT_STARTING_ROW_CAP (line 74),
    createDraftRecord (~line 448), updateDraftRecord
  - docs/PHASE_19_PROMPT_FIX_GRID_FEEDBACK_LOOP.md — the guards you must not weaken
  - docs/adr/ADR-005-record-lifecycle.md — why a committed record must never change

## MANDATORY PRE-WORK — STRICTER THAN USUAL (CLAUDE.md RULE 3)

    git branch
    git worktree list
    git status

Then, for EVERY node process:

    Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
      Select-Object ProcessId, CommandLine | Format-List
    netstat -ano | findstr LISTENING | findstr ":517"

REPORT the full command line of each. State explicitly, for each, whether its working
directory is `...\LIMS-New` or `...\LIMS-New-Backup`. If ANY dev server is running from
the backup, or if more than one is listening, STOP and report before touching a file.

`LIMS-New-Backup` is not yours to modify, move or delete (RULE 2, RULE 6). Only identify
it.

## TASK 1 — Show which columns are typed into and which are calculated

Today `applyLayout` applies only `{ locked: true }` to `doc.lockedRanges` — behavioural,
not visual — and `COMPUTED_CELL_STYLE` is applied later, per cell, only for rows that
already have results. So an empty draft looks uniform, and a technician cannot tell where
to type.

Style by column ROLE, at mount, for every data row:

  - Input columns (text, number, selection): a pale yellow fill, matching the convention
    the lab's own Excel worksheet already uses for technician entry
  - Formula columns: a neutral grey fill, visually recessed
  - The `standard` picker column: distinct from both, since it is chosen rather than typed
  - Header row: a small marker distinguishing calculated columns — a symbol or weight
    change, not colour alone

Apply this from `buildGridDocument` (extend the existing `lockedRanges` idea into a
role-keyed style map) so the grid and any future renderer share one definition of role
styling. Do not scatter fill colours across call sites.

Keep the existing `INVALID_COMPUTATION_STYLE` and `CONVERSION_FAILURE_STYLE` winning over
the base role style — an error must never be hidden by a role tint. State how you ordered
them.

## TASK 2 — Band the sections, and let the user jump between them

  - Each section's merged header cell gets its own background tint, cycling through a
    small palette so adjacent sections differ. Keep text contrast readable; this is
    behind data a metrologist reads.
  - A heavier vertical border at each section boundary, so where one section ends is
    visible while scrolling horizontally.
  - A section-jump control above the grid: one button per section, scrolling the sheet to
    that section's first column. TREB's `ScrollTo` is public — verify its signature in
    the .d.ts before using it, and report what you found.

Freeze panes from Phase 20 must keep working — jumping must not scroll the frozen header
rows out of view. Test that combination explicitly; it is the one that breaks.

Do NOT add sheets. Do NOT split sections across sheets (owner decision above).

## TASK 3 — Trim blank rows when a draft opens

Existing records hold blank rows created before `DRAFT_STARTING_ROW_CAP` existed. The
grid now faithfully shows all of them.

  - On opening a DRAFT, drop trailing wholly-empty rows down to the last row containing
    data, with a minimum of 1 row.
  - "Wholly empty" means every INPUT column is null/blank — reuse Phase 21's `isRowEmpty`
    rather than writing a second definition.
  - Only trailing rows. A blank row BETWEEN two rows with data is deliberate spacing or a
    skipped point; leave it.
  - **Draft only.** A committed, reviewed or approved record must never be modified
    (ADR-005). Gate on status and add a test proving a committed record is untouched.
  - Persist via the existing `updateDraftRecord`. Do not add a second write path.
  - **Undo path:** tell the user what happened and let them put the rows back — a brief
    notice with an action that re-adds the trimmed count, or an explicit undo. Silently
    deleting rows from someone's record is not acceptable even when they are empty.

## TASK 4 — Keep the Phase 19 guards intact

Every write this phase adds — role styling, banding, the trim's grid update — goes inside
the existing `isProgrammaticWriteRef` try/finally, and inside `Batch` where a sibling
write already uses it.

Re-run RecordingGrid.test.tsx unchanged, and repeat the break-and-revert: disable both
guards, confirm the loop tests still fail, restore. A styling change that quietly made
those tests vacuous would hide the freeze returning.

## CONSTRAINTS

- Do NOT weaken, reorder or bypass Phase 19's guards.
- Do NOT add sheets or split sections across sheets.
- Do NOT modify a record that is not a draft (ADR-005).
- Do NOT trim blank rows between populated rows.
- Do NOT change the formula engine, evaluator, schema, or any computed value.
- Do NOT let a role tint hide an error style.
- Do NOT reach into TREB internals — ScrollTo, Freeze, ApplyStyle, Batch are public.
- Do NOT delete anything. Do NOT touch recorder-reserved/ or LIMS-New-Backup/.
- New markdown in docs/ (RULE 9). If unsure, ask (RULE 1, RULE 7).

## TESTS

  1. Input, formula and standard columns each get their distinct role style at mount,
     with NO rows populated — the empty-draft case that motivated this
  2. An invalid-computation cell keeps its error style, not the role tint
  3. A conversion-failure cell likewise
  4. Adjacent sections get different header tints
  5. Section jump scrolls to the right column and leaves frozen headers visible
  6. Trailing blank rows are trimmed on opening a draft; a blank row between populated
     rows is NOT
  7. A committed record is never trimmed
  8. The trim persists through updateDraftRecord and the undo restores the count
  9. Every Phase 19 RecordingGrid test passes UNCHANGED, and the break-and-revert still
     fails the loop tests when guards are disabled

Run npm test and tsc --noEmit. Report both, with before and after counts.
Baseline is 67 files / 1217 tests.

## DEFINITION OF DONE

  1. Pre-work — including the FULL path of every node process and whether any runs from
     LIMS-New-Backup
  2. Diff summary per file
  3. The role-style precedence order (role vs invalid-computation vs conversion-failure)
  4. ScrollTo's actual signature, from the .d.ts
  5. Confirmation the trim is draft-only and where that is enforced
  6. Confirmation Phase 19's guards hold, with the break-and-revert result
  7. npm test and tsc output
  8. Anything unverified, stated as UNVERIFIED. This phase is entirely visual — if you
     did not see it in a browser, say so, and list exactly what the owner must check:
     yellow input cells, grey formula cells, section tints, jump behaviour with frozen
     headers, and the trim notice.
```

---

## One thing to check yourself before running this

Does your template have any **summary fields**? `RecordingGrid.tsx:491` sets
`tab_bar: template.summaryFields.length > 0`, so with none there is deliberately no tab
bar. If your template does have them and no tab bar appears, the browser is running stale
code and the pre-work check above is the whole story.
