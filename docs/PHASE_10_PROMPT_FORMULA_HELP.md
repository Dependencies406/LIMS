# Phase 10 — Formula help, variable guidance, and in-app Help button

**Model: Claude Sonnet 5 · Effort: High**

Substantial writing plus a modest UI addition. High effort because the content must
be correct — a help page that contradicts the engine is worse than no help page.

> **Amended 2026-08-14** — Tasks 6 and 7 added after the owner built a working
> conversion template and found there was nothing in the builder telling them which
> reference-standard variables exist or what they mean. Tasks 1–5 are unchanged.
>
> This is now the phase that answers **"what can I type in a formula?"**, not only
> "what functions exist?". Read Task 6 and 7 before starting Task 1 — they change
> what the generated-docs module needs to contain.

## Background

The owner authors every template in this system and is a calibration physicist, not
a programmer. Right now the only description of the formula language lives in
`docs/FORMULA_GRAMMAR.md`, which is a specification written for implementers — it
describes EBNF productions and precedence tables, not "how do I calculate an error
column".

Needed: a usable reference covering basic usage and every ready-to-use built-in
function, reachable from a **Help** button at the point where formulas are actually
typed.

## THE SOURCE OF TRUTH

`docs/FORMULA_GRAMMAR.md` is authoritative, including its §7b (semantics resolved
during implementation). The help content must not contradict it.

**If you find any discrepancy between `FORMULA_GRAMMAR.md`, the implementation in
`src/modules/recorder/formula/`, and what you are about to write — STOP and report
it. Do not silently pick whichever seems right.** Three ADRs in this project were
already wrong because someone asserted behaviour without reading the code.

Read before writing: `FORMULA_GRAMMAR.md` (all of it), `builtins.ts`,
`evaluator.ts`, `validator.ts`, and `docs/PLAIN_LANGUAGE_GUIDE.md` for the register
to write in.

## MANDATORY PRE-WORK (CLAUDE.md RULE 3/4/8)

```
git branch
git worktree list
git status
netstat -ano | grep ":5173"
```

Verify any dev server points at THIS directory. Pre-existing uncommitted work on
this branch is NOT yours — leave it alone. `recorder-reserved/` is an archive.
STOP and ask if anything differs.

## LANGUAGE — bilingual Thai and English (owner decision, 2026-08-04)

All explanatory prose must appear in **both Thai and English**, side by side. The
laboratory's staff read this more often than the owner does.

**What is translated:** every summary, explanation, warning, recipe description, and
section heading.

**What stays in English, untranslated:**

- Function names — `ROUND`, `col_mean`, `TINV`. These are what you type.
- Keywords — `def`, `return`, `if`, `else`, `and`, `or`, `not`
- Formula examples themselves — `CAL_IND - CAL_NOM`. Translating an example would
  make it wrong.
- Variable-name patterns — `SECTIONID_COLUMNID`, `ENV_TEMP_R1`, `SUMMARY_<id>`
- Error messages quoted from the software, which are English in the code

So a function entry reads: English name and signature, then the explanation in both
languages, then the example in code form with its note in both.

Where a metrology term has an established Thai form, use it and put the English in
brackets on first use — the owner is a physicist and will recognise both, but staff
may know only one.

## SCOPE

### Task 1: Function documentation as data, generated from the whitelist

**Do not hand-copy the function list into prose.** It will go stale the first time
someone adds a builtin.

`builtins.ts` already exports `BUILTIN_FUNCTIONS` (a `Record<string, BuiltinFunction>`
with `minArgs`/`maxArgs`) and `COLUMN_AGGREGATES`, plus a `describeArity()` helper.

Create a sibling module — suggested `src/modules/recorder/formula/builtinDocs.ts` —
exporting documentation keyed to those exact names:

