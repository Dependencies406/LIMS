# ADR-015: Display-time unit conversion for non-force units

Date: 2026-08-17
Status: Accepted

**Amends [ADR-014](ADR-014-equipment-register-is-the-reference-standard.md) D5** — not
its arithmetic, which stands unchanged, but its principle that unit conversion is
*always* visible in the author's own formula. See D7.

**Extends [ADR-011](ADR-011-number-precision-and-formatting.md)** — the precedent that a
displayed value may legitimately differ from the stored value.

## Context

Phase 15 gave a column header a unit. It is deliberately a **label**: no evaluation path
reads it, because ADR-014 D5's correction records what a second unit mechanism did
(`ConversionEquation.divisor`, every force wrong by exactly that factor, silently).

That leaves a real gap. Force units convert exactly today — `forceUnits.ts` normalises
N/kN/kgF/gF through newtons with `g = 9.80665`, and `9.80665 / 0.00980665 = 1000`
exactly, so kgF and gF cannot disagree by a factor of 1000 through a typo. But
**everything outside the force family has nothing**: mV/V, %, mm, °C, dimensionless
ratios. A column computing in one of those and headed with another is simply mislabelled.

The owner asked for a conversion handler. The risk in granting it is obvious from this
project's own history: it would be the third unit mechanism, after the newton table and
the retired `divisor`.

The grilling session of 2026-08-17 resolved this by moving the feature out of the
arithmetic entirely.

## Decisions

### D1 — Conversion is a DISPLAY concern, never an evaluation concern

The formula engine, the validator, the evaluator and the recalculation services do not
know conversion exists. A converted column's **stored value is the raw computed value**;
conversion is applied when the number is rendered — grid, PDF, read-only view.

Consequences, all of them the point:

- ADR-010's empty-value semantics are untouched.
- Phase 15's invariant — no evaluation path reads a unit — **survives**.
- A downstream formula referencing a converted column sees the **raw** value, so two
  chained columns cannot double-convert. This is the ADR-014 D5 failure mode, and D1
  makes it structurally impossible rather than merely tested against.
- Storage stays in one consistent unit space, which is what makes historical records
  re-computable.

This follows ADR-011's precedent exactly: full precision stored, presentation applied at
the edge. Conversion happens at **full precision, before** display rounding — never
after, which would round twice.

### D2 — A shared conversion-rule library, keyed by unit pair

Rules live in one admin-managed collection, reusable across every template — the same
shape as the equipment register and its conversion equations, not per-template copies
that drift.

A rule is `(fromUnit, toUnit, expression)`. Lookup happens **at render time**, from the
column's declared source unit and the header's *actual* unit.

Render-time lookup is what makes this work with Phase 15's `selectable` and `sameAs`
header modes: when a technician picks the unit per record, the pair needing conversion is
not known until then. Binding a specific rule to a column at template time would break
the moment the header became selectable.

### D3 — The author declares each converted column's source unit

Unit inference over arbitrary expressions is a type system. `STD_C1*R` yields the
equation's output unit; `STD_C1*R*STD_TO_N/REPORT_TO_N` yields the report unit; `A-B`
yields whatever `A` and `B` were. Inferring this in general is out of proportion to the
problem, and every unhandled case would be a silent wrong answer.

So the author declares it, per column, beside the header unit.

**Cross-checked, not trusted.** When the column's expression uses `STD_C*`, the declared
source unit is compared against the selected standard's `outputUnit`, and a disagreement
warns. A wrong declaration is the one way this design produces a wrong number, so it gets
the same treatment as `checkDivisorAgreement`: surfaced, not silently honoured.

### D4 — Rules are pure, with exactly one input

The expression sees one variable: the column's value. `VALUE * 1000`, `VALUE * 9.80665`,
`(VALUE - 32) * 5 / 9`.

It may **not** reference other columns, `ENV_*`, `STD_*` or `SUMMARY_*`. A conversion that
depends on the rest of the row is not a conversion — it is a formula, and formula columns
already exist for that. Keeping rules pure makes them cacheable, testable in isolation,
and safe to share across templates.

Rules are written in the **existing formula language**, parsed by the existing parser. No
second expression syntax.

Note that an arbitrary expression gives offset conversions (°C↔°F) for free, which a
single multiplier could never express.

### D5 — Force-to-force rules are rejected

A rule whose `fromUnit` and `toUnit` are **both** `ForceUnit` values is refused at save,
naming `STD_TO_N / REPORT_TO_N` as the correct route.

The newton table is exact, tested, and already covers all sixteen pairs. A hand-entered
rule for those pairs would be a second implementation of something already correct — and
a transcription error in it would be indistinguishable from a real measurement.

This is the boundary that keeps D1 from becoming the third mechanism: **the handler
serves only the pairs the newton table cannot.**

### D6 — Failure shows the raw value, clearly flagged

No rule for the pair, an expression that errors, a division by zero, a non-finite result:
the cell shows the **unconverted value with a visible marker**, and the failure is listed
in the record's warnings.

Not blank, because the column computed perfectly well and hiding it destroys usable work.
Not silent, because a value in one unit under a header claiming another is precisely the
defect this whole line of work exists to remove.

Never an exception that reaches the render tree.

### D7 — The commit snapshot records the conversion

ADR-014 D5 kept conversion visible in the author's formula so a reviewer could see it.
D1 makes it implicit in the UI, so that traceability must be restored elsewhere:
**at commit, each converted cell snapshots the rule applied, its expression, the source
unit, the target unit, and both the raw and converted values.**

An assessor can then reconstruct every printed number without the live rule library —
which matters because rules are shared and editable, and ADR-005's whole premise is that
a committed record does not move when live configuration changes.

The certificate prints the **converted** value, because the header claims that unit.

### D8 — Resolution order

Per cell, at render:

1. Compute the raw value (unchanged — the engine is untouched).
2. Determine the **source unit**: the author's declaration (D3), cross-checked against
   the standard's `outputUnit` when the expression uses `STD_C*`.
3. Determine the **target unit**: the header's effective unit — fixed, the record's
   selection, or resolved through a `sameAs` chain.
4. If source equals target, or the column has conversion disabled, stop. No rule needed.
5. Look up a rule for `(source → target)`. None found → D6.
6. Apply it at full precision, then apply ADR-011 display rounding.

### D9 — Opt-in, formula columns only

Conversion is enabled per column by an explicit control, and offered only on `formula`
columns. Input and text columns hold what the technician typed; silently redisplaying
their entry in another unit would misrepresent the record of what was observed.

## Consequences

Positive:

- The engine, validator and stored data are untouched — this is additive at the edge
- Chained double-conversion is structurally impossible, not merely tested against
- Works with Phase 15's selectable and `sameAs` headers via render-time lookup
- Offsets come free from using the existing expression language
- One shared rule library rather than per-template copies
- Force conversion keeps its single exact implementation

Negative and accepted:

- **Stored and displayed values now differ for converted columns.** Precedented by
  ADR-011, but it is a genuine cognitive cost, and anyone reading Firestore directly must
  know it.
- A wrong source-unit declaration produces a wrong displayed number. Mitigated by the D3
  cross-check, not eliminated — the author can still declare a non-standard column wrongly.
- Snapshots grow, carrying per-cell conversion provenance.
- ADR-014 D5's "conversion is always visible in the formula" no longer holds universally.
  It still holds for force, which is the certificate-critical path.
