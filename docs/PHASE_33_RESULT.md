# Phase 33 Result — Show the Working

Branch: `feature/trace-ui` (continues from `feature/calculation-trace`, which carried
Phase 31A/32 work forward — nothing has been committed across Phases 31A/32/33; the
owner is handling commits once the GitHub issue is resolved, per explicit
instruction).

Prompt: `docs/PHASE_33_PROMPT_SHOW_THE_WORKING.md`. Read in full first:
`docs/PHASE_32_RESULT.md` (all nine blind spots), ADR-018 D2/D3/D4, ADR-011,
ADR-015 (especially D1), `DATA_MGMT_MODULE_GLOSSARY.md`'s Validation section,
`trace.ts`, the evaluator's probe wiring, the Phase 32 trace tests,
`RecordingGrid.tsx`, `recorderTemplateMockup.ts`, `columnConversion.ts`.

## Pre-work (CLAUDE.md RULE 3/4/8)

- Worktrees: exactly one — `C:/Users/seela/Desktop/LIMS-New`.
- Dev server (`vite`) and `npm run dev`, both from `C:\Users\seela\Desktop\LIMS-New`.
  **Nothing runs from `LIMS-New-Backup`.**
- Branch created as instructed: `feature/trace-ui`, carrying the uncommitted
  Phase 31A/32 work across (same pattern as the Phase 32→33 transition).

## A discrepancy found and corrected before Task 3 began

The prompt says: *"Follow the existing Thai UI conventions in this codebase for
all labels. Read how neighbouring components handle Thai strings and match them."*

**Checked directly, not assumed.** Grepped for Thai characters (`[\u0E00-\u0E7F]`)
across every `.tsx` file in `src/modules/recorder/components/` and `src/pages/`.
Result: **zero Thai characters** in `RecordingGrid.tsx`'s actual neighbours —
`RecordSignOffModal.tsx`, `VoidRecordModal.tsx`, `CreateRevisionDialog.tsx`,
`EnvironmentBlock.tsx` — all pure English. The **only** bilingual component
anywhere near this module is `FormulaHelpModal.tsx` (in `src/components/`, not
`modules/recorder/components/`), a separate authoring-time help reference with
its own explicit `language` toggle defaulting to `'en'` (`useState<HelpLanguage>('en')`
in `RecorderTemplateBuilderPage.tsx`). This matches the git history already
visible in this repo: `translate module UI from Thai to English`,
`translate sidebar nav label to English`.

**Conclusion:** there is no Thai-labelling convention to match in the part of the
codebase this phase touches. `CalculationTraceModal.tsx` was built in English,
matching the modals actually adjacent to it. Recorded here per the prompt's own
instruction to assume this prompt contains an error and find it.

---

## Task 1 — GATE: the substitution invariant

**Status: GREEN.** File: `src/modules/recorder/formula/__tests__/traceSubstitutionInvariant.test.ts`
(85 tests, all passing), plus a new shared fixtures module
`traceGoldenFixtures.ts` (not a test file itself — extracted so the gate could
reuse the Phase 32 golden set without modifying `trace.test.ts`, which the
constraints forbid).

### The final run

```
[Phase 33 Task 1] nodes visited: 109
  checked (invariant asserted) : 49
  excluded - error             : 23
  excluded - no substituted    : 15
  excluded - not-evaluated     : 1
  excluded - aggregate         : 21
```

Walked **every node at every depth of every trace** (`collectAllNodes`, not just
roots) across the full Phase 32 golden set (72 cases) plus 8 deeper-nesting
cases built specifically to exercise multi-level splicing, forwarded
parameters, and every exclusion category at least once.

### Exclusion categories (final: four, not the prompt's two)

| Category | Count | Why legitimate |
|---|---|---|
| A. `error !== null` | 23 | The invariant is about "the node's value"; a failed node produced none. |
| B. `substituted === null` | 15 | Un-spliced references (Task 2 closes this) and compound custom-function arguments (documented Phase 32 gap) — nothing to parse. |
| C. `notEvaluated.length > 0` | 1 | The short-circuited/untaken branch, deliberately left as a bare name. |
| D. Contains an aggregate call anywhere in the expression | 21 | `col_max([...])` — a list literal the grammar rejects, confirmed by parsing it and catching the throw. Detected by **walking the node's own AST**, not by string-matching, and not only when the node itself IS the aggregate (`col_max(X) - col_min(X)` is one plain-expression node whose text still contains two list literals). |