```ts
/** Prose that must exist in both languages. */
export interface Bilingual {
  en: string;
  th: string;
}

export interface BuiltinDoc {
  summary: Bilingual;     // one line, plain language
  signature: string;      // e.g. "ROUND(value, decimals)" — English only, it is code
  examples: Array<{
    formula: string;      // English only — this is what you literally type
    result: string;
    note?: Bilingual;
  }>;
  warning?: Bilingual;    // for the traps listed below
}
export const BUILTIN_DOCS: Record<string, BuiltinDoc> = { ... };
export const AGGREGATE_DOCS: Record<string, BuiltinDoc> = { ... };
```

Arity comes from `describeArity()` at render time — do not restate it in prose,
where it could drift.

### Task 2: A test that makes drift impossible

Add to `src/modules/recorder/formula/__tests__/`:

- every key in `BUILTIN_FUNCTIONS` has an entry in `BUILTIN_DOCS`
- every key in `BUILTIN_DOCS` corresponds to a real builtin (no docs for functions
  that no longer exist)
- the same both ways for `COLUMN_AGGREGATES` / `AGGREGATE_DOCS`
- every documented example's `formula` actually parses (run it through the parser)
- **every `Bilingual` field has BOTH `en` and `th` non-empty** — walk the structures
  and assert it. This is what stops a half-translated entry shipping, and stops a
  newly added function from having English docs only.

The last two are the valuable ones: a worked example in the help cannot be
syntactically wrong, and no entry can be missing its Thai.

### Task 3: The reference document

`docs/FORMULA_REFERENCE.md`, written for a non-programmer. Structure:

**Part 1 — Basic usage**

- What a formula is and the two places you type one: a **column formula** (runs once
  per row) and a **summary field** (runs once per record, after all rows)
- How to refer to a column: `SECTIONID_COLUMNID`, e.g. `CAL_IND`. Show how the two
  IDs come from the template builder.
- Environment values: `ENV_TEMP_R1`, `ENV_RH_R1` … one per round
- Referring to other summary fields: `SUMMARY_<id>` (summary context only)
- **Reference-standard values: the `STD_*` family, and `REPORT_TO_N`.** Full table
  from Task 6, with the scope rule stated plainly — `STD_*` is per-row, everything
  else is per-record — and the ADR-014 D5 conversion pattern written out end to end
  with a real worked number (`R = 0.04` on the CAL-FRC-001 coefficients → `1.00002`).
  This is the section the owner went looking for and did not find.
- **A formula cannot reference its own column.** State it, and name the symptom:
  Verify reports a dependency loop.
- Custom functions: `def name(params): return expression`. State plainly that a
  function's only inputs are its parameters — it cannot reach out to columns — and
  that functions may call each other but must not form a loop.
- What is deliberately not allowed, and what to write instead:
  loops; `if`/`else` blocks (use `a if condition else b`); chained comparisons
  (`0 < x < 10` → `0 < x and x < 10`); `//` and `%`; quotes inside text
- **Empty cells are an error, not zero.** An incomplete column cannot be committed,
  and an aggregate over a column with any empty cell is an error. Explain why: a
  mean over incomplete data is meaningless, and a certificate must not silently
  treat missing data as zero.
- Numbers: full precision is stored and calculated; the decimals setting affects
  **display only**. Scientific notation literals are allowed — `11.5e-6`.

**Part 2 — Function reference**

One entry per builtin, generated in the same order as the whitelist. Each with
signature, plain-language summary, worked example with actual numbers, and any
warning.

Three warnings are mandatory:

1. **`ROUND` is not Python's `round`.** It rounds half away from zero, matching
   Excel: `ROUND(0.5, 0)` is `1`, `ROUND(-0.5, 0)` is `-1`. Python would give `0`.
   This is deliberate, so results reconcile against the lab's spreadsheets.
2. **`TINV` has no silent fallback.** The lab's old workbook used
   `IFERROR(TINV(...), 2)`, quietly substituting the conventional coverage factor
   when degrees of freedom hit zero. That is gone. Write it explicitly instead:
   `TINV(0.05, CAL_NU) if CAL_NU >= 1 else 2` — so a reviewer can see when `k = 2`
   was used.
