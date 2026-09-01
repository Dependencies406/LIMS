# Phase 32 Result — Calculation Trace Engine

Branch: `feature/calculation-trace` (carries the uncommitted Phase 31/31A work
across; **nothing committed** — owner is handling commits once the GitHub issue
is resolved in early September 2026).

Prompt: `docs/PHASE_32_PROMPT_CALCULATION_TRACE_ENGINE.md`. Decisions:
`docs/adr/ADR-018-recorder-template-validation.md` D2, D3, D5.

## Pre-work (CLAUDE.md RULE 3/4/8)

- Worktrees: exactly one — `C:/Users/seela/Desktop/LIMS-New`.
- Dev server: `vite` PID 24624, and `npm run dev` PID 23844, both from
  `C:\Users\seela\Desktop\LIMS-New`. Functions emulator PIDs 17236/19280/29000
  from `C:\Users\seela\Desktop\LIMS-New\functions`.
- **Nothing runs from `LIMS-New-Backup`.** Not modified.

---

## Task 1 — What `evaluator.ts` actually is

### 1. How evaluation walks the AST

A **recursive function with an exhaustive `switch` on `node.type`** — not a
visitor, not a dispatch table. `evaluateNode(node, context, locals, depth)` at
`evaluator.ts:162` is the single recursion point. The explicit switch is
deliberate: it is ADR-001's entire security argument (no `eval`, no
`new Function`), and `security.test.ts` enforces it by scanning the module.

### 2. Where a variable resolves to a value

**`evaluateIdentifier` — `evaluator.ts:221`.** One function, seven branches, in
this order:

| Line | Branch | Provenance it corresponds to |
|---|---|---|
| 229 | `locals` — a custom function's own parameters | (a parameter binding) |
| 236 | `ENV_*` from `context.env` | `environment` |
| 251 | `REPORT_*` from `context.env` | `record-scalar` |
| 263 | `STD_*` from `context.std` (row-scoped, ADR-013 D4) | `reference-standard` |
| 280 | `SUMMARY_*` from `context.summary` | `computed` (a prior field) |
| 295 | the block's own columns, block context | `entered` / `computed` |
| 310 | measurement columns, row context | `entered` / `computed` |

This was the decisive finding for the whole design: **the six provenances
ADR-018 D2 names already exist as physical branches in one function.**
Provenance tagging is therefore *reading a discriminator the evaluator already
computes*, not inferring one after the fact. Every branch funnels through
`readCell()` (`:151`), the single place `awaiting-input` is raised for an empty.

### 3. Custom functions and builtins

Both in **`evaluateCall` (`:371`)**:

- **Builtins** (`:391-396`) — arguments evaluated and `requireNumber`'d, then
  `callBuiltin` dispatches into the `BUILTIN_FUNCTIONS` table. Builtins never
  see the context; they are opaque numeric functions.
- **Custom functions** (`:398-422`) — arguments evaluated in the **caller's**
  scope, bound into a fresh `bound` object, body then evaluated with
  `locals = bound` and `depth + 1`. Capped at `MAX_CALL_DEPTH = 64`.

### 4. Column aggregates

**`evaluateColumnAggregate` (`:425`)**, reached only from `evaluateCall`'s first
branch. It collects `values: number[]` at `:455-467` **before** switching on the
aggregate name. That local array is exactly what requirement 5 needs, and it
already existed — no new collection pass was required.

### 5. Evaluation entry points

**One public entry point:** `evaluate(node, context)` (`:158`), a thin wrapper
over `evaluateNode(node, context, null, 0)`.

**Four production call sites** (grep over all of `src/`, tests excluded):

| Call site | Context |
|---|---|
| `recorderTemplateMockup.ts:239` | `row` |
| `recorderTemplateMockup.ts:281` | `summary` |
| `recorderTemplateMockup.ts:331` | `block` |
| `columnConversion.ts:157` | synthetic `row` — see blind spot 1 |

`evaluateMockup` is the real record-level orchestrator despite its "mockup"
name; `recalculateRecord` is a thin wrapper over it, and `useLiveRecalculation`
drives that on every keystroke.

### 6. Pure or mutating?

**Pure — verified empirically, not inferred.** A throwaway probe asserted that
`JSON.stringify(context)` and `JSON.stringify(ast)` are byte-identical before
and after evaluation, and that two successive evaluations return identical
values. Both passed; the probe was removed. `bound` is freshly allocated per
call and nothing writes to `context`.

