# ADR-001: Python-syntax single-expression interpreter in TypeScript

Date: 2026-07-30
Status: Accepted

## Context

The draft requirement calls for a "Formula Engine: A Python code set which
defined by user", citing RowZero as the reference.

Verified constraints:

- The frontend is a browser-only React 18 / Vite SPA. No `pyodide`, `brython`,
  or Python-to-WASM package is present (`package.json:12-35`).
- Cloud Functions run **Node 22 + TypeScript** (`functions/package.json:10-22`).
  No `.py` sources exist. There is no Python-capable compute tier.
- RowZero can offer user Python because it executes **server-side in sandboxed
  containers**. A Firebase-hosted SPA has no equivalent without adding one.

Two formula engines already exist:

- `src/services/formulaEngine.ts:37-91` — wraps `hot-formula-parser`, provides
  SUM/AVERAGE/MAX/MIN/COUNT/IF.
- `src/modules/spreadsheet/services/formulaParser.ts` — a hand-written
  tokenizer + AST with cell refs, ranges, cross-tab refs, functions, and
  binary/unary operators.

## Options considered

1. **Reuse the existing TS engine with Excel-like syntax** — cheapest, but
   abandons the Python-syntax requirement.
2. **Pyodide in a Web Worker** — real Python, but 6–11 MB of WASM on first load,
   a third formula engine to maintain, and Pyodide ships a filesystem and network
   stack that must be locked down.
3. **Python on a compute backend (Cloud Run)** — closest to RowZero, but adds an
   entire infrastructure tier and a network round-trip to what must feel like
   realtime recalculation.
4. **Python-syntax subset interpreted in TypeScript** — chosen.

## Decision

Implement an **Expression Interpreter**: a Python-syntax subset parsed to an AST
and evaluated in TypeScript, built on top of the existing
`modules/spreadsheet/services/formulaParser.ts` tokenizer rather than from
scratch.

**The subset is deliberately tiny — single-expression functions only:**

```python
def name(param1, param2):
    return <one expression>
```

In scope:

- Arithmetic: `+ - * / // % **`, unary minus
- Comparison: `== != < <= > >=`
- Boolean: `and`, `or`, `not`
- Conditional expression: `x if cond else y`
- Parentheses, numeric and string literals
- Calls to a **whitelisted** function library (math and statistics)
- Formula variables of the form `SECTIONID_COLUMNID`

Explicitly **out** of scope:

- Statements of any kind other than the single `return`
- Local variable assignment
- `if`/`elif`/`else` blocks
- Loops, comprehensions, generators
- `import`, classes, decorators, lambdas, `try`/`except`
- Attribute access, indexing, slicing
- Any name not in the whitelist or the variable pattern

### Where expressions appear — two places, one grammar

Confirmed with the owner 2026-07-30. The original requirement said a column
formula takes "the restricted form such as `functionName(A_B)`", which read as
though only a bare function call was permitted. **It is not restricted that
way.**

**1. Custom function bodies** — authored in the code editor panel:

```python
def error(nominal, indicated):
    return indicated - nominal
```

**2. Column and summary formula bars** — accept **any expression** in the
subset. All of these are valid:

```
error(CAL_NOM, CAL_IND)          # call a custom function
CAL_IND - CAL_NOM                # plain arithmetic, no function needed
ROUND(CAL_IND - CAL_NOM, 3)      # builtin call
error(CAL_NOM, CAL_IND) * 1.02   # mix of the above
"PASS" if CAL_ERR <= CAL_TOL else "FAIL"
```

So **exactly one expression grammar** is implemented, and it is used in both
places. A custom function body is that grammar plus a `def` header; a formula bar
is that grammar on its own. Custom functions become a convenience for reuse and
readability, not a mandatory wrapper around every calculation.

**Trade-off accepted:** the rejected alternative (function calls only) would have
put every calculation in one reviewable list of named functions — a stronger
position for accreditation review. With inline arithmetic permitted, the maths is
spread between the function list and individual columns. This raises the
importance of the verifier and of template review before publishing, since there
is no single place to read all the maths.

