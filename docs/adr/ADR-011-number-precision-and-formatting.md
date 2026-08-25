# ADR-011: Full-precision storage, round-on-display, explicit per-column notation

Date: 2026-07-30
Status: Accepted
Closes: the decimal-precision open question left by [ADR-001](ADR-001-expression-interpreter.md)

## Context

JavaScript `number` is IEEE 754 binary floating point, so decimal values are not
represented exactly:

```js
0.1 + 0.2      // 0.30000000000000004
1.005 * 100    // 100.49999999999999
```

Record columns declare decimal places, and certificates print values at declared
precision. Three strategies were considered: round-on-display, round-on-store, and
an arbitrary-precision decimal library.

A separate requirement emerged during review: values may be extremely large or
small, so **scientific notation** must be available (e.g. `7.882E+21`).

## Decision

### 1. Storage is full precision; rounding happens only at display

Stored values retain full computed precision. Rounding to declared decimals occurs
only when a value is **rendered** — in the grid, and in the PDF.

Formula inputs therefore consume **unrounded** values. Intermediate results are
never rounded before being fed downstream.

### 2. Notation is an explicit per-column choice

```ts
interface NumberFormat {
  notation: 'fixed' | 'scientific';
  decimals: number;   // fixed: decimal places
                      // scientific: mantissa decimal places
}
```

- The author chooses `fixed` or `scientific` per column. There is **no
  magnitude-based auto-switching** — a column renders one way, always.
- **`decimals` serves both modes.** In `scientific`, it controls mantissa
  precision, so `decimals: 3` yields `7.882E+21`. No second precision field.
- Scientific rendering: uppercase `E`, always-signed exponent, no exponent
  zero-padding.

## Rationale

Round-on-display is aligned with **standard metrological practice**. The GUM
advises against rounding intermediate results, because premature rounding injects
error into the calculation chain. Carrying full precision and rounding only the
reported value is the numerically correct approach, and it keeps the stored record
as the lossless source of truth — anything can be re-derived from it at any time.

This was chosen over round-on-store deliberately, accepting the trade-off in the
next section.

Explicit per-column notation was chosen over auto-switching because a calibration
certificate benefits from predictability: an author who sets a column to `fixed`
knows every cell in it will print the same shape, and a column whose rendering
silently changes based on magnitude is harder to proofread and harder to align in
a table.

## Consequences

Positive:

- No compounding rounding error through chained formulas.
- The stored record is the full-precision truth; re-derivation is always possible.
- Column rendering is fully predictable — no surprise notation changes.
- `decimals` is reused rather than duplicated, so the column editor gains only a
  notation selector.

Negative and accepted:

- **Printed certificates may not self-reconcile.** Because the calculation used
  unrounded inputs, recomputing from the *printed* figures can produce a slightly
  different final digit than the one printed. Worked example at 3 decimals:

  ```
  mean of rounds = 2.3455        prints "2.346"
  correction = mean x 1.02
    actual:  2.3455 x 1.02 = 2.39241  prints "2.392"
    from printed figures: 2.346 x 1.02 = 2.39292  -> "2.393"
  ```

  **Mitigations:** treat this as documented policy so it is explainable to an
  assessor; and where a specific report must reconcile on its face, increase the
  declared decimals on intermediate columns so the printed precision is
  sufficient to reproduce the result.

- **Stored and displayed values differ.** Anyone reading the database directly
  sees more digits than the certificate. This must be understood as intended
  behaviour, not a defect.

- A column fixed to `scientific` will render small ordinary values awkwardly
  (`5.000E-1` rather than `0.5`). The author owns that choice per column. If this
  becomes a recurring annoyance in practice, magnitude-based auto-switching is the
  natural revision to this ADR.

- Binary floating-point artifacts are **not eliminated**, only hidden by display
  rounding. A value stored as `0.30000000000000004` prints as `0.300`. This is
  accepted; the decimal-library option was declined.

## Interaction with other decisions

- **Aggregates (ADR-010)** operate on **unrounded** stored values, so `col_mean`
  is the mean of the true values, not of the displayed ones. This is consistent
  with the round-on-display principle.
- **Strict empty semantics (ADR-010)** are unaffected — an empty input errors
  regardless of formatting.
- **PDF rendering (ADR-004)** must apply column formatting when building table
  cells, so `measureRecordTableHeights` measures the *formatted* string, not the
  raw value. Scientific notation strings have fairly uniform width, which helps
  column sizing.

## Rejected alternatives

- **Round-on-store** — certificates would self-reconcile exactly, the strongest
  audit position, but it rounds intermediates and so is less numerically accurate.
  Rejected on metrological grounds.
- **Decimal library (`decimal.js` / `big.js`)** — eliminates binary artifacts
  entirely and could combine with either rounding policy. Rejected as
  disproportionate: it adds a dependency and requires every arithmetic operation
  in the interpreter to route through `Decimal` objects instead of native
  operators.
- **Magnitude-based auto-switching** with author-set thresholds — handles
  occasionally-extreme columns gracefully, but makes rendering unpredictable.
- **`7.882 x 10^21` superscript style in the PDF** — closer to formal certificate
  typography, but requires superscript support in the PDF text layer and would
  diverge from the grid's `E` notation.
