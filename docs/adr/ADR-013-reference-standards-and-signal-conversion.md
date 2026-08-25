# ADR-013: Reference standards, per-row selection, and signal-to-force conversion

Date: 2026-08-04
Status: Accepted

## Context

The laboratory calibrates Universal Testing Machines against reference force
transducers. The existing process lives in `Master-Force.xlsb`, whose live pipeline
is `LCDB` → `Raw Data_1st/2nd Direction` → `Relative Error_*` → `Unc. Budget_*` →
`Report_*`.

The reference transducer outputs a signal in **mV/V**. Force is recovered by
evaluating a polynomial whose coefficients come from the transducer's own
NIMT-traceable calibration certificate. A single UTM calibration spans a force range
no one transducer covers at acceptable uncertainty, so several standards are used
across one run.

Four things about the workbook drove this ADR.

### 1. The workbook's conversion formula is wrong

The sheet **documents** (cells C12–C14, and explicitly on the orphan `Raw_Data`
sheet):

```
F = A·R + B·R² + C·R³
```

The sheet **implements** (D21, G21, J21, M21 …, every reading, both directions):

```
=IF(C21="","",ROUND((($O$12*C21) + ($O$13*C21^2) + ($O$14*C21)) / $O$15, 5))
                                                   ^^^^^^^^^^^ C·R, not C·R³
```

`A·R + B·R² + C·R` collapses to `(A+C)·R + B·R²` — the cubic term is absent and C is
effectively folded into A.

**Numerical evidence, using `CAL-FRC-001`** (A = 25.001904548237,
B = −0.039616880251316, C = 0.075709296790966):

| R (mV/V) | `A·R + B·R² + C·R³` | `A·R + B·R² + C·R` | Nominal |
|---|---|---|---|
| 0.04 | **1.00002** | 1.00304 | 1 N |
| 0.4 | **9.99927** | 10.02471 | 10 N |

The cubic form reproduces the nominal calibration points; the implemented form does
not. The discrepancy is `C·R·(1 − R²)`, so relative error ≈ `C·(1 − R²)/A`:

- **≈ +0.30 %** as R → 0 — worst at the bottom of range
- **exactly zero at R = 1**, which is why this survived undetected
- **negative above R = 1** — under-reads at the top

For a standard whose `u_cal` is 0.047 %, a 0.30 % systematic error is roughly **six
times the standard's own claimed uncertainty**.

**The owner confirmed (2026-08-04) that A/B/C come from the NIMT calibration
certificate**, entered manually. They are therefore genuine cubic coefficients fitted
by the traceable laboratory, and the workbook's third term is a defect — not a
deliberate simplification with matched coefficients.

### 2. The standard is selected as unvalidated free text

`K2` holds the operator's chosen standard as a string that must exactly match
`LCDB` column B — a free-text label encoding equipment code, capacity, direction and
sub-range, e.g. `CAL-FRC-003 (20 kN, Tensile 2-20 kN)`. Only `F9` has list
validation; `K2` does not. A typo yields `#N/A`/`""` silently through every
downstream lookup.

### 3. One standard per sheet, but the work needs several

The live sheets support a single standard per direction. The unwired `Raw_Data` sheet
is an in-progress redesign supporting several, plus a unit matrix over N/kN/gF/kgF
using g = 9.80665. It is referenced by nothing.

### 4. Unit reconciliation is a hard-coded 2×2 matrix

`O15` enumerates the four (UUC unit, standard unit) pairs across N and kN, yielding
1, 10⁻³ or 10³. Adding gF/kgF means extending the matrix combinatorially.

## Decisions

### D1 — Implement the documented cubic

Force is `Σ cᵢ · Rⁱ`. The workbook's linear third term is **not** replicated.

Coefficients are stored as an **ordered array**, not as three named fields:

```ts
/** coefficients[i] multiplies R^i. coefficients[0] is the constant term. */
coefficients: number[];
```