Category D was **discovered while building the gate**, not designed in ahead of
time: the prompt's own two examples (skipped branches, bare aggregate nodes)
did not cover `col_max(CAL_ERR) - col_min(CAL_ERR)` — a single node whose
*origin* is `'expression'`, not `'column-aggregate'`, but whose substituted text
still contains two un-parseable list literals. The first version of this gate
missed it and failed six real GOLDEN cases with `FormulaSyntaxError: Unexpected
character '['`. Fixed by re-parsing the node's own `expression` and walking for
any `Call` whose `callee` `isColumnAggregate`, wherever it appears — not a
text heuristic on the substituted string.

### Two real test-design bugs found and fixed — **in the test, never by widening what counts as excluded**

1. **An empty `customFunctions: {}` registry was wrong.** Eleven GOLDEN/NESTED
   cases failed with `Unknown function 'error'` / `'percent_error'` / `'scale'`
   / `'f'` / `'a'`, because a node's substituted text legitimately still
   contains an unexpanded custom-function CALL (`error(10, 10.5)`) — the trace
   deliberately does not inline a function's body into its caller's text; the
   call's own child node shows that expansion. Builtins (`SQRT`, `ROUND`, ...)
   are context-independent and were already resolvable standalone; custom
   functions are context-DEFINED and need the same registry the original trace
   used. **Fixed by threading the real `customFunctions` from each case's own
   context into the standalone re-evaluation** — proven NOT to weaken the
   invariant by a dedicated test (`a wrong substitution would still be caught`):
   deliberately constructing a substituted string with the wrong argument
   (`err(999, 10.5)` instead of the real `err(10, 10.5)`) and confirming the
   real function still returns the wrong number, which the invariant would
   still catch.
