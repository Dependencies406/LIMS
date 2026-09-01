# Phase 32 — The Calculation Trace engine

## Model and effort

**Claude Opus 5 · Effort: xHigh**

Deep, not broad. This is the foundation every later validation artefact rests on,
and it is the one place a subtle error would be signed by a human and filed as
quality evidence. Take the time.

## Context for a fresh session

Standalone. Decisions: `docs/adr/ADR-018-recorder-template-validation.md`, D2/D3/D5.
Glossary: `docs/DATA_MGMT_MODULE_GLOSSARY.md` § Validation.

### What is being built

A **Calculation Trace**: for any value the recorder produces, a structure showing
where that value came from, recursively, down to values that were entered or read
rather than computed. Every leaf carries a **provenance**.

This is what ISO/IEC 17025:2017 clause 7.11.6 actually asks for — it says
"calculations **and data transfers** shall be checked", not "results shall be
checked". The clause is about the working.

### The single constraint that matters most

**The trace must be produced by the same evaluation path as normal computation.**

If tracing is implemented as a second, parallel evaluator, then the trace documents
something the application does not actually do — and a human will sign it. That is
worse than having no trace, because a false record of verification is a finding
whereas a missing one is a gap.

Concretely: `evaluate(expr, ctx)` and `trace(expr, ctx).value` must be the same
number, for every input, by construction and not by coincidence. Instrument the
existing evaluator. Do not write a second one.

### There is a precedent, and it is NOT reusable

`src/services/formulaVerificationService.ts` already implements this shape —
`CellVerification`, `calculationSteps`, `inputValues`, and a
`StepApproval { reviewerName, approvedDate }`. Read it for the *idea*.

It is coupled to `SpreadsheetModel` from the **old spreadsheet module** and cannot
be pointed at a `CalibrationRecord`. Do not try to extend it. Do not import from it.

### Verified structure (2026-08-25)

Read directly; verify each before relying on it:

- The interpreter lives in `src/modules/recorder/formula/` — `lexer.ts`,
  `parser.ts`, `ast.ts`, `evaluator.ts`, `builtins.ts`, `numeric.ts`,
  `studentT.ts`, `errors.ts`, `validator.ts`, `index.ts`.
- `index.ts` exports at least `validateColumnFormulas`, `validateCustomFunctions`,
  `validateExpression`, and the types `ColumnFormula`, `TemplateShape`,
  `ValidationIssue`.
- Existing tests: `src/modules/recorder/formula/__tests__/` — `parser.test.ts`,
  `evaluator.test.ts`, `builtins.test.ts`, `integration.test.ts`,
  `security.test.ts`, `validator.test.ts`.
- `RecorderTemplateVersion` (`src/types/index.ts:1046-1054`) is
  `{ id, templateId, version, snapshot, publishedAt, publishedBy }`.
- `CalibrationRecord.templateVersion` (`src/types/index.ts:1121-1123`) is pinned at
  creation and never re-resolved to the live template.

**`evaluator.ts` has NOT been read during the design of this phase.** Its internal
structure is unknown to this prompt. Read it first and report what you find before
committing to an instrumentation approach — see Task 1.

---

## Prompt