This accommodates whatever degree a future certificate supplies — degree 2, 4, or
higher — with no schema change. The current data is degree 3 with a zero constant
term.

> ### ⚠ CONSEQUENCE FOR ISSUED CERTIFICATES
>
> Every force value this workbook has produced is high by up to ~0.30 % at the low
> end of range, and low above R = 1. That propagates into relative error, machine
> class determination, and the certificate.
>
> **This ADR does not decide what happens to certificates already issued.** That is
> the owner's decision, and plausibly their accreditation body's. It is recorded here
> so the decision is made deliberately rather than discovered later.

### D2 — `ReferenceStandard` as a first-class entity

One document per **configuration** — a physical transducer plus a direction and
sub-range slice. A 250 kN cell yielding four LCDB rows becomes four documents.

The **document id is the stable key.** The LCDB column-B label becomes a display
name and may be edited freely, because nothing keys on it. This retires the
exact-string-match failure mode by construction, and follows the same reasoning as
ADR-012.

Fields: display name, equipment code, instrument name, range text, calibration and
due dates, traceability, manufacturer, model, accessories, serial number,
`coefficients[]`, input unit, output unit, resolution, and the uncertainty
contributors `u_cal`, `A`, `B`, `C` (all %).

**Manual entry from the certificate is the intended workflow.** The form must show
the equation being described (`F = c₁R + c₂R² + c₃R³`) next to the coefficient inputs,
so whoever transcribes the certificate can see what they are populating. The absence
of exactly that display is what let the workbook's defect persist.

### D3 — Per-row standard selection via a new `standard` column type

The owner confirmed selection is **per calibration point**, by dropdown.

A new column type `standard` renders a picker over active reference standards. The
stored cell value is the standard's document id.

The picker **should warn, not block**, when the selected standard's range does not
bracket that row's force level, or its direction disagrees with the row's direction.
Choosing a standard is the metrologist's judgement; the system flags the improbable
without overriding it.

### D4 — A reserved `STD_` namespace, resolved per row

Exactly the ADR-009 pattern that added `ENV_TEMP_R1`: a reserved prefix resolved by
the validator, **no grammar change**.

`STD_*` resolves from the standard selected **in the current row**:

| Variable | Meaning |
|---|---|
| `STD_C0` … `STD_C5` | Polynomial coefficient for Rⁱ |
| `STD_TO_N` | Multiplier converting the standard's output unit to newtons |
| `STD_UCAL`, `STD_UA`, `STD_UB`, `STD_UC` | Uncertainty contributors (%) |
| `STD_RESOLUTION` | Standard's resolution |

`STD` joins `ENV` and `SUMMARY` as a reserved section id.

**Coefficients are exposed as variables rather than hidden inside a built-in
conversion function, deliberately.** The formula then appears on the page:

```
force_N(STD_C1, STD_C2, STD_C3, M_R) * STD_TO_N / UUC_TO_N
```

with the author's own custom function:

```python
def force_N(c1, c2, c3, r):
    return c1*r + c2*r**2 + c3*r**3
```

This needs **no new engine machinery** — it is exactly ADR-001's
`functionName(A_B)` shape, a pure function taking its inputs as arguments. More
importantly, the conversion is *visible and reviewable* rather than buried. A hidden
`STD_FORCE()` builtin would reproduce the precise condition that allowed the Excel
defect to survive: a formula nobody could see.

> **Exception to ADR-010's strict empty semantics.** A coefficient slot beyond the
> stored degree resolves to **0**, not to an error. A polynomial's absent higher
> terms genuinely *are* zero — this is not missing data. The exception is confined to
> `STD_C0`…`STD_C5`; every other empty remains an error. A row with **no standard
> selected at all** is `awaiting-input`, as normal.

### D5 — Normalise units through newtons

Replace the 2×2 matrix with a single factor per unit:

| Unit | → N |
|---|---|
| N | 1 |
| kN | 1000 |
| kgF | 9.80665 |
| gF | 0.00980665 |

