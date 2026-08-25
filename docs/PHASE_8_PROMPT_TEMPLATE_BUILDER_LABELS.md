# Phase 8 — Label the remaining Template Builder fields

**Model: Claude Sonnet 5 · Effort: Medium**

Small, self-contained UI fix. No logic, no schema, no rules.

## Background — what the owner reported

Building a real template for the first time, the owner could not tell what several
input boxes were for. They appear as unlabelled blanks. Two causes:

1. **Every field is identified only by placeholder text**, which disappears the
   moment anything is typed into it. A filled field becomes anonymous.
2. **Fields with `flex-1` and no minimum width collapse** to a few pixels when the
   panel is narrow — hiding both the placeholder and any content. The owner
   described one as a "tiny blank box" and had to ask what it was.

## ⚠ PART OF THIS IS ALREADY DONE — read before editing

`src/pages/RecorderTemplateBuilderPage.tsx` has **already been edited** for the
Sections and Columns panel (left side). Those changes are uncommitted working-tree
changes. **Do not redo, revert, or restyle them** — match their pattern instead.

Already fixed (roughly lines 356–498):

- Section ID / Display label — labelled, `min-w-[140px]` on the label field
- Column ID / Display label / Type — labelled, `min-w-[120px]`
- Number columns: Notation / Decimals / Preset value — labelled, `min-w-[160px]`
- Text, selection and formula column bodies — labelled
- Required fields marked with a red asterisk
- `title` tooltips added, including one that builds the live variable name

The established pattern to copy exactly:

```tsx
<div className="flex-shrink-0">            {/* or flex-1 min-w-[Npx] */}
  <label className="block text-[10px] font-medium text-gray-500 mb-0.5">
    Field name <span className="text-red-500">*</span>
    <span className="ml-1 font-normal text-gray-400">(hint)</span>
  </label>
  <input ... className="input text-xs w-full" title="Longer explanation." />
</div>
```

Note the container row uses `items-end` (not `items-center`) so labelled and
unlabelled controls align on their baselines, and buttons in those rows carry
`pb-1` to line up with the inputs.

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
yours — including the Sections/Columns edits described above. LEAVE ALL OF IT ALONE.
`recorder-reserved/` is an archive — do not modify, import from, or delete it.

STOP and ask if anything differs from the above.

## SCOPE — one file, presentation only

`src/pages/RecorderTemplateBuilderPage.tsx`, the **right-hand panel only**
(currently around lines 502–576).

### Task 1: Custom Functions panel (~lines 513–536)

Currently rendered as pseudo-code with bare `def`, `(`, `):`, `return` markers and
three unlabelled inputs:

| Input | Current placeholder | Needs |
|---|---|---|
| `fn.name` (`w-28`) | `name` | Label **"Function name"**, required asterisk |
| `fn.params` (`flex-1`, **no min-width — collapses**) | `params, comma separated` | Label **"Parameters"** + hint "separate with commas", `min-w-[140px]` |
| `fn.expression` (`flex-1`) | `expression` | Label **"Returns"** + hint "one expression", `min-w-[200px]` |

Keep the `def` / `(` / `):` / `return` decoration — it usefully shows the shape of
a Python function. But it must not be the *only* indication of what each box is.

Tooltips to add, drawn from `docs/FORMULA_GRAMMAR.md`:

- Function name — "Must not clash with a builtin (ROUND, MAX, …), a column
  aggregate (col_mean, …), an existing column reference, or another custom
  function. Cannot start with ENV_ or SUMMARY_."
- Parameters — "The function's only inputs. A function body cannot read columns,
  ENV_ or SUMMARY_ values directly — pass them in as arguments."
- Returns — "A single expression. May call builtins and other custom functions.
  No loops, no variables, no if/else blocks (the `a if cond else b` form is
  allowed)."

### Task 2: Summary Fields panel (~lines 550–573)

| Input | Current placeholder | Needs |
|---|---|---|
| `field.id` (`w-24`) | `ID` | Label **"Field ID"**, required asterisk |
| `field.label` (`flex-1`, **no min-width**) | `Label` | Label **"Display label"**, `min-w-[120px]` |
| `field.type` (`w-20`) | — | Label **"Type"** |
| `field.expression` (`w-full`) | `expression, e.g. col_max(CAL_ERR)` | Label **"Formula"**, required asterisk |

Keep the `SUMMARY_` prefix marker before the ID input — it shows how the field is
referenced.

Tooltips:

- Field ID — "Referenced elsewhere as SUMMARY_<id>, and bindable into the PDF."
- Formula — "Calculated once per record, after all rows. This is the only place
  column aggregates (col_mean, col_max, col_stdev, …) may be used, and their
  argument must be a bare column name."

### Task 3: Sweep for any other collapsing field in this file

Search the whole file for `flex-1` on an `input` or `select` with no accompanying
`min-w-[...]`. Each one is a field that can collapse to invisibility on a narrow
panel. Add a sensible minimum to any you find, and report the list.

## CONSTRAINTS

- **Presentation only.** Do not change any `onChange` handler, any state shape, any
  validation, or anything in `src/types/index.ts`.
- Do NOT touch the already-fixed Sections/Columns panel except to keep styling
  consistent.
- Do NOT touch `MockupHarness` (bottom of the same file) unless Task 3 finds a
  collapsing field in it — if so, fix only that.
- Do NOT alter `recorderTemplateValidation.ts`. Marking a field required in the UI
  is a visual hint; the real enforcement already lives in the verifier and must stay
  the single source of truth.
- Do NOT delete anything. Do NOT touch `recorder-reserved/` or other pre-existing
  uncommitted work.
- New markdown goes in `docs/` (RULE 9).
- If unsure, say so and ask (RULE 1, RULE 7).

## VERIFICATION

`npx tsc --noEmit` must be clean, and `npm test` must still pass (569 tests
expected — there are no tests for this page, so the count should not change).

**The previous session could not run `tsc`** because its Linux sandbox failed to
start, so the already-made Sections/Columns edits are **structurally reviewed but
not compiled**. Your type-check therefore covers those too. If it reports an error
in the section/column region, that is from the earlier edit — fix it and say so.

## DEFINITION OF DONE

1. Pre-work output and branch
2. Confirmation you read the existing Sections/Columns edits and matched their pattern
3. Diff summary for the one file
4. The list of collapsing `flex-1` fields found in Task 3, and what minimum you gave each
5. `npx tsc --noEmit` and `npm test` output — explicitly state whether the
   pre-existing uncommitted edits compiled cleanly
6. Confirmation that no handler, type, or validation logic was changed
7. Anything unverified, stated as UNVERIFIED

## Why this is worth doing properly

The owner is a calibration physicist, not a programmer, and is the person who will
author every template in this system. A field they cannot identify is a field they
will either leave blank or fill wrongly — and Section ID and Column ID feed directly
into formula variable names, so getting those wrong produces a template that fails
verification for reasons that are not obvious from the screen.