3. **Column aggregates are summary-only**, and the argument must be a bare column
   name: `col_mean(CAL_IND)` yes, `col_mean(CAL_IND * 2)` no.

**Part 3 — Ready-to-use recipes**

This is the part the owner asked for. Copy-paste formulas for real calibration work,
each with a one-line explanation of when to use it. At minimum:

- Error: `CAL_IND - CAL_NOM`
- Percent error / relative error, guarding against division by zero
- Repeatability across three rounds: `MAX(M_R1, M_R2, M_R3) - MIN(M_R1, M_R2, M_R3)`
- Mean of rounds: `AVERAGE(M_R1, M_R2, M_R3)`
- Standard deviation of rounds, and its use as a Type A component
- Pass/fail verdict: `"PASS" if ABS(CAL_ERR) <= CAL_TOL else "FAIL"`
- Maximum deviation across the whole record (summary): `col_max(CAL_ERR)`
- Combining uncertainty components: `RSS(U_A, U_B, U_C)`
- Expanded uncertainty using the explicit TINV pattern above
- A custom function reused across columns, showing why a named function beats
  repeating the same arithmetic in four places

Use section and column IDs that match the owner's actual worksheet vocabulary where
you can infer it; otherwise use obvious ones and say they are examples.

### Task 4: In-app Help modal

A modal rendering the same content, so the owner never has to leave the builder.

- Content comes from `BUILTIN_DOCS` / `AGGREGATE_DOCS` (Task 1) plus static prose for
  Parts 1 and 3 — **one source for the function list**, not a second hand-written copy
- Searchable or at least sectioned with jump links; the function list will be long
- Follow existing modal patterns in `src/components/` — do not invent a new one
- Examples in a monospace font, visually distinct from prose
- **A Thai / English toggle at the top of the modal.** On screen, showing both
  languages for every entry doubles the scrolling and makes the function list hard to
  scan — a toggle is better in the UI. The markdown document (Task 3) shows both
  together, because that is the version to print, share, or hand to an assessor.
  Remember the choice for the session so it does not reset on every open.

### Task 5: Where the Help button goes

- Primary **Help** button in the `RecorderTemplateBuilderPage` header
- A small `?` next to the **Custom Functions** heading and next to the **Summary
  Fields** heading, opening the modal at the relevant section if that is
  straightforward; plain open is acceptable otherwise
- Do **not** add it to the recording page — technicians do not write formulas

### Task 6: The VARIABLE reference — also generated, never hand-listed

Functions are only half of what a formula author needs. The other half is **which
variable names exist and what each one means.** Nothing in the builder currently says.

Extend the Task 1 module (or add a sibling) with variable documentation, generated
from the same lists the validator checks against — never retyped:

  - `STANDARD_VARIABLE_NAMES` in `src/services/referenceStandardVariables.ts` is
    already the single source of truth for `STD_*` (the validator checks against
    exactly this list). Build `STD_DOCS` keyed to it.
  - `REPORT_VARIABLES` in `src/modules/recorder/formula/validator.ts` for `REPORT_TO_N`.
  - `ENV_*` names are generated per round — document the PATTERN
    (`ENV_TEMP_R{n}`, `ENV_RH_R{n}`), not a fixed list.

Each variable needs: what it is, its unit where it has one, and — critically — the
**scope** it resolves in. Scope is what actually confuses people:

  - `STD_*` is **row-scoped**: it comes from the standard chosen in THAT row. Two
    rows on different standards get different numbers. This is the whole point of
    the feature and is not obvious from the name.
  - `ENV_*` and `REPORT_TO_N` are **record-scoped**: same value for every row.
  - `SUMMARY_*` is **summary-context only** and cannot be used in a column formula.