Evaluation is **row-by-row**: each variable resolves to its column's value in
the current row. There is no row index and no round index in the syntax
(see ADR-006).

**Two evaluation contexts** exist — row formulas and record-level summary fields
— with context-restricted column aggregate functions
(`col_mean`, `col_max`, ...) available only in the latter. See
[ADR-010](ADR-010-evaluation-contexts-and-summary-fields.md). These aggregates
are what supply row-spanning computation without admitting loops into the
language. Environmental values are reached via the reserved `ENV` section
([ADR-009](ADR-009-environment-references.md)), which needs no grammar change.

## Consequences

Positive:

- **No code-execution vector.** An AST interpreter never calls `eval` or
  `new Function`. This is strictly safer than Pyodide and than JS-based custom
  functions — which matters, because template documents are user-writable and
  the Firestore rules are permissive (see audit §7).
- **Deterministic and reproducible**, which is what ISO/IEC 17025 record
  reproducibility actually requires. A pinned template version plus a
  deterministic interpreter means a closed record can always be recomputed to
  the same numbers.
- No download-size cost; realtime recalculation stays local and instant.
- The verifier tool the requirements ask for becomes straightforward: parse,
  check every name against the whitelist and the variable pattern, check arity,
  and report position-accurate errors. No execution needed to validate.

Negative and accepted:

- Users write something that *looks* like Python but is not Python. Anything
  beyond a single expression will be rejected. **The UI must set this
  expectation explicitly** — the editor should state "single expression only"
  and the error messages must be precise about what is unsupported, or users
  will paste real Python and be confused.
- No loops means no user-authored aggregation across rows. Row-spanning
  aggregates must be provided as whitelisted library functions.
- This is a language implementation. It needs a real test suite: a grammar
  conformance table, error-message snapshots, and numeric-precision cases.

## Confirmed after the Phase 0 audit gap (2026-07-30)

A prior formula engine exists at
`recorder-reserved/modules/data-recorder/analysis/formulaEngine/` — a working,
tested lexer/parser/evaluator using **Excel-like** expression syntax
(`MAX(q1, q2, q3) - MIN(q1, q2, q3)`). It was missed by the original audit
(see audit §2b).

The owner confirmed it is **not in use — archived for reference only**, and
confirmed that **Python-style function definitions remain the requirement**:

```python
def functionName(PARAMETERS):
    return OUTPUT
```

with the column formula bar calling them using section/column references as
arguments — `functionName(A_B)`.

**This ADR therefore stands unchanged.** The archived engine is prior art to
learn from, not a dependency to adopt. Specifically, harvest:

- its **builtin function list** (`ROUND`, `TRUNC`, `ABS`, `MAX`, `MIN`, `SQRT`,
  `AVERAGE`, `IF`, `RSS`, `TINV`) as the validated starting point for this ADR's
  whitelist;
- `studentT.ts` (TINV) and `numeric.ts` (Excel-faithful ROUND/TRUNC), which are
  non-trivial and already tested;
- its golden fixtures as regression material.

Phase 3 remains a build, not a reuse — but the reference material materially
lowers its risk.

## Risks

The primary risk is **scope creep on the subset**. Each added construct
multiplies parser, validator, error-message, and test surface. Adding
`if`/`elif`/`else` and local variables was estimated at 2–3x. Requests to
"just add loops" should be treated as a decision to revisit this ADR, not as a
small change — loops also introduce non-termination, requiring execution step
limits.

## Follow-up

- Draft the exact EBNF grammar and the whitelisted function list, and get them
  approved before implementation.
- ~~Decimal precision policy is unresolved.~~ **Resolved** by
  [ADR-011](ADR-011-number-precision-and-formatting.md): full-precision storage
  with round-on-display, and explicit per-column `fixed` / `scientific` notation.
  The interpreter therefore operates on **unrounded** values throughout — it never
  applies column formatting, which is purely a rendering concern.
