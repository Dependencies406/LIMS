# Phase 9 — Re-lay-out the Environment Block to match the lab's worksheet

**Model: Claude Sonnet 5 · Effort: Medium**

Presentation-only change to one component. No logic, no schema, no validation.

## Background

The owner is a calibration physicist and has been recording environmental
conditions on an Excel worksheet for years. The on-screen block should match that
familiar layout, so staff aren't re-learning a form they already know.

**Current layout** (`EnvironmentBlock.tsx`) — rounds run DOWN as rows:

```
| Round | Temperature (°C) | Relative Humidity (%) |
|   1   |     [input]      |       [input]         |
|   2   |     [input]      |       [input]         |
|   3   |     [input]      |       [input]         |
```

**Target layout** — rounds run ACROSS as columns, which is the transpose:

```
Environment Condition:              | Round            |  1   |  2   |  3   |
(Must filled before record the data)| Temperature (°C) | 24.2 | 24.7 | 24.5 |
                                    | %RH              |  57  |  57  |  57  |
```

Details from the owner's worksheet:

- A label block sits to the **left of the table**, outside it:
  - `Environment Condition:` — bold, dark
  - `(Must filled before record the data)` — **red**, smaller, directly beneath.
    Keep this wording verbatim; it is what staff already read on the paper form.
- Three table rows: **Round**, **Temperature (°C)**, **%RH**
- Row-label cells (left column of the table) have a light grey fill and are bold
- The `Round` number cells (1, 2, 3 …) are grey headers, centred
- **Input cells are filled YELLOW** — the lab's long-standing convention for "a
  human must type here"
- Every cell is bordered, spreadsheet-style. Values centred.
- Note the shorter label: **`%RH`**, not "Relative Humidity (%)". Match the owner's
  wording.

## MANDATORY PRE-WORK (CLAUDE.md RULE 3/4/8)

Run and report:

```
git branch
git worktree list
git status
netstat -ano | grep ":5173"
```

If a dev server is running, verify its command line points at THIS directory.
There is a large amount of pre-existing uncommitted work on this branch that is not
yours — including recent edits to `RecorderTemplateBuilderPage.tsx`. LEAVE IT ALONE.
`recorder-reserved/` is an archive — do not modify, import from, or delete it.

STOP and ask if anything differs.

## SCOPE

`src/modules/recorder/components/EnvironmentBlock.tsx` — the JSX only.

### Task 1: Transpose the table

Build 3 rows × (`roundCount` + 1) columns, per the target above.

**Keep every piece of existing behaviour exactly as-is:**

- the `EnvironmentBlockProps` interface — do not change its shape
- `buildEnvironmentDrafts` / `buildEnvironmentFromDrafts` / `isEnvironmentComplete`
  from `recordEnvironment.ts` — do not modify that service
- the `drafts` state and `handleFieldChange` handler
- `isReadOnly` disabling every input
- `roundCount === 0` returning `null`
- the `aria-label` on every input (`Round N temperature` / `Round N relative
  humidity`) — these are what the tests and screen readers use

### Task 2: Yellow input cells

Inputs get a yellow background (`bg-yellow-100` or similar) when editable, falling
back to grey when `isReadOnly`.

**This is an affordance, not an error state** — it means "type here", and an empty
yellow cell is self-evidently unfilled.

Note how well this fits ADR-010, which requires `awaiting-input` to look *quiet*
and `invalid-computation` to look *prominent*. Yellow gives a genuine third state:
yellow = needs input (expected, calm), red = something is wrong. That is better
than the two-state scheme ADR-010 assumed, and worth keeping consistent.

### Task 3: Spreadsheet-style presentation

- Borders on every cell (`border border-gray-300` on `td`/`th`, `border-collapse`)
- Row-label column: light grey fill, bold, right-aligned or centred, non-wrapping
- Round-number header cells: grey fill, bold, centred
- Input text centred; number inputs should not show browser spinner arrows
  (`appearance-none` plus the webkit spin-button rule) — spinners look wrong in a
  spreadsheet cell
- The table should size to its content, not stretch to full width

### Task 4: Handle a high round count

Transposing means column count grows with `roundCount`. A template with, say, 10
rounds gives 11 columns. Wrap the table in a horizontally scrollable container so it
degrades gracefully instead of overflowing the page. Verify at `roundCount` = 1, 3,
and 10.

### Task 5: Keep the progress indicator, subordinate to the layout

The current header shows `Required before commit — X of N round(s) recorded` when
incomplete. Keep that information, but place it so it does not disturb the worksheet
look — e.g. small text under the red notice in the left label block, visible only
while incomplete.

If you think it is now redundant given the yellow empty cells, say so and ask before
removing it. Do not remove it silently.

## CONSTRAINTS

- **Presentation only.** No changes to `recordEnvironment.ts`, to the props
  interface, to state shape, or to validation.
- Do NOT change what makes a round "complete" — `commitRecord` rejects a record
  whose `environment.length !== roundCount`, and a round only enters that array once
  both fields are filled. That coupling is deliberate (ADR-006); leave it alone.
- Do NOT delete anything. Do NOT touch `recorder-reserved/` or other pre-existing
  uncommitted work.
- Keep every `aria-label` intact.
- New markdown goes in `docs/` (RULE 9).
- If unsure, say so and ask (RULE 1, RULE 7).

## TESTS

Check whether tests exist for this component and update them if the DOM structure
they query has changed. Add or extend coverage for:

- 3 rows render, and `roundCount` + 1 columns
- typing in a temperature cell calls `onChange` with the right `roundIndex`
- `isReadOnly` disables every input
- `roundCount` = 0 renders nothing
- `roundCount` = 10 still renders all 11 columns

Run `npx tsc --noEmit` and `npm test`. Report both.

**Note:** a previous session could not run `tsc` (its sandbox failed to start), so
uncommitted edits to `RecorderTemplateBuilderPage.tsx` are structurally reviewed but
never compiled. Your type-check covers those too — if it reports an error there,
fix it and say so.

## DEFINITION OF DONE

1. Pre-work output and branch
2. Diff summary for the file
3. `npx tsc --noEmit` and `npm test` output — state whether the pre-existing
   uncommitted edits compiled cleanly
4. Confirmation that `recordEnvironment.ts`, the props interface, and all
   `aria-label`s are unchanged
5. How it looks at `roundCount` = 1, 3, and 10
6. Anything unverified, stated as UNVERIFIED — in particular, say plainly if you
   could not view it rendered in a browser

## Follow-up worth raising with the owner

The yellow-means-type-here convention probably belongs on the **recording grid's
input columns** too, not just here — same worksheet, same expectation. Formula
columns are read-only and should stay unfilled/white so the difference between
"you fill this" and "the system fills this" is visible at a glance.

Do not implement that in this phase. Mention it in your report and let the owner
decide.