Conversion becomes `value * STD_TO_N / UUC_TO_N`. Any unit pair works; adding a unit
means adding one row, not extending a matrix. This also delivers the gF/kgF support
the orphan `Raw_Data` sheet was reaching for.

### D6 — Snapshot the standard at commit

A record **snapshots each row's standard** — coefficients, uncertainty contributors,
serial number, calibration and due dates — at the moment of commit.

Non-negotiable: when a transducer is recalibrated its coefficients change, and every
historical certificate must keep the values actually used. Identical reasoning to
ADR-005's template version pinning, and the same failure mode if omitted.

The system should also **warn if a selected standard's due date has passed** relative
to the calibration date being recorded. Calibrating against an out-of-calibration
standard is an accreditation finding.

### D7 — One record, one or two directions

Confirmed by the owner: **one record**, with the operator choosing whether the run
covers one direction or both.

- The record declares which directions are in scope
- Each row carries its direction
- A reserved `ROW_DIRECTION` variable is available to formulas, though most templates
  will not need it
- The report template decides whether to print one direction or both, which is what
  the workbook's separate `Report_1 Direction` / `Report_2 Directions` sheets were
  doing by duplication

### D8 — Per-point uncertainty budget

Confirmed by the owner. Because `STD_UCAL`/`STD_UA`/`STD_UB`/`STD_UC` are row-scoped
(D4), each point's budget contributors come from the standard actually used for that
point. Budget components become ordinary row formula columns and **fall out of D4 for
free** — no separate mechanism.

This is the metrologically correct answer once standards can differ within a record,
and the workbook's single-standard budget sheet cannot express it.

### D9 — Precision follows ADR-011, not the workbook

The workbook hard-codes `ROUND(…, 5)` in the conversion cells while
`Relative Error_*` rounds to a UUC-resolution-derived count — two disagreeing rules.
Neither is adopted. Values are stored and computed at full precision and rounded on
display only.

## Consequences

Positive:

- The conversion is correct, and **visible in the template** rather than buried in a
  cell whose label disagreed with its contents
- Silent lookup failure is eliminated structurally — a document id cannot be mistyped
- Several standards per run, which is what the work actually requires
- Per-point uncertainty falls out of the same mechanism, at no extra cost
- Any unit pair, including gF/kgF, without a combinatorial matrix
- Historical records stay reproducible across transducer recalibration
- No grammar change to the formula language; `STD_` reuses the validated `ENV_` pattern

Negative and accepted:

- **Coefficients are transcribed by hand from certificates**, so transcription is now
  a controlled risk. Mitigated by displaying the equation beside the inputs, and by a
  suggested independent check of the entered values against the certificate.
- A per-row picker is more clicks than one selection per sheet. Mitigated by a new
  row inheriting the previous row's standard.
- One narrow exception to strict empty semantics (coefficient slots → 0). Must be
  confined to `STD_C*` and covered by a test asserting it does not leak.
- Record documents grow, since each row carries a standard snapshot. Well within
  Firestore's 1 MiB limit at realistic point counts, but worth measuring.
- Does not resolve what happens to certificates already issued under the defective
  formula.

## Rejected alternatives

- **Replicate the workbook's `C·R` for parity.** Rejected: the owner confirmed the
  coefficients are NIMT cubic coefficients, so parity would mean deliberately
  preserving a ~0.30 % error.
- **A built-in `STD_FORCE(reading)` function.** Rejected: hides the conversion, which
  is the exact condition that let the defect persist. It would also break ADR-001's
  rule that functions are pure in their arguments.
- **Three named fields `coeffA/B/C`.** Rejected: an ordered array handles any
  polynomial degree without a schema migration.
- **Keep the 2×2 unit matrix.** Rejected: does not extend to gF/kgF without
  combinatorial growth.
- **Two records, one per direction.** Rejected by the owner in favour of one record
  covering one or both.
- **Reference the live standard rather than snapshotting.** Rejected: recalibration
  would retroactively alter issued certificates.
