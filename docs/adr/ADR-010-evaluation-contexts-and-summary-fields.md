# ADR-010: Two evaluation contexts — row formulas and summary fields

Date: 2026-07-30
Status: Accepted

## Context

The design as previously agreed had **only row formulas producing formula
columns**. Combined with ADR-001's deliberate exclusion of loops and
comprehensions, that left **no way to compute any record-level value** — no max
deviation, no mean error, no overall pass/fail.

This is a gap in the domain model, not in the requirements draft, which never
raised the topic. But the existing PDF layer already assumes such values exist:

- `SpreadsheetDataKey` exposes `measurementResult` (`types/pdfTemplate.ts:139-146`)
- the spreadsheet section offers `measurements.pass_fail` and
  `measurements.summary` (`SpreadsheetSection.tsx:90-94`)

Under the design as it stood, **neither had any source.** A calibration
certificate reporting a hand-typed maximum error that no formula verifies is a
weak position for accreditation.

## Decision

Introduce a **second evaluation context**.

### 1. Row context (existing)

- Evaluates **once per row**.
- Visible names: `SECTIONID_COLUMNID` (current row only), and `ENV_*` broadcast
  scalars (ADR-009).
- Produces **formula columns**.
- Row formulas may reference other formula columns; evaluation order is a
  **topological sort per row**, with cycle detection at authoring time.
- **Row formulas may NOT reference summary fields.** Summary fields depend on all
  rows, so allowing this would be circular. This is a hard invariant.

### 2. Summary context (new)

- Evaluates **once per record, after all rows are complete**.
- Visible names: `ENV_*` scalars, other `SUMMARY_*` fields, and **column
  aggregates**.
- Produces **summary fields**, referenced as `SUMMARY_<fieldId>`.
- Summary fields may reference other summary fields; topologically sorted with
  cycle detection.
- **`SUMMARY` is a reserved section id**, alongside `ENV`.

### Column aggregate functions

Whitelisted, and valid **only in the summary context**:

`col_mean` · `col_max` · `col_min` · `col_sum` · `col_count` · `col_stdev`

- The argument must be a **bare column reference**, not an expression —
  `col_mean(READ_R1)` is valid, `col_mean(READ_R1 * 2)` is not. This keeps them
  trivially statically checkable and avoids implying a mapped computation.
- They operate over **all rows**, skipping empty values.

### Schema

```ts
interface SummaryField {
  id: string;                 // referenced as SUMMARY_<id>; /^[A-Z][A-Z0-9]*$/
  label: string;
  type: 'number' | 'text';
  decimals?: number;          // type 'number'
  expression: string;         // evaluated in summary context
}
```

Added to `RecorderTemplate` as `summaryFields: SummaryField[]`, and to the
Record as an evaluated `summary: Record<string, string | number | null>`.

Pass/fail needs no special support — the ternary is already in the subset:

```python
def verdict(maxdev, tol):
    return "PASS" if maxdev <= tol else "FAIL"
```

### PDF binding

Summary fields become bindable data sources (`record.summary.<id>`), giving
`measurementResult` and `pass_fail` a real, verifiable source.

## Consequences

Positive:

- Certificates can report computed, auditable summary values instead of
  hand-entered ones.
- Closes the gap between the record model and what the PDF layer already expects.
- Aggregates stay out of row formulas, so a row formula always means
  "this row" — no Excel-style mixed-reference ambiguity.
- Still no loops. The aggregate functions supply the row-spanning computation
  that ADR-001 deliberately withheld from the language, without reopening the
  subset.

Negative and accepted:

- **A second evaluation context in the interpreter.** More implementation, and
  the validator must be context-aware: `col_mean` in a row formula is an error,
  and `SUMMARY_X` in a row formula is an error.
- Two more things for the template author to learn, and the authoring UI needs a
  separate summary-fields panel distinct from the column editor.
- The evaluation pipeline gains ordering constraints: all rows, then summary.
  Realtime recalculation must re-run summary evaluation whenever any contributing
  cell changes, which is a broader invalidation than per-row recalculation.

## Rejected alternatives

- **Aggregates usable inside row formulas too** (broadcast, like an Excel
  absolute reference) — one context instead of two and more flexible, but it
  makes "what does this row's formula mean" genuinely ambiguous and invites
  accidental circularity.
- **Out of scope for now** — fastest, but leaves the PDF fields unsourced and
  puts unverified numbers on certificates.

## Evaluation semantics for empty values — decided: strict

An empty cell holds an **empty/blank value, not zero**. If an empty value is
consumed by a formula or any calculation, the result is an **error**.

This applies to both contexts. Column aggregates **error if any contributing row
is empty** — they do not skip empties. A maximum deviation or mean error computed
over an incomplete data set is meaningless, so erroring is the coherent
behaviour, and it makes incompleteness impossible to overlook.

Rejected: empty-propagates (blank in, blank out). It reads more like a
conventional spreadsheet, but a blank computed cell is ambiguous on a calibration
record — it cannot be distinguished from "not applicable", which is exactly the
confusion a certificate must not contain.

### Required UI consequence

Because row count is set by the technician during recording, formula columns and
summary fields **will show errors for most of the data-entry session**. The UI
must therefore distinguish:

- **Awaiting input** — an input this expression depends on has not been entered
  yet. Expected, transient, should be visually quiet.
- **Invalid computation** — division by zero, a genuine type mismatch, a value out
  of domain. A real mistake, should be prominent.

Both are errors in the evaluator's terms, but conflating them in the UI would make
a half-filled record a wall of red and train technicians to ignore error styling —
which defeats the purpose of the strict semantics.
