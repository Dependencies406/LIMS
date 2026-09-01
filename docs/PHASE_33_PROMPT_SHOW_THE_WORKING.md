# Phase 33 — "Show the working" in the recorder

## Model and effort

**Claude Sonnet 5 · Effort: High**

Tasks 1 and 2 are correctness work over a settled engine; Tasks 3–5 are interface.
The hard part is at the front, and it is gated — no interface work begins until the
invariant passes.

If Task 2's splice turns out to require re-entering the evaluator, **stop and
report**. That would be an architectural finding, not something to work around.

## Context for a fresh session

Decisions: `docs/adr/ADR-018-recorder-template-validation.md`, D2/D3/D4.
Phase 32 built the engine: `docs/PHASE_32_RESULT.md`.

### What Phase 32 delivered, verified

- `evaluate()` (`evaluator.ts:256`) and `evaluateWithProbe()` (`:267`) both funnel
  into the same `evaluateNode()` (`:275`). One evaluation path, instrumented with an
  optional leaf probe. There is no second evaluator.
- `trace(x).value === evaluate(x)` holds across 72 golden cases, errors included.
- 1602 tests across 77 files; no existing test was modified.
- Untraced overhead 7.8% (37 ns/eval), no allocation on the untraced path.
- `formatTraceValue` uses `String(value)` — full round-tripping precision, so
  substituted expressions carry unrounded numbers (correct per ADR-011).

### The two problems this phase exists to fix

**1. The substituted expression has no invariant protecting it.**

Values are proven correct. The *substituted expression string* is not: `trace.ts`'s
`substituteSource` (`:590`) rebuilds it by splicing text into the original source
using AST positions. That is a second representation of the calculation — not a
second evaluator, but it is the line a human reads and signs.

Both bugs Phase 32 found were in that path. One rendered a custom function body as
`indicated - nominal10`. The other rendered `1 / X > 5` as `1 / 0 > 5` on a branch
that was short-circuited and never ran — **the value was correct and the working
shown was fiction.** A reviewer checking that working would have been checking
something the system never did. The class is confirmed real and nothing currently
proves it empty.

**2. Cross-column nesting is not spliced.**

`traceExpression` traces one expression. A formula column that references another
formula column produces a `reference` node with a null expression. Custom function
bodies nest correctly to arbitrary depth; column-to-column chains do not.

This is the blind spot that matters most in practice: a force uncertainty budget is
exactly a multi-level chain of columns. Today a reviewer follows the trace to the
interesting part and the trail stops.

---

## Prompt