```
Read first:
  - CLAUDE.md — hard rules, especially RULE 1 (never assert what you have not verified)
  - docs/PHASE_32_PROMPT_CALCULATION_TRACE_ENGINE.md — this file
  - docs/adr/ADR-018-recorder-template-validation.md — D2, D3, D5 especially
  - docs/adr/ADR-001-expression-interpreter.md — what the language is
  - docs/adr/ADR-010-evaluation-contexts-and-summary-fields.md — row vs summary context
  - docs/adr/ADR-011-number-precision-and-formatting.md — round-on-display
  - docs/adr/ADR-017-report-blocks.md — the third evaluation context
  - docs/DATA_MGMT_MODULE_GLOSSARY.md — the Validation section, and Row Context /
    Summary Context / Round-on-Display / Column Aggregate
  - src/modules/recorder/formula/ — EVERY file, evaluator.ts most carefully
  - src/modules/recorder/formula/__tests__/ — every test, so you know what is pinned
  - src/services/formulaVerificationService.ts — for the IDEA only; it is coupled to
    the old SpreadsheetModel and must not be imported or extended
  - src/services/referenceStandardVariables.ts, columnConversion.ts,
    recordEnvironment.ts, recordRecalculation.ts — read these to learn where
    non-entered input values actually come from. Do not assume; report what you find.

## MANDATORY PRE-WORK (CLAUDE.md RULE 3/4/8)

    git branch
    git worktree list
    git status
    Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
      Select-Object ProcessId, CommandLine | Format-List

Report each FULL path. Confirm nothing runs from LIMS-New-Backup (nested INSIDE the
project). Work on a branch: feature/calculation-trace

## Task 1 — Read the evaluator and report BEFORE writing any code

This prompt does not know how evaluator.ts is structured. Read it and report:

  1. How does evaluation walk the AST — a recursive function, a visitor, a switch?
  2. Where does a variable reference resolve to a value? Name the function and line.
  3. Where are custom functions applied? Where are builtins applied?
  4. Where are column aggregates (col_mean, col_max, ...) evaluated?
  5. How many distinct evaluation entry points exist, and what are they called?
  6. Is the evaluator pure, or does it mutate a context object?

Then propose ONE of these instrumentation strategies, and justify it:

  (a) An optional trace collector passed through the existing recursion, appending
      nodes as it goes. Same code path, one extra parameter.
  (b) The evaluator always returns a value+node pair internally, with the existing
      public API unwrapping it.
  (c) Something you found in the code that is better than either.

**Do not choose a strategy that duplicates the evaluation logic.** If you find that
neither (a) nor (b) is possible without duplication, STOP and report why — that is
a genuine architectural finding and the owner needs to hear it, not a workaround.

WAIT for confirmation before proceeding to Task 2.

## Task 2 — The TraceNode type

Define the type in a new file, `src/modules/recorder/formula/trace.ts`.

A trace node represents one value. It carries:

  - the resolved value at FULL precision (never rounded — ADR-011)
  - the displayed value as a string, when the value corresponds to a column with a
    number format, otherwise null
  - a provenance, one of:

      'computed'            — produced by a formula
      'entered'             — a person typed it
      'reference-standard'  — from the equipment register / conversion equation
      'template-constant'   — from the pinned template version
      'environment'         — from the Environment Block for a round
      'record-scalar'       — record-level value (e.g. REPORT_TO_N, a column unit)

  - a label the reader will recognise: for a column, `SECTIONID_COLUMNID` plus its
    human column name; for a summary field, `SUMMARY_<id>`.

For 'computed' nodes additionally:
  - the source expression exactly as authored
  - the SUBSTITUTED expression — the same expression with each variable replaced by
    its full-precision value, as a string. This is the single most valuable line
    for a human reviewer and it must be exact.
  - the child nodes, one per input, in the order the inputs appear in the expression

For 'entered' nodes additionally: row index and round, where applicable.

For 'reference-standard' nodes additionally: the equipment id, the equation id, the
certificate identity and the calibration due date, IF those are available from the
data already snapshotted on the record. Read the record types before deciding what
is actually available. Do not invent fields.

Design constraints:
  - Serializable to plain JSON. No class instances, no Map, no Date in the leaves —
    later phases store these in Firestore and render them to PDF.
  - A node must be renderable as ONE line, with children expandable (ADR-018 D3).
    If your shape requires the reader to expand something to understand the line,
    it is the wrong shape.

## Task 3 — Instrument the evaluator

Implement the strategy agreed in Task 1.

Hard requirements:

  1. The existing public API must not change shape. Every existing call site keeps
     working, untouched.
  2. Tracing must be OPT-IN. The normal evaluation path used by
     useLiveRecalculation must not pay for trace construction when nobody asked
     for a trace. Measure this, do not assume it.
  3. `trace(expr, ctx).value` must equal `evaluate(expr, ctx)` for every input.
     This is not a hope. Write a test that asserts it across the entire golden set.
  4. All three evaluation contexts must be traceable: row (ADR-010), summary
     (ADR-010), and report block (ADR-017). If one of them cannot be, say so
     explicitly rather than quietly covering two.
  5. Column aggregates (col_mean, col_max, col_min, col_sum, col_count, col_stdev)
     must trace to the set of row values they consumed — an aggregate whose inputs
     are invisible defeats the purpose.
  6. An expression that ERRORS must still produce a partial trace up to the point
     of failure, with the error attached. Diagnosing a failure is exactly when the
     trace is most valuable.

## Task 4 — Tests

  - Every existing test in src/modules/recorder/formula/__tests__/ must still pass,
    UNCHANGED. If you need to change an existing test, stop and explain why — it
    means you changed behaviour, which this phase must not do.
  - New golden suite in __tests__/trace.test.ts covering:
      * trace(x).value === evaluate(x) across every existing golden case
      * substituted-expression strings, asserted exactly
      * provenance tag correctness for each of the six kinds
      * nested computed inputs producing nested nodes to the correct depth
      * column aggregates listing their consumed row values
      * a deliberately failing expression producing a partial trace plus the error
      * JSON round-trip: structuredClone / JSON.parse(JSON.stringify(node)) is
        equal to the original
  - If STAGE_D_GOLDEN_DATA.json is present in the repo, use its cases. Report
    whether you found it; do not fabricate golden values.

## Task 5 — Report

Write docs/PHASE_32_RESULT.md containing:
  - Your Task 1 findings about evaluator.ts, in full
  - The instrumentation strategy chosen and why
  - The final TraceNode type, verbatim
  - Test counts before and after
  - The performance measurement from requirement 2
  - Every place where you could NOT trace something, and why

That last item is the most important line in the report. A trace with an
undocumented blind spot is the failure mode this whole phase exists to prevent.

## Constraints

  - NO UI in this phase. No React, no components. Pure module and tests only.
  - NO Firestore. Nothing in this phase reads or writes the database.
  - Do NOT change any calculation result. This phase adds observation, not
    behaviour. If any golden value moves, you have broken something — stop.
  - Do NOT import from or modify src/services/formulaVerificationService.ts.
  - Do NOT add dependencies.
  - If a stated fact in this prompt turns out to be wrong when you read the code,
    STOP and report the discrepancy before proceeding. This prompt explicitly
    admits it has not read evaluator.ts.
```

## Done when

Every existing formula test passes unchanged; a new golden suite asserts
`trace(x).value === evaluate(x)` across the whole set; and PHASE_32_RESULT.md names
every place a value could not be traced.