2. **The `notEvaluated` exclusion (category C) never actually throws when
   re-evaluated.** Investigated directly rather than asserted: a short-circuit
   or ternary's DECIDING condition is itself correctly substituted, so
   re-evaluating the substituted text standalone takes the exact same branch
   again and never touches the bare skipped name — proven for both `and`/`or`
   and the untaken ternary branch. This means category C, empirically, never
   fails today. It is still detected and excluded exactly as the prompt
   requires ("detect this case explicitly; do not just catch the parse error
   and move on") — the exclusion decouples this test's correctness from an
   implementation detail of control-flow evaluation order it should not need
   to depend on, not from an observed failure. Documented at length in the
   test file so a future reader does not "simplify" it away.

**No bug was found in `trace.ts` or `evaluator.ts` itself by this gate.** Both
issues above were in the test's own construction of an "empty" context. This is
recorded plainly rather than claimed as a clean pass with nothing learned — the
gate did its job by nearly failing for the wrong reason twice before settling.

---

## Task 2 — Splicing cross-column references

New file: `src/services/recordCalculationTrace.ts` (417 lines) + its own test
suite `src/services/__tests__/recordCalculationTrace.test.ts` (10 tests,
written and passing BEFORE any UI was built on it, per the prompt's explicit
instruction).

### 1. Placement — decided before writing the file, as required

**`src/services/`, not `src/modules/recorder/formula/`.** Same placement
`recorderTemplateMockup.ts` and `recordRecalculation.ts` already use for the
identical reason: ADR-015 D1's separation rule is directional — services may
import from the formula module, never the reverse
(`columnConversionIsolation.test.ts` enforces this structurally for a fixed
file list). This file imports ONLY the formula module's public barrel
(`traceExpression`, `TraceOptions`, `TraceNode`, ...) plus record/template
types — **the formula module gained no new import from this phase at all**,
which is what keeps the rule intact. Putting the splicer inside `trace.ts`
would have required it to know `RecorderTemplate`/`CalibrationRecord` shapes —
exactly the kind of knowledge ADR-015 D1 keeps out of the evaluation path.
Verified: `grep -in conversion src/services/recordCalculationTrace.ts` finds
only comments and `ConversionEquation` (the ADR-013/014 reference-standard
equation type, an unrelated same-named concept — not ADR-015's
`ConversionRule`/`.conversionEnabled`, neither of which appears anywhere in the
file).

`evaluateMockup`'s own loop body was deliberately NOT reused or modified — it
is live, tested code driving real recalculation on every keystroke, and this
phase must not change any computed value. Instead this file mirrors its
STRUCTURE (same `validateColumnFormulas`/`topologicalSort`/
`buildStandardVariables` PUBLIC functions, same evaluation order for rows →
summary → blocks) while calling `traceExpression` instead of `evaluate`, so
the two can never silently evaluate in a different order even though the loop
bodies are separate.

### 2. Cycles

`validateColumnFormulas`'s `evaluationOrder` is already a **partial** order
when a cycle exists (read directly from `topologicalSort`: it stops appending
once a cycle is detected), so a cyclic column is structurally never evaluated
by `evaluateMockup` either — no hang is possible there by construction. What
that left silently missing was a **visible node** for the reader; closed by
`unreachedColumnNode`, which every formula column not reached by
`evaluationOrder` gets instead of being absent.

On top of that, `spliceNode` carries its own `visiting: Set<string>` and a
`MAX_SPLICE_DEPTH = 128` guard, per the prompt's explicit requirement. **Proven
with a real test**, not just asserted: a template with two formula columns
referencing each other was constructed directly (bypassing
`validateColumnFormulas`'s own authoring-time rejection, simulating a snapshot
pinned by an older validator — the prompt's own scenario), and `traceRecord`
was run against it with a wall-clock assertion (`elapsedMs < 1000`). Result: **completed
in well under 1 second**, and at least one side of the cycle carries an explicit
`error.kind === 'invalid-computation'` node whose message names it as circular
— never absent, never a hang.

### 3. Shared subexpressions

Each formula column (per row) and each summary field is traced via
`traceExpression` **exactly once** and memoized (`Map<string, ComputedTraceNode>`,
per row for columns, once record-wide for summary fields). A second column
referencing it gets the SAME already-built subtree spliced in — never a second
`traceExpression` call. Proven directly: `CAL_PCT` and `CAL_DBL` both reference
`CAL_ERR`; the test asserts `find(pct, 'CAL_ERR')` and `find(dbl, 'CAL_ERR')`
are deep-equal AND equal the column's own root trace. The two reference sites
end up as separate JS objects (a shallow copy, so each keeps its own
`parameter`/binding context) with identical content — expandable from either
place with the same result, which is what "traced once, referenced twice"
means here: computation cost, not literal object identity.

### 4. All three contexts

Row (`traceRow`), summary (`traceSummaryFields`), block (`traceBlocks`) — all
three implemented and tested. A summary field referencing a column aggregate
splices to the aggregate's consumed row values (proven: `col_mean(CAL_ERR)`
inside a report-block cell shows each row's fully-spliced `CAL_ERR` subtree,
not bare numbers — down to its own `CAL_IND`/`CAL_NOM` entered leaves). A block
cell referencing `SUMMARY_MAXPCT_PLUS1`, which itself references
`SUMMARY_MAXPCT`, splices two levels deep correctly.

### 5. Values unchanged

Tested directly against `evaluateMockup` for the same template/rows/env: row
formula columns, summary fields, and report-block cells all assert
`trace.rows[i][key].value === mockup.rows[i][key].value` (and the summary/block
equivalents). All pass. No golden value moved.

### 6. Performance — measured, not assumed

30 rows × 13 columns (8 input + 5 chained formula columns, each depending on
the previous) + 2 summary fields (one `col_mean`, one `col_max`), 5 iterations,
averaged:

```
[Phase 33 Task 2] traceRecord: 30 rows x 13 columns (5 formula) + 2 summary fields: 1.65 ms/call
```

**1.65 ms is not remotely close to freezing an interface.** No lazy-expansion
scheme is proposed or needed. (Task 2's own splice memoization is exactly what
keeps this linear rather than exponential in the number of cross-references —
see point 3 above.)

---

## Task 3 — Rendering the trace

### Where it's reachable

`RecordEntryPage.tsx` is the **single route** for viewing a record in every
status (`draft`, `committed`, `reviewed`, `approved`, `superseded`, `voided` —
confirmed by reading the file: `isReadOnly = record.status !== 'draft'`, one
component tree for all of them, gated only by that boolean). The trace is
wired into that same page, so it is reachable everywhere a record can be
viewed at all — not a second surface.

**The mechanism, verified rather than assumed to exist:** `RecordingGrid.tsx`
renders inside a TREB spreadsheet (ADR-007 — extend TREB's public API, never
its internals). TREB has a real, documented public `selection` event
(`treb-embed/src/types.ts`: *"sent when the spreadsheet selection changes. Use
`GetSelection` to get the address"*) — confirmed by reading TREB's own source,
not assumed from the .d.ts alone. `RecordingGrid`'s existing `Subscribe` call
was previously gated `if (!isReadOnly)`, meaning a read-only (committed-or-later)
grid subscribed to **nothing at all** — selection tracking would silently not
have worked on exactly the records where "reachable in any status" matters
most. **Fixed**: the subscription is now unconditional; the pre-existing
`document-change` write-path logic keeps its exact prior `isReadOnly` gate,
moved inside the handler rather than around the whole subscribe call. Diffed
line-by-line: no write-path behavior changed, confirmed by the pre-existing
`RecordingGrid.test.tsx` (38 tests) still passing unmodified.

A new `resolveSelectedTraceableCell` helper maps the selection to a formula
column (main sheet) or summary field (`Summary` sheet, distinguished via
`GetSelection(true)`'s qualified `"<SheetName>!<range>"` form — the one public
way TREB exposes which sheet a selection is on, confirmed by reading
`GetSelection`'s implementation, not guessed). Reported to the caller via a new
`onCellSelect` prop; `RecordEntryPage` shows a "View calculation" button,
enabled only when a formula/summary cell is selected, that lazily builds the
trace and opens the modal.

**Scope boundary, stated plainly:** report-block cells have **no rendering
surface anywhere in `RecordEntryPage`/`RecordingGrid` today** — grepped
directly (`grep -rln "reportBlocks\|ReportBlock" src/pages/*.tsx
src/modules/recorder/components/*.tsx`): the only hit is the template
BUILDER, not record entry/viewing. `traceRecord`'s block-tracing (Task 2, item
4 above) is fully implemented and tested as a pure function, but there is
currently nothing in the UI a user could select to reach it — because there is
nothing in the UI that renders a block cell at all yet. Not a Phase 33 gap;
a pre-existing one, named here rather than silently worked around.

### How "read-only" was verified, not assumed

- `CalculationTraceModal.tsx` has no `onChange`, no form input, no service
  import at all — checked by its own test asserting zero calls to a mocked
  `calibrationRecordService.updateDraftRecord`/`commitRecord` after rendering
  AND after every interaction (expand/collapse, close) — plus a direct DOM
  assertion that the modal contains no `input`/`textarea`/`select`/
  `contenteditable` element anywhere.
- A dedicated `RecordingGridSelection.test.tsx` test (`REQUIREMENT 2`) clears
  every write-method mock (`SetRange`/`ApplyStyle`/`SetValidation`/`Batch`)
  immediately after mount, fires a `selection` event on both a draft AND a
  read-only grid, and asserts none of them were called afterward — proving a
  selection event triggers zero writes, in either mode.
- `REQUIREMENT 1` in the same file fires a selection event on a grid mounted
  with `isReadOnly={true}` and confirms `onCellSelect` still receives the
  correct cell — proving the fix above (unconditional subscribe) actually
  closes the gap it was meant to close.

### What each line shows

Full precision value, the source expression, the substituted expression
(muted, monospace, directly under the value line), and — per requirement 4 —
**provenance printed as visible text on the line itself** (`entered`,
`computed`, `reference standard`, `template constant`, `environment`,
`record`), never a hover/tooltip. Verified by a dedicated test asserting the
provenance strings are present as ordinary rendered text nodes. Inputs that
were themselves computed expand in place (a `−`/`+` toggle per node with
children); the root starts expanded, everything else starts collapsed — kept
this way deliberately, matching ADR-018 D3 ("nothing is hidden; nothing is
unrolled by default" for a node's OWN children, while the root itself should
be immediately readable without an extra click).

### "Plain, conventional React" (requirement 6)

No context, no reducer, no external state library — one `useState` per
expandable node (`expanded`, initialized once from `depth === 0`), plain
Tailwind classes matching `RecordSignOffModal.tsx`/`VoidRecordModal.tsx`
exactly (`fixed inset-0 z-50 ... bg-black/40`, `createPortal`, rounded-xl white
panel). `traceNodeToLine` (trace.ts) was read and deliberately NOT reused
as-is: it produces one flattened string per node, which is right for a log
line but wrong for a UI line that needs the provenance badge, the value, and
the substituted expression to be visually distinct (color, size, spacing) —
so the modal renders the same fields structurally instead. `traceNodeToLine`
remains useful for logs/debugging and is untouched.

---

## Task 4 — Flagging what is NOT traced

**Implemented, tested, non-negotiable per the prompt — not deferred.**

`CalculationTraceModal` accepts an `isConversionEnabled(label): boolean`
callback. `RecordEntryPage` supplies it from the template's own
`column.conversionEnabled` flags (built once per template in a `useMemo`,
alongside the display-name map). Every node in the rendered tree — root AND
every nested/spliced input, checked by label on each recursive render — whose
label names a conversion-enabled formula column shows this marker immediately
under its expression line:

```
⚠ This trace shows the value BEFORE display-time unit conversion (ADR-015).
  The figure actually shown on the grid or certificate for this cell may
  differ — conversion is not covered by this trace.
```

**Exact rendering** (from the component's own test assertions, which match
this string verbatim): the warning text is
`/BEFORE display-time unit conversion/`, rendered inside an amber-bordered box
(`border-amber-300 bg-amber-50 text-amber-800`) — the same amber the grid
already uses for ADR-015 D6 conversion-failure cells
(`CONVERSION_FAILURE_STYLE` in `RecordingGrid.tsx`), so the visual language is
consistent with what a user has already learned to associate with "conversion
concern" elsewhere in the same grid.

Proven to appear **on the spot, everywhere it applies, not just at the root**:
a dedicated test flags a NESTED input (not the root) as conversion-enabled and
asserts the warning appears exactly once, attached to that specific node — not
globally, not only at the top of the modal. A second test proves the negative:
nothing is shown when no column is conversion-enabled, so the marker is not a
permanent fixture that would train reviewers to ignore it.

**Explicitly NOT wired in this phase**, per the prompt's own instruction:
display-time unit conversion itself is not computed or traced here — only
flagged. `columnConversion.ts` was not touched (`git status` confirms no
changes to it, `convertColumnDisplayValue` is not imported anywhere in the new
files). ADR-015 D1's separation stays intact; the actual conversion tracing is
future work, correctly left to a phase that can own the services-side wiring
properly.

`displayValue`'s "cannot prove what is printed" gap (Phase 32 blind spot 7) is
**closed for this specific integration**, though the type remains technically
caller-supplied: `RecordEntryPage`'s `formatDisplay` calls the REAL
`formatColumnValueForDisplay` (the documented single source of truth for
ADR-011 rendering), so every node belonging to a column with a `NumberFormat`
now carries the actual displayed figure, not a placeholder.

---

## Blind spots from PHASE_32_RESULT.md — what changed

| # | Blind spot | Status after Phase 33 |
|---|---|---|
| 1 | Display-time unit conversion not traced | **Unchanged, but now visibly flagged** (Task 4) — was silent before, is loud now. Not closed; closing it is explicitly out of scope. |
| 2 | Cross-column/field nesting not spliced | **Closed** (Task 2) — row, summary, and block references all splice correctly, to arbitrary depth, with cycle protection. |
| 3 | Compound custom-function argument gets no subtree | Unchanged. Still a documented gap (category B in Task 1's gate). |
| 4 | Failing column aggregate produces no aggregate node | Unchanged. Not addressed this phase. |
| 5 | A failed name carries no resolution branch | Unchanged. |
| 6 | Builtin functions are opaque | Unchanged, by design (ADR-018 D3). |
| 7 | `displayValue`/reference-standard identity are null unless supplied | **Closed for the `RecordEntryPage` integration** specifically (Task 4) — both are now correctly wired end to end. The TYPE remains caller-supplied; a different caller could still omit them. |
| 8 | Custom function body needs source text supplied | Unchanged; `RecordEntryPage`'s wiring supplies it correctly via `customFunctionToSource`. |
| 9 | Record → PDF transfer (ADR-018 D4) not addressed | Unchanged. Still out of scope. |

**Newly identified this phase, not present in Phase 32's list:**

- **Report blocks have no UI surface at all** (noted under Task 3) — not a
  regression, a pre-existing gap this phase's UI work made newly visible by
  contrast (row/summary cells are now reachable; block cells structurally
  can't be, because nothing renders them).
- **`recorderTemplateValidation.ts`'s `customFunctionToSource`** wraps a
  function body in `def name(...):\n    return <expr>` for the EVALUATOR's
  parser; `recordCalculationTrace.ts` needed the body text ALONE (what
  `TraceOptions.functionSources` wants), and `buildCustomFunctions` was
  written correctly the first time (`sources[def.name] = fn.expression`, the
  raw field, not the wrapped source). **But this was a near-miss caught by
  RULE 1 discipline while writing this report, not by the original test
  suite**: every orchestrator test up to that point used `customFunctions: []`
  — the path was never actually exercised, so a claim that the tests had
  caught anything would have been false. Verified this directly (grepped the
  test file for `customFunctions`), then added the missing case — a template
  whose formula column calls a custom function — asserting the expanded
  body's `expression` is the bare `'i - n'`, not `'def err(n, i):\n    return i - n'`.
  It passes. The lesson recorded here deliberately: a correct implementation
  with no test for the specific thing that could go wrong is not yet a
  verified one.

---

## Test counts

| | Test files | Tests |
|---|---|---|
| Before Phase 33 (end of Phase 32) | 77 | 1602 |
| After Phase 33 | 81 | 1716 |
| Added | +4 test files, +1 fixtures module (no tests of its own) | **+114** |

Breakdown of the +114:
- `traceSubstitutionInvariant.test.ts` (Task 1, the gate): 85
- `recordCalculationTrace.test.ts` (Task 2, orchestrator): 11 (includes the custom-function regression case added while writing this report — see "Newly identified this phase" above)
- `RecordingGridSelection.test.tsx` (Task 3, selection tracking): 7
- `CalculationTraceModal.test.tsx` (Task 3/4, the modal): 11

**No existing test was modified.** `git diff` on every pre-existing `*.test.ts`/
`*.test.tsx` file is empty — confirmed directly, not asserted. Two pre-existing
files were modified for real functionality (`RecordingGrid.tsx`,
`RecordEntryPage.tsx`); their own pre-existing tests
(`RecordingGrid.test.tsx`, 38 tests) pass unmodified, confirming no
regression to the write/feedback-loop guards those tests exist to protect.

`npx tsc --noEmit`: clean throughout every step of this phase. `npm test`:
81 files, 1716 tests, all passing, at the end of the phase.

---

## Verification boundary — stated honestly

The dev server was started and the app loads cleanly (title, login form
render; zero console errors) — confirming the build/bundle is not broken by
any change in this phase. **A live, authenticated click-through — selecting a
real cell in a real record and confirming the modal opens with correct
values — was NOT performed**, because reaching an actual `CalibrationRecord`
requires signed-in Firebase credentials this session does not have and should
not attempt to obtain. Verification instead rests on the 113 new automated
tests above, which exercise the real component code paths (TREB event
handling via a faithful mock, real `traceRecord`/`traceExpression` calls
against real templates, real React rendering and interaction via Testing
Library) rather than end-to-end browser interaction. This is a real gap
between "verified by test" and "verified by using the feature," named here
rather than glossed over.

## Constraints — confirmed honored

- No computed value changed: proven directly (Task 2, item 5) against
  `evaluateMockup`, not assumed.
- No existing test modified: `git diff` on every existing test file is empty.
- Nothing writes to Firestore: no import of `firebase`/`firestore` anywhere in
  the five new files (`trace.ts` unchanged from Phase 32;
  `recordCalculationTrace.ts`, `CalculationTraceModal.tsx`,
  `traceGoldenFixtures.ts` all grepped clean).
- Display-time unit conversion not wired: confirmed above.
- No dependency added: `package.json`'s `dependencies`/`devDependencies` are
  untouched this phase (only Phase 31A's earlier `test` script change stands).
- No Task 1 exclusion widened to dodge a failure: both real bugs found were
  fixed in the TEST's own context construction (custom-function registry,
  aggregate-detection scope), never by loosening what counts as excluded —
  documented at length, with a dedicated test proving the fix does not blind
  the gate to a genuine substitution error.