Content that must be right, because it is what the owner needed and could not find:

  - `STD_C0`…`STD_C5` — coefficient of `R^i`. `STD_C0` is the constant term,
    `STD_C1` multiplies `R`, `STD_C2` multiplies `R²`. Say this explicitly with the
    worked form `STD_C1*R + STD_C2*R**2 + STD_C3*R**3`, and note that slots beyond
    the stored polynomial degree are 0 (ADR-013 D4) — the one deliberate exception
    to "empty is an error".
  - `STD_TO_N` / `REPORT_TO_N` — the newton factors, and the ADR-014 D5 pattern
    `polynomial(R) * STD_TO_N / REPORT_TO_N`. Explain WHY both exist: the standard
    reads in one unit and the certificate reports in another.
  - `STD_UCAL`, `STD_UA`, `STD_UB`, `STD_UC` — the uncertainty contributors, in %.
  - `STD_RESOLUTION` — readout resolution. **Note it is only populated if someone
    entered it on the equation** (Phase 14 added the field); otherwise it reads
    awaiting-input, which is correct but looks broken without this sentence.

Tests, in the same shape as Task 2: every name in `STANDARD_VARIABLE_NAMES` has a
doc entry, every doc entry names a real variable, both languages non-empty. A `STD_*`
variable added later must fail the build rather than silently go undocumented.

### Task 7: In-context guidance in the builder — the part that must not clutter

The owner's constraint is explicit: **do not mess up the clean UI.** So the default
visual weight of this must be near zero, and it must appear where formulas are typed
rather than in a panel someone has to know to look for.

**Build a collapsed disclosure directly beneath the formula input** — one quiet line,
e.g. `Variables you can use ▸`, closed by default. Opened, it lists the variables
**available to THIS template**, which the builder already knows:

  - This row's columns — the real names, `READ_R1`, `READ_STD`, built from the
    section and column IDs the author has actually typed
  - Environment — the real `ENV_TEMP_R1`… for this template's `roundCount`
  - Reference standard — the `STD_*` set, shown **only when the template has a
    `standard` column**, since otherwise they all resolve to awaiting-input
  - `REPORT_TO_N`, and summary fields in the summary-field editor only

Requirements that make this worth building rather than decorative:

  1. **Real names, not patterns.** `READ_R1` beats `SECTIONID_COLUMNID`. The author
     is looking at their own template; show their own variables.
  2. **Click a name to insert it** at the cursor in the formula input. This is the
     fastest path from "what exists" to "it is typed correctly", and it eliminates
     transcription typos entirely.
  3. **Show each name's one-line meaning on hover** (`title`), from the Task 6 docs.
     One source, not a second hand-written copy.
  4. **Mark the formula column's OWN name as unavailable** — greyed, with a note that
     a formula cannot reference itself. The owner hit exactly this bug: a column
     `READ_STD1` whose formula referenced `READ_STD1`, which is a dependency cycle
     the validator rejects. The variable list is where that becomes obvious before
     it is typed, not after Verify fails.

Also fix a drift risk already in the code: the `standard` column's info panel in
`RecorderTemplateBuilderPage.tsx` hardcodes `STD_C1`, `STD_C2`, `STD_TO_N`,
`STD_UCAL` in prose and trails off with "and the rest". Generate that list from
`STANDARD_VARIABLE_NAMES` so it cannot go stale, and drop the "and the rest".

**Do NOT** add a permanently-expanded reference panel, a sidebar, a second column of
help text beside every field, or tooltips that fire on hover over the whole row. The
disclosure closed is one line of small grey text; that is the budget.

## CONSTRAINTS

- Do NOT change the formula engine, the grammar, the validator, or any behaviour.
  This phase documents what exists; it does not alter it.
- Do NOT write a second copy of the function list, or of the variable list.
- Do NOT retype `STANDARD_VARIABLE_NAMES` or `REPORT_VARIABLES` as prose or as a
  literal array. Import them. A test must fail if one grows and its docs do not.