The **orchestrator** does mutate: `evaluateMockup` accumulates into `rowData`
(`recorderTemplateMockup.ts:240`) so a later formula column can read an earlier
one. That mutation is outside the evaluator.

---

## Strategy chosen: (c) — a leaf-resolution probe threaded through the existing recursion

Neither (a) nor (b) as the prompt described them was right, for a structural
reason rather than a preference.

**Why not (a) as written.** "Appending nodes as it goes" through the whole
recursion yields one trace node per **AST node** — a node for every `+`, every
comparison. That is exactly the *full per-operation expansion* **ADR-018 D3
explicitly rejects** ("a single row of a force calibration with a full
uncertainty budget becomes pages, and reviewers stop reading"). It also
contradicts the prompt's own Task 2 shape: "child nodes, **one per input**".

**Why not (b).** Returning a value+node pair internally rewrites every `return`
in the security-critical switch and allocates a wrapper per AST node on the hot
path — `useLiveRecalculation` re-evaluates the whole record on every keystroke —
even when the pair is immediately discarded.

**What was built: (a), narrowed to the leaves.** The trace shape ADR-018 wants
is one `computed` node per **formula**, whose children are one node per
**input**. Nesting comes from an input being itself computed. So the evaluator
only has to report the facts it alone knows:

| Event | Emitted from | Carries |
|---|---|---|
| `resolve` | each of the 7 branches of `evaluateIdentifier` | name, **which branch**, value |
| `resolve-failed` | the `Identifier` case of `evaluateNode` | name, error kind, message |
| `aggregate` | `evaluateColumnAggregate`, after `values` is built | function, column, **every row value**, result |
| `call-entered` / `call-exited` | `evaluateCall`'s custom-function branch | function, params, args, arg ASTs, body, call-site position |
| `branch-skipped` | `Logical` short-circuit and `Ternary` | the subexpression that did **not** run |

`evaluate()` keeps its exact signature and passes `null`. A new
`evaluateWithProbe()` is the traced entry point. **Same recursion, same
arithmetic, same error semantics** — nothing is recomputed for the trace's
benefit, which is what ADR-018's stated largest technical risk demands
("evaluation must be instrumentable, not re-implemented for tracing").

`branch-skipped` was added during implementation, not designed up front: without
it, `X != 0 and 1 / X > 5` rendered as `0 != 0 and 1 / 0 > 5`, implying a
division that never happened, because `X` had resolved on the *left*. Silence is
ambiguous; the skipped node is what makes the untaken span honest.

### Substituted expressions come from source text, not the AST

`parser.ts:224-226` returns the inner node for `( expr )` — **parentheses are
discarded and there is no parenthesis node.** There is also no AST→string
printer anywhere in the codebase. So an exact substituted expression is
impossible by re-printing.

Instead, substitution edits the **original source string** at each identifier's
own token position (verified 1-based and correct on every line, including
multi-line sources), applied back-to-front so earlier offsets stay valid. The
author's own parentheses survive untouched:

```
(CAL_A + CAL_B) * (CAL_A - CAL_B)   ->   (3 + 1) * (3 - 1)
```

A custom function body needs the same treatment, and required a subtlety: the
bound `body` AST carries positions relative to the whole
`def name(...):\n    return <expr>` source it was parsed from, not to the body
text. The body source is therefore re-parsed to obtain an AST whose positions
index that string, with a node-identity map between the two so `branch-skipped`
still lands correctly inside a body. Same expression either way; the re-parse is
used for positions and names only, never to produce a value.

---

## The final TraceNode type, verbatim

```ts
export type TraceValue = number | string | boolean;

export type TraceProvenance =
  | 'computed' | 'entered' | 'reference-standard'
  | 'template-constant' | 'environment' | 'record-scalar';

export interface TraceError { kind: FormulaErrorKind; message: string; }

interface TraceNodeCommon {
  label: string;               // CAL_ERR, SUMMARY_MAXDEV, ENV_TEMP_R1, STD_C1
  name: string | null;         // human column name, e.g. "Error"
  parameter: string | null;    // set when bound to a custom function parameter
  value: TraceValue | null;    // FULL precision (ADR-011); null iff error is set
  displayValue: string | null; // ADR-011 rendering, supplied by the caller
  error: TraceError | null;
}

export type ComputedOrigin =
  | ExpressionOrigin | CustomFunctionOrigin | ColumnAggregateOrigin | ReferenceOrigin;

export interface ExpressionOrigin { kind: 'expression'; }
export interface CustomFunctionOrigin {
  kind: 'custom-function'; functionName: string; params: string[];
}
export interface ColumnAggregateOrigin {
  kind: 'column-aggregate'; functionName: string; column: string; rowCount: number;
}
export interface ReferenceOrigin {
  kind: 'reference'; refers: 'summary-field' | 'formula-column';
}

export interface ComputedTraceNode extends TraceNodeCommon {
  provenance: 'computed';
  origin: ComputedOrigin;
  expression: string | null;   // exactly as authored, never re-printed
  substituted: string | null;  // variables replaced with full-precision values
  inputs: TraceNode[];         // one per input, in source order
  notEvaluated: string[];      // names present but never evaluated
}

export interface EnteredTraceNode extends TraceNodeCommon {
  provenance: 'entered'; rowIndex: number | null; round: number | null;
}
export interface EnvironmentTraceNode extends TraceNodeCommon {
  provenance: 'environment'; round: number | null;
}
export interface TraceStandardIdentity {
  equipmentId: string | null; equationId: string | null;
  displayName: string | null; equipmentCode: string | null;
  serialNumber: string | null;
  calibrationDate: string | null;  // ISO 8601
  dueDate: string | null;          // ISO 8601
}
export interface ReferenceStandardTraceNode extends TraceNodeCommon {
  provenance: 'reference-standard';
  rowIndex: number | null;
  standard: TraceStandardIdentity | null;
}
export interface TemplateConstantTraceNode extends TraceNodeCommon {
  provenance: 'template-constant';
  constantKind: 'literal' | 'custom-function-body' | 'choice';
}
export interface RecordScalarTraceNode extends TraceNodeCommon {
  provenance: 'record-scalar';
}

export type TraceNode =
  | ComputedTraceNode | EnteredTraceNode | EnvironmentTraceNode
  | ReferenceStandardTraceNode | TemplateConstantTraceNode | RecordScalarTraceNode;
```

### Four design decisions worth recording

1. **Unevaluated variables are named, not noded.** `notEvaluated: string[]`
   rather than a seventh provenance or a null-valued node. We never resolved
   them, so we do not know which branch they would have hit; any provenance
   would be invented. The substituted text leaves them as bare names.
2. **No optional fields — absent is an explicit `null`.** `JSON.stringify`
   silently drops `undefined` keys, which would make the required round-trip
   test pass while losing data. Asserted with `toStrictEqual`, plus a recursive
   scan for any `undefined` anywhere in a node.
3. **`value`/`error` invariant.** Exactly one is non-null. A `status` field was
   drafted and removed once it proved fully derivable (`FormulaValue` is never
   null, so `value === null` ⟺ `error !== null`).
4. **`displayValue` is supplied, never computed here.**
   `services/recordingGridDocument.ts` holds `applyNumberFormat` /
   `formatColumnValueForDisplay`, documented there as THE single source of truth
   for rendering a column value. The formula module cannot import services (the
   dependency runs services → formula; `columnConversionIsolation.test.ts`
   enforces it for the evaluation path). Reimplementing ADR-011 here would let a
   trace show a different figure from the certificate it is meant to evidence —
   the exact defect class ADR-018 D5 exists to catch.

**No certificate identity was invented.** `ReferenceStandardSnapshot` has no
certificate-number field. `TraceStandardIdentity` carries what it actually
stores; the gap is left visible rather than filled.

---

## Test counts

| | Test files | Tests |
|---|---|---|
| Before Phase 32 | 76 | 1478 |
| After Phase 32 | 77 | 1602 |
| Added | +1 (`formula/__tests__/trace.test.ts`) | **+124** |

**No existing test was modified.** `git diff --stat -- 'src/**/__tests__/**'`
is empty; the only changed files are `evaluator.ts`, `index.ts` (both
additive) and the two new files. Behaviour is unchanged, which was the
constraint.

Coverage of the required list:

| Required | Where |
|---|---|
| `trace(x).value === evaluate(x)` across the golden set | 72-case parity table, values **and** errors compared |
| substituted strings asserted exactly | 8 cases incl. parentheses, float artifacts, text quoting |
| provenance correct for each of the six | one case each, plus an exhaustiveness check |
| nested computed inputs to correct depth | 5 cases, incl. `depthOf() === 4` and forwarded parameters |
| aggregates list consumed row values | all six aggregates, plus two-over-one-column |
| failing expression → partial trace + error | 4 cases, incl. a frame left open by a throw |
| JSON round-trip | 6 node shapes × `JSON` + `structuredClone`, `toStrictEqual` |

### On `STAGE_D_GOLDEN_DATA.json`

**Found, and deliberately not used.** It exists at
`recorder-reserved/modules/data-recorder/analysis/__tests__/fixtures/STAGE_D_GOLDEN_DATA.json`
(tracked). Three reasons it is not the golden set here:

1. `security.test.ts:62-65` structurally forbids any non-test file in the
   formula module from containing the string `recorder-reserved`. `trace.ts`
   lives in that directory.
2. Its own `purpose` field says it is an oracle for the **Stage D analysis
   module** (`relativeError.ts`, `uncertaintyBudget.ts`) — a different, retired
   module. Its shape is workbook extractions (`rawData`, `calPoint`, `inc1`),
   not formula expressions with expected values.
3. It encodes the four workbook behaviours ADR-018 D6 records as accepted risk.

No golden values were fabricated. The golden set used is the existing formula
suite, as agreed with the owner before implementation.

---

## Performance (requirement 2), measured

Interleaved A/B against the pre-instrumentation `evaluator.ts` taken from git,
200,000 iterations per run, 5 runs per side, medians:

```
workload: ABS((CAL_IND * STD_C1 + STD_C0) * STD_TO_N / REPORT_TO_N - CAL_NOM)
          * (1 + 11.5e-6 * (ENV_TEMP_R1 - 20))

BEFORE ms per run: 95.2 96.7 93.3 93.6 93.7   median 93.7
AFTER  ms per run: 99.9 101.4 100.5 103.1 101.0   median 101.0

median overhead: 7.8%  (37 ns per evaluation)
```

A first, non-interleaved run reported 12.9%; that was ordering noise, which is
why the measurement was repeated interleaved. **7.8% / 37 ns is the number to
trust.**

Decomposing where it goes:

| Workload | Before | After | Delta |
|---|---|---|---|
| pure arithmetic, **0 identifiers** | 114 ns | 139 ns | **25 ns** |
| realistic force row, **6 identifiers** | 472 ns | 508 ns | **36 ns** |

So ~25 ns is **threading the extra parameter through the recursion**, and only
~11 ns is the six `report()` calls (~2 ns each — V8 inlines the null check
essentially to nothing). The cost is the arity change to `evaluateNode`, which
is inherent to this strategy; removing it would require option (b), which costs
more. There is **no allocation and no node construction** on the untraced path.

In context: a recalculation of a 20-row record with 5 formula columns and 10
summary fields is ~110 evaluations, so the added cost per keystroke is ~4
microseconds. Tracing itself is ~20x an untraced evaluation, but it is opt-in
and never runs during live recalculation.

Honest qualification: this is a microbenchmark on one machine (Node v24.11.1,
Windows). It measures the evaluator in isolation, not the React render path
around it.

---

## Everywhere the trace CANNOT see

Per the prompt: this is the most important section in the report. A trace with
an undocumented blind spot is the failure mode the phase exists to prevent.

### 1. Display-time unit conversion (ADR-015) is not traced — and it changes printed numbers

`columnConversion.ts:157` runs conversion-rule expressions through **the same
evaluator**, in a synthetic row context (`row: { VALUE: rawValue }`). Nothing
wires the tracer into that path.

This matters more than the others: it is a genuine record → certificate
transform that changes the number a reader sees, and ADR-018 **D4** explicitly
wants the record → PDF transfer covered. A converted cell's trace today shows
the raw engine value, not the converted figure printed on the certificate.

Not fixed here because ADR-015 D1 makes it non-negotiable that the formula
module knows nothing of conversion (`columnConversionIsolation.test.ts` enforces
it structurally), so the wiring belongs on the services side, above this module.

### 2. Cross-column and cross-field nesting is NOT spliced — this phase traces one expression

`traceExpression` traces a single expression. `recorderTemplateMockup.ts` — the
real record-level orchestrator — is **untouched** (no UI, no Firestore, per the
constraints). Consequently:

- A formula column referenced by another formula produces a node with
  `origin: { kind: 'reference', refers: 'formula-column' }` and
  `expression`/`substituted` **null**. Its own subtree is not attached.
- The same for `SUMMARY_*` references.

So "nested computed inputs" is real **within** one expression (custom function
bodies nest correctly, to arbitrary depth) but **not yet across** columns. The
`reference` origin exists precisely so an un-spliced reference is visibly a
reference rather than masquerading as an expression with no inputs. Wiring
`evaluateMockup` to splice these is the natural next phase.

### 3. A compound custom-function argument gets no subtree

`f(CAL_A + CAL_B)` binds a value to the parameter, and the binding node records
that value, but the argument's own sub-expression forms no node
(`expression`/`substituted` null). Its variables **are** visible in the caller's
substituted text, so no information is lost from the page — only the tree shape.
A bare identifier or a literal argument is handled fully.

### 4. A failing column aggregate produces no aggregate node

The `aggregate` event fires only after `values` is collected **and** the result
computed. If `col_mean(X)` raises (an empty row, a non-numeric cell), no event
fires, so there is no node exposing the partial row values. The error still
attaches to the enclosing computed node, and the evaluator's message names the
column ("`CAL_ERR` is not filled in for every row yet"), so it is diagnosable —
but the row-by-row view a reviewer would most want is exactly what is missing at
the moment it would help most.

### 5. A failed name carries no resolution branch

`resolve-failed` reports the name and the error but **no `source`** — resolution
never got far enough to establish one, and reporting a guess would be worse. The
tracer classifies the failed name by prefix instead (`ENV_`/`REPORT_`/`STD_`/
`SUMMARY_`, else a column). Two consequences: a failed bare name in **block**
context is labelled as a row column, and a failed bare name is labelled `entered`
unless it appears in `options.formulaColumns`. This affects **labels on values
that were never produced** only; it can never affect a result.

### 6. Builtin functions are opaque

`SQRT(CAL_X)` shows the substituted argument, but the builtin call itself gets no
node and its internals are not traced. Intentional under ADR-018 D3 (a builtin
is a documented primitive, and expanding it is per-operation expansion), but it
is a boundary: if a builtin were wrong, the trace would show correct inputs and
a wrong output with nothing in between.

### 7. `displayValue` and reference-standard identity are null unless supplied

Both are caller-supplied by design (see the type decisions above). A trace built
without `formatDisplay` carries **no** ADR-011 displayed figure, which means
**ADR-018 D5's exact-string check on reported values cannot yet be run from the
trace alone.** Likewise `standard` is null without the record's snapshot. Neither
is a defect in the tracer, but both are prerequisites the caller must meet before
the trace is Tier-2 evidence.

### 8. A custom function body needs its source text supplied

Without `options.functionSources[name]`, an expanded body node has null
`expression`/`substituted` — the AST alone cannot reproduce the authored text
because the parser discards parentheses. The value and provenance are unaffected.

### 9. Record → PDF transfer (ADR-018 D4) is not addressed at all

Out of scope for this phase by construction (no UI, no Firestore). Named here so
its absence is a recorded decision rather than an oversight.

---

## Discrepancies against the prompt

1. **`STAGE_D_GOLDEN_DATA.json` is present but unusable** — three independent
   reasons, above. Raised before implementation and agreed with the owner.
2. **`BlockEvaluationContext` was not exported** from the module barrel, while
   `RowEvaluationContext` and `SummaryEvaluationContext` were. Requirement 4
   needs all three nameable; the export was added.
3. **The prompt's option (a) as literally worded would violate ADR-018 D3** —
   see the strategy section. Resolved by narrowing it to leaf resolutions.
4. **A fourth evaluation surface exists** that the prompt does not mention
   (`columnConversion.ts`) — blind spot 1.

## What Phase 32 deliberately did not do

- Did not touch `recorderTemplateMockup.ts`, so nothing in the running
  application produces a trace yet. The capability exists; the wiring does not.
- Did not import from or modify `formulaVerificationService.ts` (verified: no
  reference to it anywhere in the new code).
- Added no dependencies. Changed no calculation result — all 1478 pre-existing
  tests pass unmodified.

  (`package.json` does differ from `HEAD`, but only in the `test` script from
  Phase 31A — `dependencies` and `devDependencies` are byte-identical.)

## Files changed

| File | Change |
|---|---|
| `src/modules/recorder/formula/evaluator.ts` | instrumented — probe threaded through, +5 event types |
| `src/modules/recorder/formula/index.ts` | barrel exports, incl. the missing `BlockEvaluationContext` |
| `src/modules/recorder/formula/trace.ts` | **new** — the type, the builder, one-line rendering |
| `src/modules/recorder/formula/__tests__/trace.test.ts` | **new** — 124 tests |

Every line removed from `evaluator.ts` was an import being extended, a call
gaining the `probe` argument, or a resolution site gaining the `report()`
wrapper. No arithmetic, no branch condition and no error semantic was deleted —
checked line by line against `git diff`.