```
Read first:
  - CLAUDE.md — hard rules, especially RULE 1 (never assert what you have not verified)
  - docs/PHASE_33_PROMPT_SHOW_THE_WORKING.md — this file
  - docs/PHASE_32_RESULT.md — what was built, and ALL NINE blind spots
  - docs/adr/ADR-018-recorder-template-validation.md — D2, D3, D4
  - docs/adr/ADR-011-number-precision-and-formatting.md — round-on-display
  - docs/adr/ADR-015-display-time-unit-conversion.md — especially D1, the separation rule
  - docs/DATA_MGMT_MODULE_GLOSSARY.md — the Validation section
  - src/modules/recorder/formula/trace.ts — the whole file
  - src/modules/recorder/formula/evaluator.ts — the probe wiring
  - src/modules/recorder/formula/__tests__/ — the Phase 32 trace tests
  - src/modules/recorder/components/RecordingGrid.tsx — where records are viewed
  - src/services/recorderTemplateMockup.ts — how a whole record is currently evaluated
  - src/services/columnConversion.ts — display-time unit conversion (do NOT wire it here)

## MANDATORY PRE-WORK (CLAUDE.md RULE 3/4/8)

    git branch
    git worktree list
    git status
    Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
      Select-Object ProcessId, CommandLine | Format-List

Report each FULL path. Confirm nothing runs from LIMS-New-Backup (nested INSIDE the
project). Branch: feature/trace-ui

## Task 1 — GATE. The substitution invariant. Nothing else starts until this passes.

Do this FIRST and completely. Do not begin any interface work until it is green.
It is placed here deliberately: a correctness proof folded into a UI phase is the
thing that gets dropped when the session runs long.

The invariant: **the substituted expression, read as an expression on its own, must
produce the node's value.**

Implement it as a test helper: take a TraceNode's `substituted` string, parse it
with the existing parser, evaluate it with an EMPTY variable context — no
identifiers resolvable, because every variable should already have been replaced by
its value — and assert the result equals `node.value`.

Two exclusions, and they must be justified in the test file as comments, not
silently skipped:

  - **Nodes containing a skipped branch.** Short-circuited subexpressions are
    deliberately left unsubstituted (trace.ts:605), so the string legitimately still
    contains identifiers. Detect this case explicitly; do not just catch the parse
    error and move on, or a genuine bug will hide behind the exclusion.
  - **Aggregate nodes.** They render as `col_max([1, 2, 3])` — a list literal the
    language does not accept as input. Assert their shape separately.

Run the invariant across EVERY case in the Phase 32 golden set, plus every node at
every depth of every nested trace, not only root nodes.

Report: how many nodes were checked, how many fell into each exclusion, and any
failure. **If it finds a bug, fix the bug — do not widen an exclusion to make it
pass.** Widening an exclusion to get green is the single worst thing that could
happen in this phase.

## Task 2 — Splice cross-column references

Build the orchestrator that traces a whole record rather than one expression.

For a given record, its pinned template version, and a row: produce a trace for each
formula column, and where a node references another formula column, splice in that
column's own trace so the chain is followed to its inputs.

Requirements:

  1. **Placement.** Propose where this belongs and justify it against ADR-015 D1's
     separation rule, then implement. The formula module must not gain imports from
     services or Firestore. State your reasoning before you write the file.
  2. **Cycles.** The template validator rejects cycles at authoring time, but this
     runs against a pinned snapshot that was validated by an older version of the
     validator. Add a depth guard and a visited set. A cycle must produce a clearly
     marked node, never a hang or a stack overflow.
  3. **Shared subexpressions.** If two columns both reference a third, the third
     should be traced once and referenced twice, not duplicated — but the reader must
     still be able to expand it from either place. Say how you handled it.
  4. **All three contexts.** Row, summary, and block. A summary field referencing a
     column aggregate must splice to the aggregate's consumed row values.
  5. **Values must not change.** This phase adds observation only. If any golden
     value moves, stop.
  6. **Performance.** Measure the cost of tracing a full record with 30 rows and a
     realistic column count. Report the number. If it is slow enough to freeze the
     interface, say so and propose lazy expansion rather than shipping a hang.

Test this as a pure module, with its own tests, BEFORE building any interface on it.

## Task 3 — Render the trace

One line per computed value, expandable in place (ADR-018 D3). `traceNodeToLine` in
trace.ts already exists — read it and decide whether to build on it or render
structurally in the component.

Requirements:

  1. Reachable from any computed cell on a record, in ANY status — draft, committed,
     reviewed, approved, superseded, voided. A reviewer needs the working most on a
     record they cannot edit.
  2. **Read-only. Opening a trace must never enter edit mode, alter a cell, or write
     anything.** Verify this, do not assume it.
  3. Each line shows: the value at full precision, the expression, the substituted
     expression, and the provenance of each input. Inputs that were themselves
     computed expand in place.
  4. Provenance must be visible on the line, not hidden behind a hover — it is the
     part that makes the calculation checkable rather than merely visible.
  5. Follow the existing Thai UI conventions in this codebase for all labels. Read
     how neighbouring components handle Thai strings and match them. Do not invent a
     new labelling pattern.
  6. Keep the component readable — plain, conventional React that the project owner,
     who is not a developer, can follow and edit. No clever abstractions.

## Task 4 — Flag what is NOT traced. Do not skip this.

Phase 32 left nine blind spots. Two of them mean the number a user sees can differ
from the number the trace explains:

  - Display-time unit conversion (ADR-015) is not traced.
  - `displayValue` is caller-supplied, so the trace cannot prove what is printed.

Where any untraced transform sits between a traced value and what the user is
looking at, **the interface must say so on the spot** — a visible marker on that
line reading, in the project's Thai UI style, that the displayed figure is produced
by a step this trace does not cover.

A trace that silently presents a pre-conversion number as if it were the reported
value is worse than no trace, because someone would sign it. This requirement is
non-negotiable and its absence fails the phase.

Do NOT wire unit-conversion tracing in this phase. ADR-015 D1 keeps that on the
services side; it belongs to a later phase. Flag it, do not fix it.

## Task 5 — Report

Write docs/PHASE_33_RESULT.md containing:
  - Task 1: nodes checked, exclusions by category with counts, every bug found
  - Task 2: placement decision and its justification, cycle handling, shared-node
    handling, and the 30-row performance number
  - Task 3: where the trace is reachable from, and how you verified it writes nothing
  - Task 4: a screenshot or exact rendering of an untraced-transform warning
  - Any blind spot from PHASE_32_RESULT.md that this phase newly closed or newly
    made worse
  - Test counts before and after

## Constraints

  - Do NOT change any computed value. Observation only.
  - Do NOT modify existing tests. If you think you must, stop and explain.
  - Do NOT write to Firestore. Nothing in this phase persists anything.
  - Do NOT wire display-time unit conversion (Task 4 flags it; a later phase fixes it).
  - Do NOT add dependencies.
  - Do NOT widen a Task 1 exclusion to make a test pass.
  - If a stated fact in this prompt turns out to be wrong, STOP and report it.
    Phase 31A and Phase 32 each disproved something in their own prompt; assume this
    one contains an error too and find it.
```

## Done when

The substitution invariant passes across every node of every golden case with only
the two justified exclusions; a multi-level column chain traces end to end without
the trail stopping at a bare reference; a reviewer can open the working on an
approved record without touching it; and any figure whose displayed value passes
through an untraced step says so on its own line.
