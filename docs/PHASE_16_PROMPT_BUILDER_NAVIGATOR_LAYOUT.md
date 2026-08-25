# Phase 16 — Builder navigator panel and landscape layout

## Model and effort

**Claude Sonnet 5 · Effort: High**

No new behaviour, no engine or schema changes — but it is a layout refactor of
`RecorderTemplateBuilderPage.tsx`, the file every recent phase has touched. High effort
because the risk is not writing the layout, it is preserving everything already wired
into it while moving it.

## RUN THIS AFTER PHASE 15

Phase 15 adds `unitMode` / `unit` / `unitChoices` inputs to the column editor — the exact
part of the markup this phase rearranges. Running them in the other order, or in
parallel, means resolving the same conflict twice. Do not start this until Phase 15 is
merged and its tests pass.

## Why this phase exists

The owner's own diagnosis: with several sections and many columns, the builder is a long
vertical scroll, and **finding and editing an existing section or column is confusing.**
There is no overview and no way to jump.

Two structural causes:

1. **No navigator.** Sections and their columns exist only as cards in one long list at
   `RecorderTemplateBuilderPage.tsx:512`. To check one column you scroll and read.
2. **Portrait stacking.** Columns within a section stack vertically (line 541,
   `space-y-2`), each as a full-width card. But a template column becomes a
   **spreadsheet column** — it renders left to right in the grid and the PDF. The
   builder is laid out at ninety degrees to the thing it builds, so an author cannot see
   their table's shape while editing it.

---

## Prompt

```
Read first:
  - CLAUDE.md — hard rules
  - src/pages/RecorderTemplateBuilderPage.tsx — ALL of it before changing any of it.
    This is a layout refactor; you cannot safely move markup you have not read.
  - src/services/recorderTemplateValidation.ts — the validation this page surfaces
  - docs/PHASE_15_PROMPT_COLUMN_UNITS.md and
    docs/PHASE_15_CORRECTION_UNIT_MODES.md — the unit inputs must survive the move
  - docs/PHASE_10_PROMPT_FORMULA_HELP.md Task 7 — the collapsed variable disclosure
    lives under each formula input and must keep working

## MANDATORY PRE-WORK (CLAUDE.md RULE 3/4/8)

    git branch
    git worktree list
    git status
    netstat -ano | grep ":5173"

Verify any dev server points at THIS directory. Pre-existing uncommitted work on this
branch is NOT yours. recorder-reserved/ is an archive. STOP and ask if anything differs.

Confirm Phase 15 is merged before starting. If the unit inputs are not present, STOP —
you are running out of order.

## TASK 1 — Inventory what must survive, and write it down first

Before moving any markup, list every interactive element currently in the sections and
columns area and what it is wired to. At minimum: section id/label inputs, reorder and
delete buttons, column id/label/type, the per-type panels (number format, choices,
formula, standard info), the Phase 15 unit inputs, the Phase 10 variable disclosure and
its cursor-insertion, Verify, and the mockup harness.

**Report this list before writing layout code.** A refactor that silently drops one
control is the failure mode here, and it will not show up in a type-check.

## TASK 2 — A navigator panel

A persistent left rail, roughly 200-240px, sticky so it does not scroll away:

  - A tree: each section, expandable to its columns
  - Each column entry shows its formula variable name (SECTIONID_COLUMNID) and type as
    secondary text — the author's real vocabulary, same principle as Phase 10 Task 7
  - Click a section or column to focus it in the main area
  - **Show a badge where validation has something to say**, per section and per column,
    from the existing recorderTemplateValidation.ts. Finding the broken field is the
    single most valuable thing this panel can do; a navigator that only navigates is
    worth much less.
  - Reorder from the panel if it is straightforward with the existing move handlers;
    otherwise leave reordering where it is and say so.

Do NOT add a second source of truth for structure. The panel renders from the same
draft state the editor uses.

## TASK 3 — Landscape layout for columns

Within the focused section, lay columns out LEFT TO RIGHT, in template order, so the
builder mirrors the table it produces.

  - Each column is a narrow card in a horizontal row, with a sensible min-width and
    horizontal scroll when they overflow. Do not let cards squeeze to unusable widths.
  - The focused column expands to show its full editor; the others stay compact,
    showing enough to recognise them (label, type, unit).
  - Keep an "all sections" view available. Some tasks need the whole template at once,
    and a focus-only UI would replace one navigation problem with another.
  - Custom Functions and Summary Fields currently occupy the right half of a two-column
    grid (line 499). With a left rail added, three columns will not fit. Move them to
    tabs, a collapsible region, or below the sections area — your call, but state which
    and why.

Remember the focused section and column for the session so the view does not reset on
every edit.

## CONSTRAINTS

- Do NOT change the template schema, validation rules, the formula engine, or any
  saved data shape. This phase moves markup and adds navigation. Nothing else.
- Do NOT drop or reimplement any existing control — see Task 1.
- Do NOT break the Phase 10 variable disclosure or its cursor insertion into the
  formula input.
- Do NOT break the Phase 15 unit inputs, including selectable unit lists.
- Do NOT hide validation errors behind a focus filter. An error in an unfocused section
  must still be discoverable — that is what the Task 2 badges are for.
- Do NOT delete anything. Do NOT touch recorder-reserved/ or pre-existing work.
- Keep it keyboard-navigable and keep the existing aria-labels; several tests query by
  them.
- New markdown in docs/ (RULE 9). If unsure, ask (RULE 1, RULE 7).

## TESTS

  1. Every control from the Task 1 inventory is still present and still wired
  2. Clicking a navigator entry focuses that section/column
  3. Validation badges appear on the section and column that actually have issues
  4. An error in an unfocused section is still reachable
  5. Columns render in template order left to right
  6. The Phase 10 disclosure still opens and still inserts at the cursor
  7. The Phase 15 unit inputs still round-trip, both fixed and selectable
  8. Existing tests that query by aria-label still pass UNCHANGED — if you must change
     one, say which and why

Run npm test and tsc --noEmit. Report both, with the before and after test counts.

## DEFINITION OF DONE

  1. Pre-work output, branch, and confirmation Phase 15 is merged
  2. The Task 1 inventory, and confirmation every item survived
  3. Diff summary per file
  4. Where Custom Functions and Summary Fields went, and why
  5. Any existing test you had to modify, with the reason
  6. Confirmation the schema, validation rules and engine are untouched
  7. npm test and tsc output
  8. Anything unverified, stated as UNVERIFIED — in particular say plainly whether you
     saw the new layout in a browser, since this is a phase whose whole point is visual
```

---

## One thing I would not do

Do not make focus mode the only mode. The owner's problem is finding things in a long
list; a UI that shows one section at a time solves that and creates the opposite
problem — no way to compare two sections, or to see the whole table's shape before
publishing. The navigator plus an "all sections" escape hatch keeps both.