- Do NOT expand the builder's default visual footprint beyond one collapsed line per
  formula input (Task 7).
- Do NOT contradict `FORMULA_GRAMMAR.md` — report discrepancies instead.
- Do NOT delete anything. Do NOT touch `recorder-reserved/` or pre-existing
  uncommitted work.
- New markdown goes in `docs/` (RULE 9).
- If unsure, say so and ask (RULE 1, RULE 7).

## TESTS

The Task 2 tests, plus a render test that the modal opens and lists every builtin.

For Tasks 6 and 7:

- Every name in `STANDARD_VARIABLE_NAMES` has a doc entry, and every entry names a
  real variable — both directions, so neither list can drift from the other
- Every `Bilingual` field in the variable docs has both `en` and `th` non-empty
- The disclosure lists the template's REAL column names, built from the section and
  column IDs — assert against a fixture template, not a hardcoded string
- `STD_*` names appear only when the template has a `standard` column
- The formula column's own name is rendered as unavailable
- Clicking a variable name inserts it into the formula input
- The `standard` column info panel's variable list comes from
  `STANDARD_VARIABLE_NAMES` — add a `STD_*` name to a copy of that list in the test
  and assert the panel would show it

Run `npx tsc --noEmit` and `npm test`. Report both. Baseline is 47 files / 749 tests.

**Note:** uncommitted edits to `RecorderTemplateBuilderPage.tsx` and possibly
`EnvironmentBlock.tsx` were made by earlier sessions and may not have been compiled
(one sandbox failed to start). Your type-check covers them — if it reports errors
there, fix them and say so.

## DEFINITION OF DONE

1. Pre-work output and branch
2. Any discrepancy found between `FORMULA_GRAMMAR.md`, the implementation, and the
   help content — reported, not silently resolved
3. Diff summary per file
4. Confirmation the modal's function list is generated from `BUILTIN_FUNCTIONS`, not
   hand-written — and where that happens
5. `npx tsc --noEmit` and `npm test` output, including whether the pre-existing
   uncommitted edits compiled
6. The list of recipes written in Part 3
7. Confirmation the `STD_*` list — in the docs, the modal, the builder disclosure, and
   the `standard` column info panel — comes from `STANDARD_VARIABLE_NAMES` in all four
   places, with the import sites named
8. A description of the collapsed disclosure's default appearance, and confirmation it
   adds no more than one line of visual weight per formula input when closed
9. Anything unverified, stated as UNVERIFIED — say plainly if you could not view the
   modal or the disclosure rendered in a browser

## Why "generated, not copied" matters here

If the function list is prose, then the day someone adds `LOG` to the whitelist the
help silently becomes wrong, and the owner — who trusts it — writes formulas against
a stale list. Generating it from `BUILTIN_FUNCTIONS`, with a test asserting every
function has documentation, converts that from a slow rot into a build failure.

The same argument applies harder to `STD_*`, because there is already a live example
of the rot: the `standard` column's info panel hardcodes four names and says "and the
rest". Six coefficient slots and five other variables exist. Anyone reading that panel
learns that `STD_C1` and `STD_C2` exist and has no way to discover `STD_C3`, which the
cubic conversion this feature was built for actually requires.

## Why the in-context list, and not just the Help modal

A modal answers "what does `STD_UCAL` mean" for someone who already knows it exists.
It does not answer "what can I type here", which is the question an author actually
has, and it cannot answer "what are MY columns called" at all.

The evidence is concrete: the owner's first working template had a formula column
named `READ_STD1` whose expression referenced `READ_STD1` — its own output — because
nothing on screen showed that the raw reading needed its own input column and what
that column's variable name would be. The validator rejects it correctly, but only
after Verify. A list of real, insertable, correctly-spelled names at the point of
typing prevents the whole class of mistake instead of reporting it.
