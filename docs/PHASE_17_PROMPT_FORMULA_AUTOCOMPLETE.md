# Phase 17 — Formula autocomplete in the template builder

## Model and effort

**Claude Sonnet 5 · Effort: Medium**

No engine, grammar, schema or arithmetic changes. The suggestion logic is pure and
testable; the fiddly part is keyboard interaction and getting the **context rules**
right, and both are covered by tests rather than judgement.

Medium rather than High because Phase 10 already built every data source this needs.
This phase wires them to the caret. If you find yourself writing a new list of function
or variable names, you have taken a wrong turn.

## Why this phase exists

Phase 10 gave the builder a Help modal and a collapsed variable disclosure. Both are
**lookup** — the author must stop typing, decide what to search for, read, and come
back. That is the right tool for "what does TINV do" and the wrong one for "I am
half-way through a formula and cannot remember whether it is `col_mean` or `COL_MEAN`".

Autocomplete answers at the caret, in context, without leaving the field. It also does
something no document can: it can decline to suggest names that are **illegal in the
position the caret is in**, so the author never types something Verify will reject.

---

## Prompt

```
Read first, in order:
  - CLAUDE.md — hard rules
  - src/modules/recorder/formula/validator.ts — the header comment's 9 numbered rules.
    Rules 4 and 9 are the ones autocomplete must honour. Read resolveExpression.
  - src/services/formulaVariableList.ts — buildRowFormulaVariables /
    buildSummaryFormulaVariables already return grouped { name, title, disabled }
  - src/modules/recorder/formula/builtinDocs.ts — BUILTIN_DOCS / AGGREGATE_DOCS
  - src/modules/recorder/formula/builtins.ts — BUILTIN_FUNCTIONS, COLUMN_AGGREGATES,
    describeArity
  - src/components/FormulaVariableDisclosure.tsx — the existing insert-at-caret path
  - src/pages/RecorderTemplateBuilderPage.tsx — insertAtCursor, and the three inputs
    this applies to

## MANDATORY PRE-WORK (CLAUDE.md RULE 3/4/8)

    git branch
    git worktree list
    git status
    netstat -ano | grep ":5173"

Verify any dev server points at THIS directory. Pre-existing uncommitted work on this
branch is NOT yours. recorder-reserved/ is an archive. STOP and ask if anything differs.

If Phase 16 has reflowed the builder's layout, work with whatever layout you find —
do not revert it.

## TASK 1 — One pure suggestion module, sourced from what already exists

Create a pure module — suggested `src/services/formulaSuggestions.ts` — that takes the
expression text, the caret offset, and the context, and returns the ranked candidates.
No React, no DOM. All the interesting rules live here so they can be tested directly.

Sources, all existing. Do NOT retype any of these lists:

  - Variables: buildRowFormulaVariables / buildSummaryFormulaVariables
  - Built-in functions: BUILTIN_FUNCTIONS, with prose from BUILTIN_DOCS and arity from
    describeArity() at render time
  - Column aggregates: COLUMN_AGGREGATES + AGGREGATE_DOCS
  - The template's OWN custom functions, from the draft's customFunctions — an author's
    `def` is exactly the kind of name they will not remember, and no help document
    lists them because they are per-template

Each candidate carries: the name, a kind ('variable' | 'builtin' | 'aggregate' |
'custom' | 'param'), a one-line description, and for functions its signature.

## TASK 2 — Context rules: never suggest what Verify will reject

This is the task that makes autocomplete worth more than the help file. The validator
already enforces all of this; mirror it, do not re-invent it, and cite the rule you are
mirroring in a comment.

  - **Row formula:** columns, ENV_*, STD_*, REPORT_TO_N, builtins, custom functions.
    NOT SUMMARY_*, NOT column aggregates (validator rule 4 — they are summary-only).
  - **Summary field:** columns, ENV_*, REPORT_TO_N, SUMMARY_*, column aggregates,
    builtins, custom functions. NOT STD_* (row-scoped — it has no value in a summary
    field).
  - **Inside a custom function body:** ONLY that function's own parameters, builtins,
    and other custom functions. NOT columns, NOT ENV_*, NOT STD_*, NOT SUMMARY_*.
    This is validator rule 9 and `insideFunctionBody`. Suggesting a column here would
    actively mislead — the author would type a name that cannot resolve.
  - **The formula column's own name is never offered as insertable.**
    buildRowFormulaVariables already marks it `disabled`; keep it visible but
    unselectable, with the reason, so the author learns why rather than wondering where
    it went.
  - **Immediately after `col_mean(` or any other aggregate's open paren:** suggest bare
    column names only. The argument must be a bare column name — `col_mean(CAL_IND)`
    is legal, `col_mean(CAL_IND * 2)` is not.

If you find a case where the validator's behaviour and this list disagree, STOP and
report it. The validator is authoritative; this list was written from reading it and
could be wrong.

## TASK 3 — The popup

Attach to all three formula inputs: the column formula, the summary field expression,
and the custom function expression. The third one is where the params-only rule applies.

### RENDER THE POPUP IN A PORTAL — this is not optional

Phase 16 moved the column editor inside a horizontally scrolling row:
`RecorderTemplateBuilderPage.tsx:696` is `flex items-start gap-2 overflow-x-auto`, and
the column formula input plus its Phase 10 disclosure now live inside it.

Per CSS, when one axis is `visible` and the other is not, `visible` computes to `auto` —
so that container clips vertically as well as horizontally. **An absolutely-positioned
popup inside it will be cut off, or will trigger a nested scrollbar.**

Therefore:

  - Render the suggestion list through a portal to document.body, positioned against the
    input's bounding rect. Do not rely on `position: absolute` within the card.
  - Reposition on scroll and resize, including scroll of that horizontal container.
  - Verify the popup is fully visible for the LAST column in a wide section — the case
    where the container is scrolled right and the card is near the viewport edge. Flip
    the popup's alignment if it would overflow the viewport.

While you are there, check whether Phase 10's `FormulaVariableDisclosure` (line 942) is
itself being clipped when expanded inside that same container. If it is, report it —
that is a Phase 16 regression no test would have caught, because RTL does not compute
layout. Fix it only if the fix is contained; otherwise report it and leave it.

  - Trigger on the identifier token under the caret. Match prefix first, then substring;
    case-insensitive matching, but insert the canonical casing — `col_mean` not
    `COL_MEAN`, `ROUND` not `round`.
  - Show name, kind, and the one-line description. For functions show the signature
    from describeArity() — the thing a help file cannot put next to your caret.
  - Accepting a FUNCTION inserts `NAME(` and leaves the caret inside the parentheses.
    Accepting a VARIABLE inserts the name. Reuse the existing insertAtCursor rather
    than writing a second caret path.
  - Keyboard: Up/Down move, Enter or Tab accept, Escape dismisses. **When the popup is
    closed, Enter must behave exactly as it does today** — do not swallow it and do not
    break form submission.
  - Dismiss on blur and on caret movement away from the token.
  - Cap the visible list and make it scrollable; the variable list on a large template
    is long.
  - Mouse click also accepts.

### While the caret is inside a function's parentheses

Show that function's signature as a hint — name, parameters, and arity from
describeArity(). This is the single most useful thing here: the author sees
`ROUND(value, decimals)` while typing the arguments, which is precisely the moment the
help modal is useless because it means leaving the field.

## CONSTRAINTS

- Do NOT change the grammar, lexer, parser, evaluator or validator. This phase reads
  their outputs; it changes no behaviour.
- Do NOT introduce CodeMirror, Monaco, or any editor library. These are plain inputs
  and must stay plain inputs.
- Do NOT write a second copy of any function or variable list — every name comes from
  the Phase 10 modules. A test must fail if a new builtin is missing from suggestions.
- Do NOT auto-correct, auto-close parens, or rewrite what the author typed beyond
  inserting the accepted completion.
- Do NOT suggest names that are invalid in the current context (Task 2).
- Do NOT break the Phase 10 variable disclosure — autocomplete complements it; the
  disclosure stays for browsing.
- Keep existing aria-labels; tests query by them. Add proper combobox/listbox roles for
  the popup rather than a bare div.
- Do NOT delete anything. Do NOT touch recorder-reserved/ or pre-existing work.
- New markdown in docs/ (RULE 9). If unsure, ask (RULE 1, RULE 7).

## TESTS

Mostly against the pure Task 1 module, which is where the rules live:

  1. Every key in BUILTIN_FUNCTIONS and COLUMN_AGGREGATES is suggestible in a context
     where it is legal — so a newly added builtin cannot be missing
  2. Row context does NOT offer SUMMARY_* or column aggregates
  3. Summary context does NOT offer STD_*
  4. A custom function body offers its params, builtins and other custom functions —
     and offers NO column, ENV_*, STD_* or SUMMARY_* name
  5. The formula column's own name is present but not insertable
  6. After `col_mean(`, only bare column names are offered
  7. The template's own custom functions are offered
  8. Prefix beats substring in ranking; matching is case-insensitive; insertion is
     canonical case
  9. Accepting a function inserts `NAME(` with the caret inside; accepting a variable
     inserts the bare name
 10. With the popup closed, Enter is not intercepted
 11. Component-level: typing filters, Up/Down moves, Escape dismisses, click accepts
 12. The popup renders through a portal, not inside the scrolling column container —
     assert its DOM parent is not the column card

Run npm test and tsc --noEmit. Report both, with before and after counts.

## DEFINITION OF DONE

  1. Pre-work output and branch
  2. Confirmation every suggestion name is sourced from the Phase 10 modules, with the
     import sites listed — and that no list was retyped
  3. Any disagreement found between your Task 2 context rules and the validator's
     actual behaviour, reported rather than resolved silently
  4. Diff summary per file
  5. The three inputs it is attached to, confirmed working on each
  6. Confirmation Enter still submits normally when the popup is closed
  7. Confirmation the grammar, evaluator and validator are untouched
  8. npm test and tsc output
  9. Anything unverified, stated as UNVERIFIED — in particular say plainly whether you
     drove the popup with a real keyboard in a browser, or only in tests
```

---

## Why the context rules matter more than the matching

Fuzzy matching is a nicety. The rules in Task 2 are the substance: they turn
autocomplete from a typing shortcut into the thing that stops an author writing a
formula that cannot work.

The clearest case is the custom function body. The validator allows only the function's
own parameters there — no columns, no `ENV_*`, no `STD_*`. An author who does not know
that will reach for a column name, and a naive autocomplete would happily offer it,
confirm the mistake, and let Verify reject it later with an error about scope that reads
like a bug in the software. Declining to offer it teaches the rule at the only moment
the author is actually thinking about it.
